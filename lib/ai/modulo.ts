/** Regra comercial por organização. Ausência preserva instalações existentes. */
export function moduloIaEstaLiberado(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  return (settings as Record<string, unknown>).ai_module_enabled !== false;
}

/** Veto comercial permanente: o worker cancela, não repete a chamada. */
export class ModuloIaBloqueadoError extends Error {
  readonly terminal = true;
  constructor() {
    super("O módulo de IA não está contratado para esta organização.");
    this.name = "ai_module_disabled";
  }
}
