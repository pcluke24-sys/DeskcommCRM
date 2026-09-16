# Histórico do funil — contrato do fork

Coleta prospectiva pela migration 0261. Não há backfill. Duas tabelas adicionais, sem alteração de campos ou fluxos existentes: `crm_funnel_tracking` registra o início por organização; `crm_funnel_entries` recebe criação, entrada de etapa e mudança de desfecho por trigger transacional. Não faz HTTP nem interfere nos eventos Meta.

Régua: janela UTC [from,to), selecionada por datas inclusive no fuso do navegador. Cada etapa conta leads distintos; entradas repetidas aparecem separadas. Taxa de avanço usa os mesmos leads entrando depois na próxima etapa não perdida dentro da mesma janela, não a divisão de totais independentes. Não infere etapas saltadas. Ganho/perda conta desfechos observados, não estado atual; reabertura permite os dois. Mensagens não são contadas: novos leads recebidos são cards criados.

RLS: leitura via sessão, organização ativa explícita e visibilidade do lead (incluindo escopo own). Escrita direta vedada aos papéis REST. Exclusão de lead/funil/etapa/organização remove os registros ligados por FK; anonimização mantém contagens. Nomes de etapas usam a configuração atual. A coleta permanece no mesmo banco Supabase; não requer outro banco.

Living System Checklist: entrada = trigger crm_leads; saída = fn_funnel_history → API → HistoricoClient e CSV; registro = ledger prospectivo; tela = /app/funnel-history; porta = hub Análise no catálogo; anti-morte = não aplicável à leitura; configuração = filtros visíveis; continuidade IA/humano = coleta de ambos sem alterar atendimento; erro = aviso e botão Atualizar, sem automação decisória; mapa = historico-do-funil.architecture.json.
