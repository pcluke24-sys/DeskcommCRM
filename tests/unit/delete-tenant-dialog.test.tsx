import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { remove, replace } = vi.hoisted(() => ({ remove: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { delete: remove } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { DeleteTenantDialog } from "@/components/admin/tenants/DeleteTenantDialog";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show() {
  render(<DeleteTenantDialog open onClose={vi.fn()} organizationId="tenant-test" slug="cliente-teste" />);
  return screen.getByRole("button", { name: "Excluir definitivamente" }) as HTMLButtonElement;
}
describe("confirmação explícita de exclusão", () => {
  it("não habilita confirmação sem identificador exato e motivo", () => {
    const button = show();
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Digite cliente-teste para confirmar"), { target: { value: "outro-cliente" } });
    fireEvent.change(screen.getByLabelText(/Motivo da exclusão/), { target: { value: "Encerramento do contrato" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Digite cliente-teste para confirmar"), { target: { value: "cliente-teste" } });
    expect(button.disabled).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
  it("mostra bloqueio do servidor e mantém a pessoa no diálogo", async () => {
    remove.mockRejectedValue(new Error("Suspenda o tenant antes de excluir."));
    const button = show();
    fireEvent.change(screen.getByLabelText("Digite cliente-teste para confirmar"), { target: { value: "cliente-teste" } });
    fireEvent.change(screen.getByLabelText(/Motivo da exclusão/), { target: { value: "Encerramento do contrato" } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Suspenda"));
    expect(replace).not.toHaveBeenCalled();
  });
});
