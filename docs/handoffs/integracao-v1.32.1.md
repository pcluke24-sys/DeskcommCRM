# Integração oficial v1.32.1 — Bee Agency

Base do fork: 37253c58. Tag oficial: v1.32.1, commit 672072d642ef12554c28198027920ba155df1322. Branch: integrate/upstream-v1.32.1.

Sete conflitos resolvidos combinando funcionalidades. crm-summary mantém etapas e origem além dos novos nomes e filtro de funil arquivado. Layout preserva ai_module_enabled e incorpora cliente_pela_agenda. Inbox incorpora arquivamento e preserva bloqueio de IA. Kanban mantém qualificação humana e incorpora exclusão. Baseline conserva histórico e proteção de organização principal junto dos controles oficiais.

Migrations próprias: 0261 → 9001, 0262 → 9002, 0265 → 9003, 0266 → 9004. Timestamps e SQL preservados; somente nomes e comentários mudam. Nunca reaplicar migrations antigas como novas por causa da renumeração.

## Evidência atual

PR #1 publicado no fork, sem implantação. Typecheck aprovado; lint integral sem erros (avisos preexistentes). CI c45089f6: PostgreSQL 15 e 17 aprovados, incluindo atualização com dados e reaplicação; builds das três imagens e orçamento de performance aprovados. Suíte integral: 24 falhas de 9.911 casos, corrigidas em testes de contratos antigos, duas guardas de suporte e ordem da varredura anon do baseline. Reexecução dos afetados: 71 casos aprovados após completar o mock de criação.

E2E: duas falhas. Recuperação sem organização agora redireciona automaticamente em vez de exigir link manual. Troca de tenant descobriu conflito real: useAutomaticoAtivo consultava rota bloqueada em tenant sem módulo de IA, deixando o filtro da Fila incompleto. Hook passa a devolver false sem consulta quando ai_module_enabled=false; prova unitária e reexecução E2E necessárias.

Backup completo protegido em /root/DeskcommCRM/backups/integracao-v1321-20260917T223000Z: banco, configuração, compose local, script não rastreado, sessões WAHA, commit e imagens de rollback. Cache de build obsoleto removido, nenhum dado/volume/imagem de rollback apagado; VPS voltou a ter 4,3 GB livres.

Produção verificada por leitura: checkout 95f19a4f, branch production-meta; app/worker/scheduler saudáveis. docker-compose.prod.yml modificado e deploy-ai-module.sh não rastreado pertencem à instalação e devem ser preservados. Proxy é Caddy: não substituir pela configuração Traefik oficial.

## Antes do deploy

Concluir testes completos e focados, banco novo e atualização com dados. Construir três imagens em CI, não na VPS. Fazer backup protegido de banco/configuração/sessões e registrar contagens por tenant. Aplicar mudanças sem backfill e comparar recursos, configurações e isolamento. Manter rollback e verificar domínio público. Não enviar mensagens ou conversões reais para testar; não excluir tenants reais.
