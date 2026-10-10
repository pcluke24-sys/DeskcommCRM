import { afterEach, describe, expect, it, vi } from "vitest";
import { agruparRefetch } from "./agrupar-refetch";

afterEach(() => vi.useRealTimers());
describe("refetch agrupado em janela fixa", () => {
  it("50 eventos fazem uma busca, sem perder o evento final", () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const grupo = agruparRefetch(refetch, 500);
    for (let i = 0; i < 50; i++) grupo.solicitar();
    vi.advanceTimersByTime(499);
    expect(refetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    grupo.solicitar();
    vi.advanceTimersByTime(500);
    expect(refetch).toHaveBeenCalledTimes(2);
  });
  it("tráfego contínuo não impede atualizar a lista", () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const grupo = agruparRefetch(refetch, 500);
    for (let i = 0; i < 10; i++) {
      grupo.solicitar();
      vi.advanceTimersByTime(100);
    }
    expect(refetch).toHaveBeenCalledTimes(2);
  });
  it("desmontar ou trocar organização cancela a busca antiga", () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const grupo = agruparRefetch(refetch, 500);
    grupo.solicitar();
    grupo.cancelar();
    vi.advanceTimersByTime(500);
    expect(refetch).not.toHaveBeenCalled();
  });
});
