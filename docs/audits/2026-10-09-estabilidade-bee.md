# Estabilidade — entrega isolada da v1.60.3

Base: main do fork c4e675fdcf5f4685a2e8858a95f12e17f8699aff.
Destino: núcleo (auth e Inbox comuns) e infraestrutura (dimensionamento de conexões).
Atualização v1.78/PR 11 pausada; esta entrega não inclui suas funcionalidades.

## Evidência da produção (09/10/2026, horário de Brasília)

CONFIRMADO: Supavisor registrou ECHECKOUTTIMEOUT e Authentication timeout de
15000ms às 16h40 e 16h59; Auth retornou 504 em GET /user. App registrou falha
de getUser tratada como não autenticado. Webhooks encontraram 503 e repetiram.
Pool Supabase: 15 por usuário/banco; app/worker em Session/5432 sem DB_POOL_MAX
(pg default 10 por pool; existem pools independentes). Isso demonstra falha de
conexões, não prova que o teto de 15 seja sua causa exclusiva.

CONFIRMADO: scheduler pausado não eliminou as falhas. VPS teve CPU ociosa e
sem reinício/OOM dos componentes no snapshot. Sem evidência para prometer que
VPS maior ou plano Pro isoladamente resolva. Sessão WhatsApp sofreu uma
desconexão; causalidade com o banco ainda não estabelecida.

## Ajustes locais

- Proxy: Auth transitório retorna 503/no-store/Retry-After, não 401/login.
- loadAuthUser: falha transitória lança erro próprio; nunca autoriza sem validar.
- Listagem Inbox: elimina getUser remoto redundante antes de loadAuthUser.
- Realtime Inbox: agrupa rajadas em janela fixa de 500ms, cancela ao desmontar,
  chave de cache inclui organização e não consulta antes de organização resolvida.
- Conversa aberta: agrupa também os eventos de mensagens, que antes invalidavam
  imediatamente a lista inteira a cada evento e contornavam o agrupamento acima.
- Não há cache global de identidade/permissões; RLS e guards permanecem.

## Verificação local executada

53 testes direcionados passaram (auth, proxy, permissões, caminhos públicos,
listagem e integração dos hooks). Lint dos arquivos alterados passou; diff sem
erros de whitespace. Typecheck passou também após a inclusão dos testes dos
hooks. Nenhum teste usou sessão de cliente nem
enviou WhatsApp. Estes testes não substituem teste de carga ou prova em produção.

Suíte completa iniciada no Windows: apresentou falhas em testes de shell que
recebem caminhos Windows no bash/WSL e timeouts em varreduras. Não há verde da
suíte completa; a execução Linux da esteira é obrigatória para separar limitação
local de regressão. Não corrigir testes alheios nem contornar checks para implantar.

## Pendências antes de publicar/implantar

Testes completos, typecheck/lint, prova visual local com indisponibilidade e
recuperação, carga controlada fora da produção e orçamento dos pools. Não
aumentar Supavisor cegamente nem trocar para Transaction (locks de sessão podem
depender do modo). Não alterar produção, comprar plano, enviar WhatsApp ou
publicar branch sem autorização no ponto de impacto.

## Living System Checklist

Entrada: Auth getUser e postgres_changes filtrado por organização.
Saída: guard da API e lista do Inbox. Registro: logger de auth existente e 503
correlacionado por x-request-id. Tela: erro temporário/erro boundary existente,
e recuperação GET pelo apiClient (503 já retentável). Porta: Inbox existente.
Anti-morte: refetch de segurança e foco preservados; janela fixa não posterga
indefinidamente; timers antigos cancelados. Configuração: sem novo estado de
negócio; dimensionamento operacional pendente. Continuidade IA/humano inalterada.
Laço: GET retenta indisponibilidade; sessão inválida segue negada. Não há nova
peça arquitetural nem nova tabela; os caminhos de auth e Inbox existentes mudam.

Não é declaração de incidente resolvido: nenhuma dessas alterações está na VPS.

## Bloqueio externo da publicação e correção da esteira

PR 12 / commit 2383f32ee: verify e build-and-size aprovados no Linux. Invariantes
não chegaram ao banco por rate limit no pull de pgvector; imagens falharam com
429/504 do Docker Hub. Prova negativa do agrupamento: retirar a guarda fez quatro
dos cinco testes falharem; restaurar fez os cinco passarem novamente.

Adicionado cache público mirror.gcr.io ao Docker e BuildKit da esteira. O cache
respondia 200 para pgvector:pg17 e node:22-alpine na consulta de 09/10. Docker
só é reconfigurado/reiniciado em runner efêmero github-hosted, nunca na VPS ou
em executor persistente. Configuração anterior é preservada, sem credenciais.
O cache pode falhar ou não ter determinada imagem; o fallback ao Docker Hub
permanece. Não é garantia de disponibilidade. Nenhum gate foi removido.
