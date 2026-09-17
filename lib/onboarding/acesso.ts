export function podeConfigurarOrganizacao(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function deveAbrirImplantacao(input: {
  role: string; completed: boolean; support: boolean; platform: boolean; settings: unknown;
}): boolean {
  const settings = input.settings as Record<string, unknown> | null;
  return !input.completed && !input.support && podeConfigurarOrganizacao(input.role)
    && (settings?.setup_mode !== "agency" || input.platform);
}
