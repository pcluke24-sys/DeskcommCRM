import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { comandosDaFila } from "@/lib/inbox/comando-da-conversa";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "cliente-sem-ia", ai_module_enabled: false } }),
  usePermission: () => true,
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get } }));

it("sem IA contratada não consulta rota bloqueada e inclui conversas sem atendente na fila", () => {
  const client = new QueryClient();
  const { result, unmount } = renderHook(() => useAutomaticoAtivo(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  expect(result.current.data).toBe(false);
  expect(comandosDaFila(result.current.data)).toEqual(["aguardando", "automatico"]);
  expect(h.get).not.toHaveBeenCalled();
  unmount();
  client.clear();
});
