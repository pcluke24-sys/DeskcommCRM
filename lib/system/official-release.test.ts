import { afterEach, describe, expect, it, vi } from "vitest";

import {
  limparCacheDeVersaoOficialParaTeste,
  versaoOficialMaisRecente,
  versaoPublicadaMaisNova,
} from "./official-release";

afterEach(() => {
  limparCacheDeVersaoOficialParaTeste();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("release oficial informativa", () => {
  it("compara semver sem confundir 1.10 com 1.9", () => {
    expect(versaoPublicadaMaisNova("1.10.0", "1.9.9")).toBe(true);
    expect(versaoPublicadaMaisNova("1.49.1", "1.49.1")).toBe(false);
    expect(versaoPublicadaMaisNova("1.49.0", "1.49.1")).toBe(false);
    expect(versaoPublicadaMaisNova("1.51.0", "70b793ff2")).toBe(false);
  });

  it("lê a tag mais recente sem transformá-la em alvo de instalação", async () => {
    vi.stubEnv("UPSTREAM_RELEASE_REPOSITORY", "empresa/projeto-oficial");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ tag_name: "v1.51.0" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(versaoOficialMaisRecente()).resolves.toBe("1.51.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/empresa/projeto-oficial/releases/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("falha fechado quando a consulta externa não responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponível", { status: 503 })));
    await expect(versaoOficialMaisRecente()).resolves.toBeNull();
  });
});
