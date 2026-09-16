export interface HistoricoDoFunil {
  enabled_since: string | null;
  totals: { leads: number; received: number; won: number; lost: number };
  stages: Array<{
    id: string;
    name: string;
    leads: number;
    entries: number;
    is_won: boolean;
    is_lost: boolean;
    next_stage_id: string | null;
    advanced: number | null;
    advance_rate: number | null;
  }>;
}

/** CSV agregado, sem dados pessoais; evita fórmulas em nomes configuráveis. */
function celula(valor: string | number | null): string {
  const texto = valor === null ? "" : String(valor);
  return `"${(/^[=+@\-\t\r]/.test(texto) ? "'" + texto : texto).replaceAll('"', '""')}"`;
}

export function csvDoFunil(
  relatorio: HistoricoDoFunil,
  funil: string,
  de: string,
  ate: string,
): string {
  const linhas: Array<Array<string | number | null>> = [
    [
      "Funil",
      "De (inclusivo)",
      "Até (exclusivo)",
      "Início da coleta",
      "Etapa",
      "Leads únicos",
      "Entradas",
      "Próxima etapa",
      "Avançaram",
      "Taxa de avanço (%)",
    ],
    ...relatorio.stages.map((s) => [
      funil,
      de,
      ate,
      relatorio.enabled_since,
      s.name,
      s.leads,
      s.entries,
      relatorio.stages.find((n) => n.id === s.next_stage_id)?.name ?? null,
      s.advanced,
      s.advance_rate,
    ]),
  ];
  return "\uFEFF" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
}
