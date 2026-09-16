import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  agrupamentosDeAtribuicao,
  type HistoricoDeAtribuicao,
  type HistoricoDoFunil,
} from "@/lib/reports/historico-do-funil";

export const dynamic = "force-dynamic";
const schema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    pipeline_id: z.uuid().optional(),
    group_by: z.enum(agrupamentosDeAtribuicao).optional(),
  })
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
    { message: "Selecione um período válido de até 366 dias." },
  );

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "reports" });
  if (!authz.ok) return authz.response;
  const q = req.nextUrl.searchParams;
  const parsed = schema.safeParse({
    from: q.get("from"),
    to: q.get("to"),
    pipeline_id: q.get("pipeline_id") ?? undefined,
    group_by: q.get("group_by") ?? undefined,
  });
  if (!parsed.success)
    return fail("validation_failed", "Selecione datas válidas (máximo de 366 dias).", 422, {
      requestId,
    });
  const db = await createClient();
  const { data: pipelines, error: pe } = await db
    .from("crm_pipelines")
    .select("id, name, is_default")
    .eq("organization_id", authz.org.orgId)
    .order("position");
  if (pe) return fail("internal_error", "Não foi possível carregar os funis.", 500, { requestId });
  const pipeline = parsed.data.pipeline_id
    ? pipelines?.find((p) => p.id === parsed.data.pipeline_id)
    : (pipelines?.find((p) => p.is_default) ?? pipelines?.[0]);
  if (!pipeline && parsed.data.pipeline_id)
    return fail("validation_failed", "Funil indisponível nesta empresa.", 422, { requestId });
  if (!pipeline) return ok({ pipelines: [], pipeline: null, report: null }, { requestId });
  if (parsed.data.group_by) {
    const { data, error } = await db.rpc("fn_funnel_attribution_history", {
      p_org: authz.org.orgId,
      p_pipeline: pipeline.id,
      p_from: parsed.data.from,
      p_to: parsed.data.to,
      p_group_by: parsed.data.group_by,
    });
    if (error)
      return fail(
        "internal_error",
        "Não foi possível carregar a atribuição do funil. Tente novamente.",
        500,
        { requestId },
      );
    return ok(
      {
        pipelines,
        pipeline,
        attribution: data as unknown as HistoricoDeAtribuicao,
        window: { from: parsed.data.from, to: parsed.data.to },
      },
      { requestId },
    );
  }
  const { data, error } = await db.rpc("fn_funnel_history", {
    p_org: authz.org.orgId,
    p_pipeline: pipeline.id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  if (error)
    return fail(
      "internal_error",
      "Não foi possível carregar o histórico do funil. Tente novamente.",
      500,
      { requestId },
    );
  return ok(
    {
      pipelines,
      pipeline,
      report: data as unknown as HistoricoDoFunil,
      window: { from: parsed.data.from, to: parsed.data.to },
    },
    { requestId },
  );
}
