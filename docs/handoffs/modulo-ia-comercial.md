# Contratação de IA por organização

CONFIRMADO: a flag `organizations.settings.ai_module_enabled` é controlada pela plataforma em `/admin/tenants/new` e `/admin/tenants/[id]`. Ausência preserva organizações existentes; novas organizações recebem `false` por padrão. Não depende do nome do plano.

## Living System Checklist

1. Entrada: formulário administrativo e PATCH protegido por `requirePlatformAdmin`.
2. Saída: layout autenticado, sidebar, busca de telas, controles do inbox e resolvedor de credenciais LLM.
3. Registro: `tenant.ai_module_updated` em `api_audit_log`.
4. Tela: botão Liberar/Bloquear IA no detalhe administrativo da organização.
5. Porta: Plataforma → Tenants → Ver.
6. Anti-morte: erro de gravação aparece ao administrador; bloqueio permanente cancela jobs pelo contrato `terminal` do worker. Operação humana continua.
7. Configuração: cadastro e detalhe da organização. Flag ausente mantém comportamento anterior.
8. Continuidade: bloquear não muda etapas, contatos, conversas nem credenciais; liberar devolve o módulo.
9. Retorno: administrador pode corrigir a contratação na mesma tela; falha não mostra sucesso.
10. Mapa: `docs/architecture/modulo-ia-comercial.architecture.json`.

## Verificação

Testes em `lib/ai/modulo.test.ts` e `lib/agent-engine/edge/llm/credentials.test.ts`: navegação independente por organização, preservação dos outros hubs, onboarding sem IA e veto antes de carregar credenciais.

Limite: chamadas já enviadas ao provedor antes do bloqueio não podem ser desfeitas. A flag é relida a cada resolução de credenciais.
