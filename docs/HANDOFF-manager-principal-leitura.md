# Continuidade — managers da Principal em leitura

19/10/2026. Pedido: manager/CS somente da Principal acompanha clientes em leitura,
sem ser platform admin, sem mensagens nem marcação de leitura. Usuário autorizou
implementação e ligou Docker para validar localmente; sem push, release, deploy ou SQL em produção.

Branch: `feat/manager-principal-leitura`, base `fork/main` / `be200a4c5`.
Árvore inicialmente limpa. Arquivos atuais pertencem a esta implementação.

## Implementado, ainda não liberado

- API `/api/v1/acompanhamento` com listagem mínima e início sempre readonly.
- Entrada `AcompanharClientes` junto ao seletor, só na Principal para manager.
- Migration 9006 e apêndice idêntico no baseline: reutiliza sessões de suporte,
  revalida membership aceita e ativa, papel e Principal, sessão e MFA existente.
- Revogação remove acesso em `fn_support_context`; não cria membership em cliente.
- Auditoria separa manager de platform admin; saída usa banner existente.
- Especificação, fragmento de mudança, mapa e checklist em docs.
- Consulta de apresentação só no layout; não adiciona custo a cada API do Inbox.

## Evidência já executada

- Bateria principal: 8 arquivos / 286 casos passaram (autorização pura e server,
  API, auditoria, useMarkAsRead, guardas de suporte, cobertura dos efeitos, mapas).
- Manifest/migrations, cobertura E2E e branding: 3 arquivos / 55 casos passaram.
- ESLint dos arquivos alterados: exit 0.
- lint-channels e lint-role-rank: exit 0.
- Typecheck completo com Node heap 8 GiB: exit 0 após corrigir helper do invariante.
  A inclusão posterior do cenário E2E precisa de nova passagem antes de publicar.
- git diff --check: sem erro.

## Pendências obrigatórias — não declarar pronto / não publicar

Atualização da validação com Docker: 37/37 casos em quatro arquivos passaram,
incluindo o novo invariante, suporte, auditoria e hardening. Install e update estritos
passaram, assim como as três conferências do kit (checkout, v1.85.0 upstream e v1.63.0).
Foi corrigido `;;` duplicado apenas no teste de recusa. A suíte ampla foi interrompida
para reduzir pressão de memória local (menos de 0,5 GiB livres); seu contêiner foi
removido pelo teardown. Ela apontou uma falha em
`origem-do-negocio-segue-o-canal-da-conversa.test.ts` (idempotência da 0531), que está
sendo reexecutada isoladamente antes de atribuir causa. Não há resultado da suíte ampla.
Guard canônico requireRole acrescentado à nova API; oito testes dessa API passaram.
Fragmento validado pela função pura parseFragmento, sem executar CLI de release.

Supabase LOCAL já existente em 127.0.0.1:55421/55422, contêiner
`supabase_db_crm-pr11-validacao`, recebeu baseline e reload de schema para a UI.
O ponteiro Principal estava nulo; fixture local temporária
`f9060000-0000-4000-8000-000000000003` / `manager-primary-e2e` foi configurada apenas
se nulo. Restaurar ponteiro nulo e remover essa fixture no fim, caso continue
apontando para ela. NÃO alterar outros contêineres/projetos locais.
Ferramentas locais em `../pr11-e2e-local/tools` (pnpm wrapper e psql só local).
Build E2E com URL verificada 55421: compilou e terminou TypeScript; finalização
pendente. Houve alteração posterior na rota (guard) e no teste de tela: rebuild
necessário antes da prova visual. E2E expandido para funil e manager de cliente.

1. Docker Desktop local estava desligado (pipe dockerDesktopLinuxEngine ausente).
   Solicitado ao usuário abrir, sem reiniciar nada em produção.
2. Executar test-db contra banco descartável: novo invariante
   `manager-principal-acompanhamento.test.ts`, suporte-temporario, auditoria de
   suporte e hardening; depois suíte completa e install/update/kit.
3. Cenário E2E adicionado a `suporte-temporario.spec.ts` (já no CI): requer Principal
   configurada no banco LOCAL. Testar também funil e manager de cliente pela tela.
   Não há evidência visual produzida ainda. Nunca usar credenciais de produção.
4. Revalidar typecheck final, suíte unit completa, build e fragmento. O comando de
   conferência de release foi bloqueado pelo auto-review; não houve corte. Fonte
   do script mostra que sem --escrever seria leitura, mas pode-se validar somente
   `parseFragmento` de lib/release/fragmento.ts em alternativa sem executar CLI.
5. Revisar isolamento e auditoria incluindo expiração, revogação e saída. Antes de
   sabotagem, criar checkpoint local conforme skill; ainda não feito.
6. Número 9006 livre no disco e na base do fork consultada; revalidar colisões antes
   de eventual publicação. Origin upstream não foi atualizado (falha de rede);
   fork foi consultado com sucesso. Não incorporar upstream geral neste trabalho.

Ferramentas: usar Node direto (`node node_modules/vitest/vitest.mjs ...`), pois pnpm
do ambiente é v11 e tentou instalar/registrar symlink fora do sandbox. Git Bash
funciona com execução autorizada fora do sandbox. Hooks de contribuidor armados.
Não comprar planos, enviar WhatsApp ou modificar clientes nesta etapa.

## Continuação da prova visual e de regressão

Checkpoint local d3c085492 criado (sem push). Sabotagem da função pura confirmou
exatamente 9 falhas / 1 aprovação; regra restaurada e 18/18 testes passaram.
Build local anterior completo passou. Novo cenário E2E confirmou mensagem visível
no Inbox e não lidas preservadas e abriu funil/lead/etapa; screenshots sintéticas
em evidence/manager-principal foram inspecionadas. O cenário falhou depois em uma
espera de 5s da troca de organização (origem/destino mesma URL). Esperas agora
aguardam POST real e estado final, sem reenviar operações.

A inspeção visual mostrou Novo Lead e arrasto ainda oferecidos a viewer:
ajustados PipelinePageClient → KanbanBoard → StageColumn/KanbanCard/LeadDossier
para leitura real da interface. Servidor/RLS já recusavam. 21/21 casos de funil
e regressões existentes passaram após esse ajuste. Traduções da nova tela também
foram acrescentadas seguindo a regra de i18n, sem trocar o português.

Suíte unitária ampla no Windows esbarrou em caminhos Bash (C:\\... sem normalização)
e varreduras dependentes de separador. Foi interrompida, não considerada verde.
Preparar validação Linux em Docker sem socket/segredos, com bundle só do Git e
lockfile congelado. Script local fora do repo: ../manager-principal-linux-qa.sh.
Não enfraquecer nem pular gates com base no resultado Windows.

Rebuild e novo E2E ainda necessários após os ajustes de interface acima.
