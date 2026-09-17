# Exclusão de tenant suspenso

CONFIRMADO por código: porta em Administração → Tenants → organização → Ações.
A API DELETE /api/v1/admin/tenants/[id]/delete exige sessão de administrador de plataforma,
escopo full, guarda de acompanhamento e RPC transacional que revalida o dono original
(primeiro administrador full com autoconcessão), suspensão, slug e motivo sob lock.
Não confundir administrador de organização com dono da instalação.

A RPC não apaga usuários Auth. Cascatas existentes removem os registros do tenant.
A auditoria permanece global com tenant_id e tenant_slug nos metadados.
A organização principal explicitamente escolhida não pode ser removida. Associação
do dono a organizações de clientes NÃO bloqueia a exclusão. A migração 0266 adiciona
singleton de plataforma com FK RESTRICT; sem principal, exclusões falham fechadas.
TenantActions oferece seleção com confirmação, somente ao dono; PUT primary chama
fn_set_primary_organization, registra platform.primary_organization_updated visível
na auditoria. Seleção e exclusão travam o mesmo singleton para evitar corridas.
Erro conserva a seleção anterior e mostra toast; nenhum cron é necessário para
configuração síncrona. Não há atuação de IA nesse controle administrativo.
Sessões de WhatsApp devem ser
removidas pela tela de conexões; calendários e integrações devem estar desconectados.

Arquivos: somente storage.objects cujo nome começa com UUID exato + barra.
Fila platform_tenant_deletion_storage é da plataforma e deliberadamente não referencia
organizations: precisa sobreviver ao DELETE. RLS ativa, nenhum acesso anon/authenticated.
Cron storage-redaction consome via drainTenantDeletionStorage; tentativas idempotentes,
máximo 10; erro gera log e mantém linha failed para intervenção administrativa.
Arquivos antigos fora da convenção de prefixo não são removidos automaticamente.

Living System Checklist: entrada TenantActions; saída lista de tenants atualizada;
registro tenant.deleted em api_audit_log e filtro de auditoria derivado de AUDIT_ACTIONS;
porta detalhe já existente; anti-morte cron storage-redaction; configuração confirmação
explícita; continuidade IA/humano não se aplica a encerramento administrativo;
laço de retorno falha reverte transação, mantém modal aberto ou reprocessa fila.
Mapa: docs/architecture/exclusao-de-tenant.architecture.json.

Atualização 1.31.1 NÃO aplicada: comparação merge-tree encontrou conflitos em crm-summary,
layout autenticado, ConversationHeader, KanbanCardActions, dicionário e mapa de jornadas.
Também há números 0261/0262 de migrations upstream usados por nossos relatórios;
integração futura exige revisão de ambos os históricos, sem sobrescrever migrations.
