# Simplificação das sobreposições do fork

Base: fork/main `be200a4c5baca059e2a9afcacb1ab3aabb69f6c8` (personalizada 1.78.1).
Destino: núcleo. São caminhos já distribuídos, sem módulo opcional novo.

## Confirmado no código

- O Inbox já usa `EtapaDoNegocio` e `useBulkAction`, provenientes da implementação oficial. O seletor customizado `MoverLeadPeloInbox` não existe mais.
- `crm-summary` ainda consultava `crm_stages` separadamente e devolvia `stages`, sem consumidor no painel atual. A consulta extra foi removida. `leads[].etapas_do_funil` continua vindo do embed, com filtro de arquivamento e ordem preservados. Isto elimina uma chamada PostgREST por resumo com leads, não uma consulta por mensagem.
- `configuracaoDoFunil` em `envio.handler.ts` era chamada somente pelo teste co-localizado. Removidos o parser morto, sua exportação de teste e esses dois casos; os testes do consumidor real oficial permanecem.
- Configurações antigas da Meta em `crm_pipelines.settings.meta_conversion_rules` NÃO foram apagadas nem convertidas. O editor legado também guarda critérios de qualificação usados pela sugestão humana.

## Limite desta etapa

Não é seguro substituir automaticamente todas as regras antigas pelas oficiais: a configuração antiga aceita nomes livres e eventos de perda; a oficial usa uma lista fechada e etapas abertas. Além disso, a deduplicação oficial usa `MetaEtapa:<stage_id>`, diferente da chave histórica por nome do evento. Nenhuma migração de dados ou ativação de envios foi feita nesta etapa.

A retirada integral do editor legado requer inventário das regras existentes, tratamento dos nomes sem equivalente e prova de que a migração não duplica conversões. Reduzir código morto não prova redução de RAM do WAHA nem resolve por si só a indisponibilidade do banco.

## Living System Checklist

- Entrada: GET autenticado `contacts/[id]/crm-summary`, com autorização do contato pela RLS e filtro explícito da organização.
- Saída/tela: `CRMSidePanel` recebe origem, etapas e campos; `EtapaDoNegocio` continua usando `/leads/bulk`.
- Registros: leitura não cria auditoria; movimento mantém atividade, evento e auditoria da rota oficial, sem mudança de contrato de escrita.
- Porta: Inbox existente, sem nova navegação.
- Anti-morte: leitura não decide próximo passo; demandas e ações existentes não foram alteradas.
- Configuração/continuidade: campos e critérios do funil preservados; nenhum envio ou ação de IA alterado.
- Retorno: erros reais de leitura continuam retornando erro, sem lista vazia artificial; a consulta redundante deixa de ser um ponto adicional de falha.
- Mapa: `origem-e-movimento-no-inbox.architecture.json` atualizado.
- Graphify indisponível e `graphify-out/` ausente neste checkout; consumidores localizados por busca no código.

## Validação

O teste de etapa verifica a ausência da segunda consulta, as etapas ativas ordenadas e a preservação da origem. Os resultados executados e as limitações devem acompanhar o checkpoint; não representa teste de produção.
