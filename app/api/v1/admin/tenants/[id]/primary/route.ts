import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAdminEscrita, falhaDaEscritaDePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";

/** Seleção única; RPC revalida dono e serializa contra exclusões. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const path = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!path.success)
    return fail("validation_failed", "Identificador inválido.", 400, { requestId });
  let ctx: Awaited<ReturnType<typeof requirePlatformAdminEscrita>>;
  try {
    ctx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }
  const denied = await requireSupportWrite(path.data);
  if (denied) return denied;
  const body = z
    .object({ confirmation: z.literal(true) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return fail("validation_failed", "Confirme a organização principal.", 400, { requestId });
  const { data, error } = await createAdminClient().rpc("fn_set_primary_organization", {
    p_org: path.data,
    p_actor: ctx.user.id,
    p_request_id: requestId,
  });
  if (error) {
    if (error.code === "42501") return fail("forbidden", error.message, 403, { requestId });
    if (error.code === "P0001") return fail("state_conflict", error.message, 409, { requestId });
    return fail("internal_error", "Não foi possível salvar a organização principal.", 500, {
      requestId,
    });
  }
  return ok(data, { requestId });
}
