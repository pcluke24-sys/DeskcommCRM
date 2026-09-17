import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/admin/ImpersonateButton", () => ({ ImpersonateButton: () => null }));
vi.mock("@/components/admin/tenants/SuspendDialog", () => ({ SuspendDialog: () => null }));
vi.mock("@/components/admin/tenants/ReactivateDialog", () => ({ ReactivateDialog: () => null }));
vi.mock("@/components/admin/tenants/DeleteTenantDialog", () => ({ DeleteTenantDialog: () => null }));
import { TenantActions } from "@/components/admin/tenants/TenantActions";
afterEach(cleanup);
const props = { organizationId: "cliente", status: "suspended" as const, displayName: "Cliente", aiModuleEnabled: false, slug: "cliente", canDeleteTenant: true };
it("não oferece exclusão sem principal definida", () => {
  render(<TenantActions {...props} />);
  expect(screen.queryByText("Excluir tenant definitivamente")).toBeNull();
  expect(screen.getByText(/Defina sua organização principal/)).toBeTruthy();
});
it("protege a principal mesmo suspensa", () => {
  render(<TenantActions {...props} primaryOrganizationId="cliente" />);
  expect(screen.queryByText("Excluir tenant definitivamente")).toBeNull();
  expect(screen.getByText(/protegida contra exclusão/)).toBeTruthy();
});
it("oferece exclusão para cliente suspenso com outra principal", () => {
  render(<TenantActions {...props} primaryOrganizationId="principal" />);
  expect(screen.getByText("Excluir tenant definitivamente")).toBeTruthy();
});
it("dono pode escolher principal ativa; suporte não vê opção", () => {
  const { rerender } = render(<TenantActions {...props} status="active" />);
  expect(screen.getByText("Definir como minha organização principal")).toBeTruthy();
  rerender(<TenantActions {...props} status="active" canDeleteTenant={false} />);
  expect(screen.queryByText("Definir como minha organização principal")).toBeNull();
});
