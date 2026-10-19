import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ readonly: true, mutate: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      is_platform_admin: false,
      support: { access_mode: h.readonly ? "support_readonly" : "full" },
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: h.mutate }),
}));
import { useMarkAsRead } from "./useMarkAsRead";
beforeEach(() => {
  vi.useFakeTimers();
  h.mutate.mockClear();
  h.readonly = true;
});
afterEach(() => vi.useRealTimers());
it("observador não marca lida ao abrir ou trocar conversa", () => {
  const hook = renderHook(({ id }) => useMarkAsRead(id, 2), { initialProps: { id: "a" } });
  act(() => vi.advanceTimersByTime(2000));
  hook.rerender({ id: "b" });
  act(() => vi.advanceTimersByTime(2000));
  expect(h.mutate).not.toHaveBeenCalled();
});
it("controle: atendimento full continua marcando após foco", () => {
  h.readonly = false;
  renderHook(() => useMarkAsRead("a", 2));
  act(() => vi.advanceTimersByTime(2000));
  expect(h.mutate).toHaveBeenCalledWith("a");
});
