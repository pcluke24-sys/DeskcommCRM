import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { baixarComTentativas } = require("../../.github/actions/preparar-registro/baixar.cjs") as {
  baixarComTentativas: (imagem: string, executar: (imagem: string) => void, esperar: (ms: number) => Promise<void>) => Promise<void>;
};
const { comEspelho } = require("../../.github/actions/preparar-registro/configurar.cjs") as {
  comEspelho: (config: Record<string, unknown>) => Record<string, unknown>;
};

describe("cache público de imagens na esteira", () => {
  it("prepara a tag histórica oficial antes do banco sem pular nenhum gate", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const job = ci.slice(ci.indexOf("  invariants-majors:"), ci.indexOf("  invariants:", ci.indexOf("  invariants-majors:")));
    const fetch = "git fetch --no-tags --depth=1 https://github.com/melgarafael/DeskcommCRM.git refs/tags/v1.63.0:refs/tags/v1.63.0";
    expect(job).toContain(fetch);
    expect(job.indexOf(fetch)).toBeLessThan(job.indexOf("run: pnpm test:db"));
    expect(job).toContain('test "$(git rev-parse refs/tags/v1.63.0)" = 093e0656a8c6895659878445018395214ab44561');
    expect(job).toContain("run: pnpm test:db:update");
    expect(job).not.toContain("continue-on-error: true");
  });
  it("recupera download transitório sem repetir um download já bem sucedido", async () => {
    let chamadas = 0;
    const esperas: number[] = [];
    await baixarComTentativas("pgvector/pgvector:pg15", () => {
      chamadas++;
      if (chamadas < 3) throw new Error("timeout do registro");
    }, async (ms) => { esperas.push(ms); });
    expect(chamadas).toBe(3);
    expect(esperas).toEqual([5000, 10000]);
  });
  it("mantém a falha após quatro tentativas, sem aprovar o gate", async () => {
    let chamadas = 0;
    await expect(baixarComTentativas("pgvector/pgvector:pg17", () => {
      chamadas++;
      throw new Error("indisponível");
    }, async () => {})).rejects.toThrow("indisponível");
    expect(chamadas).toBe(4);
  });
  it("não espera nem repete quando o registro responde", async () => {
    let esperas = 0;
    await baixarComTentativas("moby/buildkit:buildx-stable-1", () => {}, async () => { esperas++; });
    expect(esperas).toBe(0);
  });
  it("preserva a configuração existente e prioriza o cache sem duplicá-lo", () => {
    const input = { "log-driver": "json-file", "registry-mirrors": ["https://outro.example"] };
    const result = comEspelho(input);
    expect(result).toEqual({
      "log-driver": "json-file",
      "registry-mirrors": ["https://mirror.gcr.io", "https://outro.example"],
    });
    expect(comEspelho(result)).toEqual(result);
    expect(input["registry-mirrors"]).toEqual(["https://outro.example"]);
  });
  it("recusa configuração malformada sem sobrescrevê-la", () => {
    expect(() => comEspelho({ "registry-mirrors": "invalido" })).toThrow();
  });
  it("não reinicia o Docker de executor persistente e alcança o teste de banco", () => {
    const action = readFileSync(".github/actions/preparar-registro/action.yml", "utf8");
    const guard = action.indexOf('!= "github-hosted"');
    expect(guard).toBeGreaterThan(0);
    expect(action.indexOf("exit 0", guard)).toBeLessThan(
      action.indexOf("sudo systemctl restart docker"),
    );
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const job = ci.slice(
      ci.indexOf("  invariants-majors:"),
      ci.indexOf("  invariants:", ci.indexOf("  invariants-majors:")),
    );
    expect(job).toContain("uses: ./.github/actions/preparar-registro");
  });
  it("configura o mirror em todos os builders sem retirar gates", () => {
    const workflow = readFileSync(".github/workflows/publish-image.yml", "utf8");
    const builders = workflow.match(/uses: docker\/setup-buildx-action@v4/g) ?? [];
    expect(builders.length).toBeGreaterThan(0);
    expect(workflow.match(/mirrors = \["mirror.gcr.io"\]/g)).toHaveLength(builders.length);
    expect(workflow).toContain("  imagens-ok:");
  });
});
