import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./auth-cookie";
describe("PKCE sem relaxar a sessão", () => {
  it("o verificador acompanha o link do e-mail", () => {
    expect(authCookieOptions("sb-deskcomm-auth-code-verifier", {sameSite: "strict", httpOnly: true, secure: true}))
      .toEqual({sameSite: "lax", httpOnly: true, secure: true});
  });
  it.each(["sb-deskcomm-auth", "sb-deskcomm-auth.0", "active_org"])("mantém Strict para %s", name => {
    expect(authCookieOptions(name, {sameSite: "strict"}).sameSite).toBe("strict");
  });
});
