import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Prefixo exato é defesa independente da constraint SQL; nunca remove arquivos compartilhados. */
export function deletionPathAllowed(organizationId: string, path: string): boolean {
  return (
    /^[0-9a-f-]{36}$/i.test(organizationId) &&
    path.startsWith(`${organizationId}/`) &&
    !path.split("/").some((part) => part === "." || part === "..") &&
    !path.includes("\\")
  );
}

/** Fila da plataforma sem FK: arquivos permanecem alcançáveis após o cascade. */
export async function drainTenantDeletionStorage(limit = 50): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_tenant_deletion_storage")
    .select("id, deleted_organization_id, bucket, object_path, attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", 10)
    .order("created_at")
    .limit(limit);
  if (error) {
    logger.error("[tenant-deletion] Não foi possível ler a fila de arquivos.", {
      error_message: error.message,
    });
    return 0;
  }
  let removed = 0;
  for (const row of data ?? []) {
    const allowed = deletionPathAllowed(row.deleted_organization_id, row.object_path);
    const result = allowed
      ? await admin.storage.from(row.bucket).remove([row.object_path])
      : { error: { message: "Caminho fora do tenant; remoção bloqueada." } };
    const failed = !!result.error;
    const { error: updateError } = await admin
      .from("platform_tenant_deletion_storage")
      .update({
        status: failed ? "failed" : "deleted",
        attempts: row.attempts + 1,
        processed_at: new Date().toISOString(),
        error_message: failed ? "Falha ao remover arquivo; verificar a fila da plataforma." : null,
      })
      .eq("id", row.id)
      .eq("deleted_organization_id", row.deleted_organization_id);
    if (failed || updateError)
      logger.error("[tenant-deletion] Limpeza de arquivos requer nova tentativa.", {
        queue_id: row.id,
      });
    if (!failed && !updateError) removed++;
  }
  return removed;
}
