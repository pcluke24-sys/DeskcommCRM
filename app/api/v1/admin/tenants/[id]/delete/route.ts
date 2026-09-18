import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";

const input = z.object({
  confirmation: z.string().min(1).max(200),
  reason: z.string().trim().min(10).max(500),
});

/** Exclusão atômica; o banco revalida dono, suspensão e confirmação sob lock. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const path = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!path.success)
    return fail("validation_failed", "Identificador inválido.", 400, { requestId });
  let ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    ctx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Administrador da plataforma obrigatório.", 403, { requestId });
  }
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });
  const denied = await requireSupportWrite(path.data);
  if (denied) return denied;
  if (ctx.platformAdmin.scope !== "full")
    return fail("forbidden", "Acesso de suporte não permite excluir tenants.", 403, { requestId });
  const body = input.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return fail("validation_failed", "Confirme o identificador e informe o motivo.", 400, {
      requestId,
    });
  const { data, error } = await createAdminClient().rpc("fn_delete_suspended_tenant", {
    p_org: path.data,
    p_actor: ctx.user.id,
    p_confirmation: body.data.confirmation,
    p_reason: body.data.reason,
    p_request_id: requestId,
  });
  if (error) {
    if (error.code === "42501") return fail("forbidden", error.message, 403, { requestId });
    if (error.code === "P0002") return fail("not_found", error.message, 404, { requestId });
    if (error.code === "P0001") return fail("state_conflict", error.message, 409, { requestId });
    if (error.code === "22023") return fail("validation_failed", error.message, 400, { requestId });
    return fail(
      "internal_error",
      "Não foi possível excluir. Nenhum dado foi removido; tente novamente.",
      500,
      { requestId },
    );
  }
  return ok(data, { requestId });
}
