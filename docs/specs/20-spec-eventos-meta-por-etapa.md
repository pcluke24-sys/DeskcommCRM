# Spec 20 — Eventos da Meta por etapa do funil

## Resultado contratado

Cada organização mantém sua própria credencial, Dataset/Pixel e código de teste da Meta. Em cada funil, um administrador pode associar livremente uma etapa a um nome de evento válido. Ao nascer ou entrar nessa etapa, o lead gera no máximo uma conversão com aquele nome.

Sugestões visíveis na tela: `Contact`, `Lead`, `QualifiedLead`, `Schedule`, `AppointmentAttended`, `DisqualifiedLead` e `Purchase`. Os nomes não são fixos. `Purchase` sempre exige valor positivo e moeda; o transporte converte centavos para o número decimal esperado pela Meta.

## Atribuição e entrega

- Prioridade inicial: campanhas click-to-WhatsApp, usando o `ctwa_clid` já capturado no contato.
- O envio usa `action_source=business_messaging`, `messaging_channel=whatsapp` e o Dataset da organização ativa.
- Eventos sem atribuição permanecem visíveis como não reportados; não inventamos uma atribuição.
- O worker envia fora da ação do usuário, com retry e livro-razão. `event_id` é `lead:evento`, portanto voltar e avançar o card não duplica o mesmo evento.
- Salvar o mapa grava um marco de ativação. Eventos anteriores a esse instante não são enviados.

## Qualificação assistida

Cada funil pode guardar a descrição do que significa lead qualificado e desqualificado. A ação no card envia à IA essas regras e as últimas mensagens da conversa. A resposta contém classificação, confiança, justificativa, evidências e dados faltantes.

A análise é somente leitura: não muda etapa, não grava classificação e não chama a Meta. A confirmação humana é o movimento do card para uma etapa mapeada.

## Isolamento

Todas as leituras feitas com service role incluem `organization_id`: lead, funil, mensagens e agente. A credencial é carregada pelo cofre da própria organização e continua oculta na interface.

## Fora deste incremento

- Importação automática de formulários nativos da Meta.
- Eventos retroativos.
- Qualificação ou disparo automático decidido pela IA.
