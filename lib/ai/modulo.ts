/** Regra comercial por organização. Ausência preserva instalações existentes. */
export function moduloIaEstaLiberado(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  return (settings as Record<string, unknown>).ai_module_enabled !== false;
}
