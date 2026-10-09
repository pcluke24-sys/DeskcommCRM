/** Falha da dependência não é prova de sessão inválida. Nunca libera acesso. */
export function authTemFalhaTransitoria(
  error: { name?: string; status?: number } | null | undefined,
): boolean {
  return (
    !!error &&
    (error.name === "AuthRetryableFetchError" ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500))
  );
}

export class AuthIndisponivelError extends Error {
  constructor() {
    super("Não foi possível verificar sua sessão. Tente novamente em instantes.");
    this.name = "AuthIndisponivelError";
  }
}
