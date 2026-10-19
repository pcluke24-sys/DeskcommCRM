import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/auth/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/app/pipelines/p",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    data: { pipeline: { name: "Funil", settings: {}, vocabulary: null }, stages: [], leads: [] },
    isLoading: false,
    error: null,
    pulses: new Map(),
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
vi.mock("@/components/kanban/KanbanBoard", () => ({
  KanbanBoard: ({ podeOperar }: { podeOperar: boolean }) => (
    <div data-testid="board" data-pode-operar={String(podeOperar)} />
  ),
}));
vi.mock("@/components/kanban/FilterBar", () => ({ FilterBar: () => <p>Filtros de consulta</p> }));
vi.mock("@/components/kanban/BulkActionBar", () => ({
  BulkActionBar: () => <div data-testid="bulk-actions" />,
}));
vi.mock("@/components/kanban/NewLeadDialog", () => ({
  NewLeadDialog: () => <div data-testid="new-lead-dialog" />,
}));
import { PipelinePageClient } from "@/app/app/pipelines/[id]/_client";

describe("quadro em somente leitura", () => {
  it("viewer consulta sem criação, lote ou arrasto", () => {
    render(<PipelinePageClient pipelineId="p" initialName="Funil" role="viewer" />);
    expect(screen.getByRole("heading", { name: "Funil" })).toBeInTheDocument();
    expect(screen.getByText("Filtros de consulta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo Lead" })).toBeNull();
    expect(screen.queryByTestId("new-lead-dialog")).toBeNull();
    expect(screen.queryByTestId("bulk-actions")).toBeNull();
    expect(screen.getByTestId("board")).toHaveAttribute("data-pode-operar", "false");
  });
  for (const role of ["agent", "manager", "admin"] satisfies Role[]) {
    it(`preserva a operação normal do ${role}`, () => {
      render(<PipelinePageClient pipelineId="p" initialName="Funil" role={role} />);
      expect(screen.getByRole("button", { name: "Novo Lead" })).toBeEnabled();
      expect(screen.getByTestId("bulk-actions")).toBeInTheDocument();
      expect(screen.getByTestId("board")).toHaveAttribute("data-pode-operar", "true");
    });
  }
});
