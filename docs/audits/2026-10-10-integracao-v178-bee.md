# Integração v1.78.0 — validação local do fork Bee

## Escopo e limites

PR11, branch `integrate/upstream-v1.78.0-attendant-inbox`, HEAD remoto
`5fce2ca04b6a0ec5d909040e0fef37c9d8e8cda1`. Merge local da main de estabilidade
`9df8144e072f16b9255854b18522572177071fab` ainda sem commit.
Produção v1.60.4 não alterada. Esta evidência não autoriza publicação ou deploy.

## Correções da integração

- Auth indisponível preserva erro recuperável, sem confundir falha remota com sessão inválida.
- Realtime compartilha recarga, espera consulta em andamento e não reaproveita cache de outra organização.
- Agent/viewer não são enviados ao onboarding administrativo. Usuário confirmado sem organização recebe recuperação; acesso revogado mantém sua recusa específica.
- Escritas administrativas usam a guarda canônica de escopo gravável, sem alterar a guarda de leitura.
- Bloqueio de IA por `module_settings` restaurado na resolução de credenciais.
- Baseline mantém varredura anon após todas as funções; instalação e atualização idempotentes verificadas.
- RPC legado de exclusão preservado para rollback v1.60.4, com guarda de usuário/papel/organização e prova negativa de exclusão entre empresas. Não houve revogação que quebrasse o rollback.
- Traduções espanholas e configuração de espelho Docker completadas. Corte E2E neutro continua não sendo prova dos casos não executados.

## Evidência executada

- Build local de produção concluído, com verificação positiva do host Supabase local no bundle.
- PostgreSQL 15 e 17: install/update aprovados, 112 testes de isolamento/segurança em cada versão. Caso adicional de contato real em outra empresa comprovou ausência de exclusão indevida.
- Typecheck aprovado; lint administrativo e teste de troca de atendente aprovados.
- 59 testes direcionados de administração/versão/esteira; 107 de produto/credenciais/convites; oito de primeiro acesso/layout; três de cache/Realtime aprovados.
- Chromium local: **29 casos E2E aprovados**, nos arquivos `invite-lifecycle`, `primeiro-acesso-sem-organizacao` e `conversoes-reprocessamento`.
- Mais **sete casos E2E aprovados**: escopo do Inbox, deep-link de outra empresa/malformado, mudança de etapa e motivo de perda, e mensagem chegando por Realtime sem F5. A prova registrou token autenticado e 11 frames da mensagem, não apenas refetch por foco.
- Cinco arquivos, **33 testes aprovados** de assinatura humana, configuração por organização, troca do usuário emissor, ausência de assinatura em automação, preservação do texto original e ação de marcar como não lida.

## Pendências de liberação

A suíte completa Linux concluiu em 35min52s: 2.130 arquivos aprovados e dois
arquivos com falha; 22.125 testes aprovados, dois com falha, um com falha esperada
e três ignorados (22.131 casos no total). As duas falhas foram tradução shell
faltante e jq ausente no executor local. A tradução foi corrigida e jq foi
instalado no executor de testes; os 39 testes desses arquivos passaram na
revalidação. Isso não equivale a uma nova execução integral totalmente verde.
O typecheck final passou. Lint geral passou sem erros (522 avisos). A repetição
Linux dos testes de idioma do instalador, executor e assinatura passou: 43 casos
em três arquivos. Lint de canais e toda a bateria `test:shell` passaram no mesmo
executor Linux (saída final 0), incluindo atualização, backup e rollback simulados.
Conferência dos fragmentos de release aprovada, sem escrever versão ou changelog.
O pré-voo acusou timestamps históricos das migrations 9001–9004 nas refs antigas.
Os quatro blobs são idênticos entre HEAD e fork/main: não são migrations novas
desta correção e não foram renumeradas. A implantação self-host usa o baseline,
cuja instalação/atualização foi validada nos dois PostgreSQL. Esse diagnóstico
não dispensa os gates remotos nem autoriza contornar uma recusa deles.
Os cinco gates remotos precisam ser executados novamente sobre o próximo commit;
resultados antigos do PR não representam estas correções. Os 29 casos E2E acima
não equivalem à suíte E2E inteira. Publicar apenas após autorização imediata.

## Checklist do sistema vivo

### Evidência visual da etapa e perda no Inbox

Os screenshots são do ambiente local com dados fictícios e registram a sequência
do caso E2E, sem provar produção:

- `evidence/triagem-16set-l12/etapa-01-seletor-na-conversa.png`: seletor no cabeçalho.
- `evidence/triagem-16set-l12/etapa-02-opcoes.png`: opções de etapa disponíveis.
- `evidence/triagem-16set-l12/etapa-03-movido.png`: etapa alterada na conversa.
- `evidence/triagem-16set-l12/etapa-04-motivo-da-perda.png`: coleta do motivo.
- `evidence/triagem-16set-l12/etapa-05-perdido.png`: estado final de perda.

- Caminho: configuração da organização → envio humano → adaptador do canal;
  o texto interno é preservado e a configuração começa desligada.
- Autor efetivo: teste de troca de atendente confirma o nome e o identificador
  do usuário emissor atual, sem reutilizar o atendente anterior.
- Caminho: cabeçalho do Inbox → API autenticada → contador de não lida → lista;
  o fechamento da seleção impede a marcação automática de leitura imediata.
- Limites: organização ativa, papel permitido e suporte gravável nas escritas;
  cache e Realtime não reaproveitam dados de outra empresa.
- Provas negativas: automação sem assinatura humana, deep-link estrangeiro,
  acesso revogado e exclusão de contato de outra organização.
- Liberação: gates remotos novos, autorização de publicação e confirmação
  específica antes de merge/release/deploy. Produção não alterada nesta revisão.

Supabase de testes: projeto descartável `crm-pr11-validacao`, portas 55421/55422,
contas fictícias. Nenhuma mensagem WhatsApp real foi enviada e nenhuma credencial
de produção foi criada, exibida ou contornada.
