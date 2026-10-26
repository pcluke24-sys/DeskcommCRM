import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CriteriosDoFunil } from "@/app/app/settings/conversoes/_funnel-events";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { RegrasDeConversaoMeta } from "@/app/app/settings/conversoes/_regrasMeta";
import { salvarRegrasDeConversaoMeta } from "@/app/actions/settings/salvarRegrasDeConversaoMeta";

vi.mock("@/app/actions/settings/updatePipelineConfig", () => ({ updatePipelineConfig: vi.fn() }));
vi.mock("@/app/actions/settings/salvarRegrasDeConversaoMeta", () => ({
  salvarRegrasDeConversaoMeta: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const funil = {
  id: "funil-1",
  name: "Funil de teste",
  stages: [{ id: "etapa-1", name: "Qualificação", position: 1 }],
  rules: {
    "etapa-1": { event_name: "QualifiedLead", requires_value: false },
    "etapa-antiga": { event_name: "Schedule", requires_value: true },
  },
  qualifiedDescription: "Critério anterior",
  disqualifiedDescription: "Fora da região",
};

beforeEach(() => {
  vi.mocked(updatePipelineConfig).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(salvarRegrasDeConversaoMeta).mockReset().mockResolvedValue({ ok: true });
});

describe("um único editor de eventos da Meta", () => {
  it("preserva regras antigas visíveis sem controles de edição nem ativação", () => {
    render(<CriteriosDoFunil funis={[funil]} idioma="pt-BR" />);
    const antigas = screen.getByTestId("regras-meta-antigas");
    expect(within(antigas).getByText("QualifiedLead")).toBeTruthy();
    expect(within(antigas).getByText(/Schedule/)).toBeTruthy();
    expect(within(antigas).getByText(/etapa-antiga/)).toBeTruthy();
    expect(within(antigas).queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(updatePipelineConfig).not.toHaveBeenCalled();
  });

  it("salva somente critérios, nunca substitui regras ou marco de ativação", async () => {
    render(<CriteriosDoFunil funis={[funil]} idioma="pt-BR" />);
    const user = userEvent.setup();
    const campo = screen.getByLabelText("O que é um lead qualificado?");
    await user.clear(campo);
    await user.type(campo, "Orçamento confirmado");
    await user.click(screen.getByRole("button", { name: "Salvar critérios" }));
    expect(updatePipelineConfig).toHaveBeenCalledExactlyOnceWith("funil-1", {
      qualification_policy: {
        qualified_description: "Orçamento confirmado",
        disqualified_description: "Fora da região",
      },
    });
  });

  it("não mostra seção legada numa instalação sem regras antigas", () => {
    render(<CriteriosDoFunil funis={[{ ...funil, rules: {} }]} idioma="pt-BR" />);
    expect(screen.queryByTestId("regras-meta-antigas")).toBeNull();
    expect(screen.getByLabelText("O que é um lead qualificado?")).toBeTruthy();
  });

  it("aproveita apenas nome idêntico sem valor, como rascunho até salvar", async () => {
    const etapas = ["qualificado", "agenda", "valor"].map((id) => ({
      id,
      nome: id,
      funil: "Teste",
      primeira: false,
    }));
    render(
      <RegrasDeConversaoMeta
        etapas={etapas}
        regras={[]}
        idioma="pt-BR"
        regrasAntigas={{
          qualificado: { event_name: "QualifiedLead", requires_value: false },
          agenda: { event_name: "Schedule", requires_value: false },
          valor: { event_name: "QualifiedLead", requires_value: true },
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Aproveitar regras antigas compatíveis" }));
    expect(salvarRegrasDeConversaoMeta).not.toHaveBeenCalled();
    expect(screen.getAllByRole("switch").map((el) => el.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    await user.click(screen.getByRole("button", { name: "Salvar regras" }));
    expect(salvarRegrasDeConversaoMeta).toHaveBeenCalledExactlyOnceWith([
      { stage_id: "qualificado", enabled: true, meta_event: "QualifiedLead" },
      { stage_id: "agenda", enabled: false, meta_event: "LeadSubmitted" },
      { stage_id: "valor", enabled: false, meta_event: "LeadSubmitted" },
    ]);
  });

  it("não reativa uma regra oficial desligada nem troca uma existente", () => {
    render(
      <RegrasDeConversaoMeta
        etapas={[{ id: "qualificado", nome: "Qualificado", funil: "Teste", primeira: false }]}
        regras={[
          {
            id: "regra-1",
            stageId: "qualificado",
            eventName: "MetaEtapa:qualificado",
            metaEvent: "ViewContent",
            enabled: false,
            configuredAt: "2026-10-01T00:00:00Z",
          },
        ]}
        idioma="pt-BR"
        regrasAntigas={{ qualificado: { event_name: "QualifiedLead" } }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Aproveitar regras antigas compatíveis" }),
    ).toBeNull();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(salvarRegrasDeConversaoMeta).not.toHaveBeenCalled();
  });
});
