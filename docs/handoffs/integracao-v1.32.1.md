# Integração oficial v1.32.1 — Bee Agency

Base do fork: 37253c58. Tag oficial: v1.32.1, commit 672072d642ef12554c28198027920ba155df1322. Branch: integrate/upstream-v1.32.1.

Sete conflitos resolvidos combinando funcionalidades. crm-summary mantém etapas e origem além dos novos nomes e filtro de funil arquivado. Layout preserva ai_module_enabled e incorpora cliente_pela_agenda. Inbox incorpora arquivamento e preserva bloqueio de IA. Kanban mantém qualificação humana e incorpora exclusão. Baseline conserva histórico e proteção de organização principal junto dos controles oficiais.

Migrations próprias: 0261 → 9001, 0262 → 9002, 0265 → 9003, 0266 → 9004. Timestamps e SQL preservados; somente nomes e comentários mudam. Nunca reaplicar migrations antigas como novas por causa da renumeração.

## Evidência atual

Merge em validação, não publicado nem implantado. Typecheck inicial aprovado; lint integral sem erros (avisos preexistentes). Teste de cobertura espanhol aprovado: 5 casos. Suíte completa ainda sem resultado aprovado; falhas de scripts/release no Windows precisam reprodução em Linux. Docker local inicialmente indisponível.

Produção verificada por leitura: checkout 95f19a4f, branch production-meta; app/worker/scheduler saudáveis. docker-compose.prod.yml modificado e deploy-ai-module.sh não rastreado pertencem à instalação e devem ser preservados. Proxy é Caddy: não substituir pela configuração Traefik oficial.

## Antes do deploy

Concluir testes completos e focados, banco novo e atualização com dados. Construir três imagens em CI, não na VPS. Fazer backup protegido de banco/configuração/sessões e registrar contagens por tenant. Aplicar mudanças sem backfill e comparar recursos, configurações e isolamento. Manter rollback e verificar domínio público. Não enviar mensagens ou conversões reais para testar; não excluir tenants reais.
