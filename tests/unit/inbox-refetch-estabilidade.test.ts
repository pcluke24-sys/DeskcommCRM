import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  channel: vi.fn(),
  query: vi.fn(),
  fetching: vi.fn(() => 0),
}));
const qc = vi.hoisted(() => ({} as Record<string, unknown>));
Object.assign(qc, { invalidateQueries: mocks.invalidate, isFetching: mocks.fetching });
vi.mock("@tanstack/react-query", () => ({
  hashKey: (key: unknown) => JSON.stringify(key),
  useQueryClient: () => qc,
  useInfiniteQuery: (options: unknown) => {
    mocks.query(options);
    return {};
  },
}));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: (options: unknown) => {
    mocks.channel(options);
    return { status: "SUBSCRIBED", ultimaEntrega: null };
  },
}));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({ useRefetchDeSeguranca: () => ({}) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { useConversationsRealtime } from "@/hooks/inbox/useConversationsRealtime";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";

describe("Inbox agrupa eventos no caminho real dos hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("agrupa a lista e cancela o timer ao mudar de organização", () => {
    const filters = {};
    const { rerender, unmount } = renderHook(({ org }) => useConversationsRealtime(filters, org), {
      initialProps: { org: "org-a" as string | null },
    });
    const event = mocks.channel.mock.lastCall![0].onChange;
    act(() => {
      for (let n = 0; n < 50; n++) event();
      vi.advanceTimersByTime(650);
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["conversations"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["conversation"] });
    expect(mocks.query.mock.lastCall![0].queryKey).toEqual(["conversations", filters, "org-a"]);
    act(() => event());
    rerender({ org: "org-b" });
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
    rerender({ org: null });
    expect(mocks.query.mock.lastCall![0].enabled).toBe(false);
    unmount();
  });

  it("mensagens não invalidam a lista a cada evento e cancelam ao desmontar", () => {
    const { unmount } = renderHook(() => useMessagesRealtime("conversation-a"));
    const event = mocks.channel.mock.lastCall![0].onChange;
    act(() => {
      for (let n = 0; n < 50; n++) event();
    });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(650));
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ["messages", "conversation-a"],
      exact: true,
    });
    act(() => event());
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);
  });

  it("não reaproveita lista da empresa anterior na troca de organização", () => {
    const filters = { comando: ["aguardando", "automatico"] as const };
    renderHook(() => useConversationsRealtime(filters, "org-b"));
    const options = mocks.query.mock.lastCall![0];
    const data = { pages: [{ conversations: [{ id: "da-org-a" }] }] };
    expect(options.placeholderData(data, {
      queryKey: ["conversations", { comando: ["aguardando"] }, "org-a"],
    })).toBeUndefined();
    expect(options.placeholderData(data, {
      queryKey: ["conversations", { comando: ["aguardando"] }, "org-b"],
    })).toBe(data);
  });
});
