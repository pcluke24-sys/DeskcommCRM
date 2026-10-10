import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { markConversationUnreadHandler } from "../../_handler";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/** POST — marca a conversa como pendente de leitura para o atendente. */
export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  try {
    const conv = await markConversationUnreadHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      id,
    );
    return ok(conv, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}
