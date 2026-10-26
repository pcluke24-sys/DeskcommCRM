# Spec 20 — Eventos da Meta por etapa do funil

## Resultado contratado

Cada organização mantém sua própria credencial, Dataset/Pixel e código de teste da Meta. Na consolidação autorizada em 26/10/2026, os eventos de etapa passam a ter um único editor, o oficial (`_regrasMeta.tsx`). A lista vigente é `EVENTOS_DA_META` em `lib/conversoes/regras-meta.ts`. Ganho continua no consumidor de compra; perda não gera evento de etapa.

As configurações livres antigas em `crm_pipelines.settings.meta_conversion_rules` ficam somente para consulta, sem apagamento ou conversão automática. `Contact`, `Schedule` e `DisqualifiedLead` não são traduzidos por suposição. Regras com nome oficial idêntico, sem exigência de valor e sem regra oficial prévia podem ser aproveitadas como rascunho, apenas para etapas abertas. O rascunho não grava nem ativa nada: o administrador revisa e salva pelo caminho oficial. Regras oficiais desligadas não são reativadas por esse aproveitamento.

## Atribuição e entrega

- Prioridade inicial: campanhas click-to-WhatsApp, usando o `ctwa_clid` já capturado no contato.
- O envio usa `action_source=business_messaging`, `messaging_channel=whatsapp` e o Dataset da organização ativa.
- Eventos sem atribuição permanecem visíveis como não reportados; não inventamos uma atribuição.
- O worker oficial envia fora da ação do usuário, com retry e livro-razão `ad_conversion_dispatches`. A chave da etapa é `MetaEtapa:<stage_id>`; `Purchase` continua separado, sem reescrita de envios anteriores.
- Salvar as regras oficiais mantém o marco antirretroativo implementado nesse caminho. Aproveitar um rascunho ou salvar critérios não altera o marco antigo nem ativa envios.

## Qualificação assistida

Cada funil pode guardar a descrição do que significa lead qualificado e desqualificado. A ação no card envia à IA essas regras e as últimas mensagens da conversa. A resposta contém classificação, confiança, justificativa, evidências e dados faltantes.

A análise é somente leitura: não muda etapa, não grava classificação e não chama a Meta. A confirmação humana é o movimento do card para uma etapa mapeada.

## Isolamento

Todas as leituras feitas com service role incluem `organization_id`: lead, funil, mensagens e agente. A credencial é carregada pelo cofre da própria organização e continua oculta na interface.

## Fora deste incremento

- Importação automática de formulários nativos da Meta.
- Eventos retroativos.
- Qualificação ou disparo automático decidido pela IA.
