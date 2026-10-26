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

Executado em 25/10/2026, com banco local `127.0.0.1:55421`:

- Recorte unitário: 7 arquivos, 284 casos aprovados (etapa no Inbox, enriquecimento/autorização, funil arquivado, campos, eventos oficiais da Meta, mapas e atribuição).
- Controle negativo após checkpoint `33151310b`: reintroduzir uma leitura direta de `crm_stages` causa exatamente 1 falha e 5 aprovações no arquivo de etapa. Restaurado o código, os 6 casos passam.
- Typecheck completo: exit 0.
- ESLint completo: exit 0, 0 erros e 522 avisos no repositório; não representa lint sem avisos.
- `lint-channels`: aprovado. Conferência de fragmentos: aprovada, sem escrever versão.
- Build local de produção: aprovado; controle positivo confirma host local no bundle.
- Playwright `etapa-pela-conversa.spec.ts`: 1 caso aprovado em 29,8 s. Abriu Inbox, moveu via bulk, conferiu atividade no banco e exigência de motivo de perda. Capturas sintéticas renovadas em `evidence/triagem-16set-l12/etapa-*.png`. Origem visível na captura `etapa-03-movido.png`.
- Ambiente E2E registrou fallback local de rate limit por Redis indisponível; não foi prova de integração Redis nem de produção. Nenhuma mensagem externa foi enviada.

Não executados nesta primeira etapa: suíte unitária inteira, suíte completa de invariantes e CI remoto. Não houve alteração de schema/RLS, deploy ou medição de consumo da VPS.

## Segunda etapa — editor único (26/10/2026)

Autorização do usuário: usar somente eventos oficiais. Nenhuma publicação ou implantação autorizada nesta etapa.

Inventário de produção somente leitura em 26/10/2026 13:07 BRT (`begin read only`, limite de 6 s por consulta):

- 4 funis; 3 com regras antigas, totalizando 13 regras. Nenhum critério de qualificação preenchido.
- 3 `Contact`, 3 `QualifiedLead`, 3 `Schedule`, 3 `Purchase` em etapas de ganho e 1 `DisqualifiedLead` em perda.
- Nenhuma regra em `meta_ads_conversion_rules`.
- Livro-razão: 1 compra Meta `sent`, 7 compras `skipped` e 1 erro de cada `Contact`, `QualifiedLead` e `Schedule`. Não é confirmação de todas as tentativas históricas nem de entrega de mensagens.

Decisão implementada localmente:

- O editor antigo não grava mais mapas que o consumidor atual ignora. Uma aba antiga recebe `validation_failed`, em vez de falso sucesso.
- Regras e marco antigos ficam preservados nos settings e visíveis somente para consulta; critérios continuam editáveis separadamente.
- O editor oficial é o único caminho de gravação. O aproveitamento de regras antigas é apenas um rascunho por gesto humano: somente nome oficial idêntico, sem exigência de valor, etapa aberta e sem regra oficial anterior. Regra desligada explicitamente não é reativada.
- `Contact`, `Schedule`, `DisqualifiedLead` e nomes livres não são traduzidos por suposição. A equipe revisa substitutos no editor oficial e salva. Nenhum backfill, envio ou ativação automática.
- Nenhuma mudança no consumidor, credencial, ledger ou chave de `Purchase`: a compra enviada não é migrada nem reaberta. O reaproveitamento não faz requisições de envio.

Checklist complementar: entrada = settings do funil autorizado; saída = rascunho no editor oficial e `salvarRegrasDeConversaoMeta`; auditoria existente dessa ação permanece; superfície = Configurações > Conversões; falha = toast sem falso sucesso; anti-morte = retries oficiais sem alteração; continuidade = critérios para `suggestQualification` mantidos; retorno = avisos na tela e Histórico oficiais; mapa `eventos-meta-funil.architecture.json` atualizado. Núcleo, sem novo módulo ou dependência paga.

Validação da segunda etapa: em execução; resultados finais devem ser registrados antes de declarar prontidão. Produção permanece intocada.
