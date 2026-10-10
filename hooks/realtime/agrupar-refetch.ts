/** Janela fixa: rajadas não geram uma busca por evento nem adiam para sempre. */
export function agruparRefetch(refetch: () => void, janelaMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    solicitar() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        refetch();
      }, janelaMs);
    },
    cancelar() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
