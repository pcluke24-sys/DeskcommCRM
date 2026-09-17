import type { CookieOptions } from "@supabase/ssr";

/** Só o verificador descartável acompanha o GET do e-mail; a sessão fica Strict. */
export function authCookieOptions(name: string, options: CookieOptions): CookieOptions {
  return name.endsWith("-code-verifier") ? { ...options, sameSite: "lax" } : options;
}
