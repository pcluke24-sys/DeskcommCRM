# Primeiro acesso por convite

O callback PKCE aceita navegação do webmail usando Lax somente no verificador descartável. Cookies de sessão continuam Strict. Em outro dispositivo, o login pode retomar o convite assinado dos metadados: exige sessão validada, e-mail confirmado, assinatura, e-mail correspondente e a checagem de revogação de aplicarConvite.

No cadastro, `setup_mode=client` oferece o wizard ao admin/manager; `agency` mantém o cliente na operação enquanto a agência configura por seletor ou acompanhamento. Em Plataforma > Tenants > Ver, Concluir implantação grava `onboarded_at`. Não configura automaticamente canais, credenciais ou funis: use apenas depois de preparar a empresa.

Agente/viewer não recebem wizard e as actions de implantação recusam esses papéis. Novos convites de responsável também constam em team_invites. Sem mudança de schema.

## Living System Checklist

1. Entrada: GoTrue getUser, token HMAC e team_invites.
2. Saída: aplicarConvite, active_org e /app.
3. Registro: member.accepted e onboarding.completed no audit.
4. Tela: equipe e painel do tenant.
5. Porta: convite por e-mail, login, seletor e Tenants > Ver.
6. Anti-morte: login retoma vínculo; recusa encaminha à tela de convite com reenvio.
7. Configuração: seletor Quem fará a implantação e Concluir implantação.
8. IA/humano: não altera atendimento; preserva flag comercial da IA.
9. Retorno: convite pendente permanece visível, pode ser reenviado/revogado; erros de autorização falham fechados.
10. Mapa: docs/architecture/primeiro-acesso.architecture.json.

Provas automatizadas não substituem o teste real do e-mail em outro dispositivo. Verificar administrador, manager, agente, viewer, vínculo único e menu após login.
