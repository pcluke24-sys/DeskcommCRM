# Acompanhamento de clientes por manager da Principal

Estado: implementação local em andamento, não publicada.

## Contrato confirmado pelo proprietário

- Apenas membros com papel `manager` da organização apontada por
  `platform_primary_organization` podem acompanhar outras organizações.
- A CS usa o mesmo papel. Managers de clientes, viewers e atendentes não ganham acesso.
- Não concede `is_platform_admin`, membership no cliente nem acesso a administração,
  cobrança, segredos ou configurações de plataforma.
- Acompanhamento temporário, vinculado à sessão autenticada, sempre `support_readonly`.
- Inbox e funil são consultáveis; abrir conversa não marca como lida. Envio,
  atribuição, mudança de etapa e qualquer outra escrita são recusados no servidor e RLS.
- Autoridade revalidada no banco durante o acompanhamento. Revogação da membership,
  mudança de papel, da Principal, suspensão ou fim da sessão retiram o acesso.
- Entrada e saída registradas com ator real e organização cliente. Nenhuma identidade
  de administrador é simulada para conceder essa capacidade.

## Integração e provas exigidas

Reutilizar `platform_support_sessions`, `fn_support_context`, as restritivas de RLS
e `requireSupportWrite`; não criar segundo mecanismo de impersonação.
Entrada pelo seletor de organizações, com ação claramente identificada como leitura.
Saída pelo banner de acompanhamento existente, inclusive após revogação.

Testes: manager Principal permitido; manager cliente recusado; viewer/agent recusados;
falha de consulta fecha acesso; modo full recusado; RLS cross-tenant antes/depois;
escritas diretas recusadas; revogação imediata; Inbox sem marcar lida; funil sem edição.

Destino: núcleo (autorização e isolamento). Nenhuma extensão ou serviço pago novo.
Sem publicação ou alteração de produção nesta etapa.

## Evidência local validada

Capturas com dados exclusivamente sintéticos, sem informações de clientes:

- `evidence/manager-principal/inbox-somente-leitura.png`:
  mensagem carregada com contador de não lidas preservado.
- `evidence/manager-principal/funis-somente-leitura.png`:
  funil e lead consultáveis sem Novo Lead, seleção ou arrasto de cards.

E2E canônico em 19/10: cenário do manager aprovado (35,5s; rodada 52s).
Também confirmou recusa HTTP 403 para marcar lida e administração, saída do
acompanhamento e ausência da porta para manager de cliente. Build final passou.
Estas capturas não comprovam implantação nem aprovação da suíte geral completa.

## Checklist do Sistema Vivo

1. Entrada: `TenantSwitcher` / `AcompanharClientes` e identidade de `loadAuthUser`.
2. Saída: sessão reconhecida por `fn_support_context`, consumida pelo Inbox e funil.
3. Registro: `support.manager_started` e `support.manager_ended` em `api_audit_log`.
4. Visibilidade: banner de leitura e auditoria existente da organização.
5. Porta: ação no seletor existente, não uma página nova oculta.
6. Continuidade: leitura pura; não cria demanda, não envia nem agenda mensagens.
7. Configuração: papel manager no time da Principal; Principal definida pelo controle
   de instalação existente. Não há autorização pela organização cliente.
8. Contexto de mensagens/funil preservado; nenhuma passagem de autoridade para IA.
9. Falha de autorização bloqueia início; revogação leva a `/support-ended`, com saída
   disponível. Falha de rede na lista mostra erro e permite tentar novamente.
10. Mapa: `docs/architecture/acompanhamento-manager.architecture.json`.
