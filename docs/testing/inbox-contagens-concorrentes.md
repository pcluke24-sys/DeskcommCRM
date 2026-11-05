# Contagens concorrentes do Inbox

Destino: núcleo. Leitura comum do Inbox, sem módulo ou integração opcional.

O caminho anterior fazia seis contagens exatas em paralelo, cada uma avaliando o
predicado de visibilidade por conversa. Uma reprodução local com 702 conversas,
três identidades e seis leituras HTTP simultâneas cancelou contagens em oito
segundos (PostgREST, SQLSTATE 57014). Não atribuir por isso todos os incidentes
históricos de uma instalação a essa causa.

## Contrato preservado

`GET /api/v1/conversations/counts` usa o client da sessão e a organização ativa
resolvida no servidor. `fn_inbox_counts` é SECURITY INVOKER: a agregação continua
sob a RLS do chamador e não recebe identidade por parâmetro. Mantém as chaves
fila/unassigned, automatico, mine, all, closed e archived, o vocabulário canônico
de comandos/estados e os filtros de canal, não lidas, etiquetas E/OU, contatos
pessoais e canais desativados. Busca textual segue fora dos badges, como antes.

A policy de SELECT resolve conjuntos de organizações/visibilidade em subconsultas
não correlacionadas. O helper usa fn_user_org_ids e fn_user_role_in_org, sem uma
segunda regra de suporte ou membership. Não há cache entre statements, alteração
de políticas de escrita, aumento de timeout ou client service_role no handler.

## Provas

- `tests/invariants/inbox-contagens-escopo-por-consulta.test.ts`: comparação dos
  IDs com fn_can_view_conversation como oráculo independente da policy nova;
  papéis, visibilidade, revogação, suporte, organização alheia e negação anônima;
  plano com conjuntos resolvidos no máximo uma vez por statement; semântica dos
  badges e etiquetas, incluindo o caso E em caixas distintas.
- `tests/unit/inbox-contagens-rpc.test.ts`: contrato real do handler, uma RPC,
  organização confiável, filtros, erro visível e recusa sem sessão.
- Rodar pelo harness oficial `pnpm test:db`, incluindo o arquivo novo, e repetir
  a carga em banco local com dados sintéticos. O resultado deve distinguir SQL,
  autenticação, rede e renderização; não usar um healthcheck como prova de carga.

Não remover RLS para medir melhoria. Um controle privilegiado serve para localizar
custo, nunca para atender funcionários. Não enviar WhatsApp ou estressar produção
acima do uso real para validar a correção.

## Rodada local de 2026-11-05

Base do fork: `be200a4c5baca059e2a9afcacb1ab3aabb69f6c8`. Dados sintéticos:
702 conversas e 7.002 mensagens; três identidades (manager, agent e viewer).
Leituras alternam lista, badges e histórico, com parada na primeira falha.

Na mesma base Linux da reprodução, limitada a 768 MiB e 2 CPUs, a rota nova
completou as quatro fases:

| Requisições simultâneas | Leituras | HTTP 200 | p95 |
| --- | ---: | ---: | ---: |
| 3 | 30 | 30 | 360 ms |
| 6 | 60 | 60 | 427 ms |
| 12 | 120 | 120 | 810 ms |
| 24 | 240 | 240 | 1.788 ms |

São três usuários reaproveitados pelos executores, não 24 funcionários distintos.
A reprodução anterior parou na fase de seis simultâneas: 14 leituras, três 500,
p95 de 10.964 ms; não completou as fases maiores. Host e cache variam entre
rodadas, portanto não tratar essa diferença como garantia de latência em produção.

Observação contínua adicional: três executores por 180 segundos, 712 leituras,
todas 200; p95 de 354 ms e máximo de 923 ms. Nenhum OOM/OOM kill no container.
Prova de tela local: cada um dos três perfis abriu três conversas e renderizou
as mensagens sintéticas, sem 5xx nessas aberturas.

Controle SQL alternado, no MESMO banco/usuário/dados, sem carga paralela:
três pares de EXPLAIN ANALYZE de count com RLS, alternando a policy original e a
nova dentro de transações sempre revertidas. Medianas: 3.116,769 ms original e
10,165 ms nova. Nenhum service_role nesse controle; o teste de equivalência de
IDs continua sendo a prova separada de autorização.

O container comparativo usa o build local sobre as dependências da imagem base,
não uma imagem de release. Os vínculos de módulos externos Windows/Linux foram
adaptados somente na bancada, conferindo versões e hash do entrypoint; o processo
rodou como nextjs. Publicação exige os gates do novo HEAD e build Linux da imagem.

Verificações locais: 89 invariantes em cinco arquivos, 65 testes unitários
direcionados, lint sem erros/avisos, typecheck completo e next build aprovados.
A suíte completa de invariantes foi interrompida sob disputa de memória local;
não é declarada verde. Seus três casos que haviam falhado passaram isoladamente.
Uma varredura unitária também excedeu seu timeout de 15 s na corrida concorrente
e passou isolada mantendo o mesmo limite.

Não medido: um dia de uso, envio/recepção WhatsApp, anexos, falhas de provedor ou
limite máximo de clientes. A rodada valida este gargalo; não demonstra ausência
definitiva de toda intermitência.

## Living System Checklist

Entrada: sessão, organização ativa e filtros de InboxLayout. Saída: badges de
InboxFilters pela rota counts. Porta: Atendimento > Inbox, já existente. Leitura
pura não emite atividade/auditoria nem muda IA/humano. Falhas seguem pelo fail da
API e estado de erro/refetch do consumidor; não viram contagens zero. A nova RPC
e seu helper pertencem ao caminho existente de leitura; nenhuma tela, configuração
ou automação nova. O retorno de validação é a comparação de autorização e carga
reproduzível, que impede publicar uma otimização que altere o escopo dos usuários.
