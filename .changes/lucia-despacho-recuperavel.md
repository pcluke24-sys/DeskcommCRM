---
type: fix
area: ai-agent
---

Impede que uma mensagem recebida fique visível na Inbox sem acordar a IA. O despacho agora é idempotente, falhas transitórias pedem reentrega e uma reentrega do WhatsApp repara o despacho ausente sem duplicar a mensagem.
