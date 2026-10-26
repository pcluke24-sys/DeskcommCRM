import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
vi.mock("@playwright/test", () => ({ expect: vi.fn() }));

vi.mock("../e2e/utils/totp", () => ({
  generateTotp: () => "000000",
  msUntilNextTotpWindow: () => 10_000,
}));
beforeEach(() => vi.resetModules());

function pagina(redireciona: boolean, inicial = "http://localhost/login/mfa") {
  let destino = inicial;
  const campo = { waitFor: vi.fn(), isDisabled: async () => false, click: vi.fn() };
  const page = {
    url: () => destino,
    locator: () => campo,
    keyboard: { type: vi.fn() },
    waitForURL: vi.fn().mockRejectedValue(new Error("redirecionamento ainda pendente")),
    waitForTimeout: async () => {
      if (redireciona) destino = "http://localhost/app/inbox";
    },
  };
  return { page, campo };
}

describe("helper MFA reconhece conclusão tardia, sem aceitar falha", () => {
  it("não digita um segundo código se o login concluiu durante a espera", async () => {
    const { tentarMfa } = await import("../e2e/helpers/login-admin");
    const { page, campo } = pagina(true);
    expect(await tentarMfa(page as unknown as Page, "segredo-sintetico", 2)).toBe(true);
    expect(campo.waitFor).toHaveBeenCalledTimes(1);
    expect(page.keyboard.type).toHaveBeenCalledTimes(1);
  });
  it("continua recusando quando a página nunca sai do MFA", async () => {
    const { tentarMfa } = await import("../e2e/helpers/login-admin");
    const { page } = pagina(false);
    expect(await tentarMfa(page as unknown as Page, "segredo-sintetico", 1)).toBe(false);
  });
  it("não confunde o destino na query com um login concluído", async () => {
    const { tentarMfa } = await import("../e2e/helpers/login-admin");
    const { page } = pagina(false, "http://localhost/login/mfa?next=/app/inbox");
    expect(await tentarMfa(page as unknown as Page, "segredo-sintetico", 1)).toBe(false);
  });
});
