# Correspondencia das conversoes

Destino: nucleo, enriquecendo o transporte de conversoes existente. A operacao sem conexao continua inteira.

Fonte: `contacts` filtrado por `organization_id` e id. `email` e `name` fornecem email e nome completo; a primeira palavra e o nome e o restante o sobrenome. O identificador externo deriva de organizacao + contato, e permanece estavel entre negocios. Telefone, email, nome, sobrenome e identificador externo sao normalizados e enviados em SHA-256. Contatos anonimizados nao sao enviados.

`source_metadata.web_tracking` pode conter `fbc`, `fbp`, `client_ip_address` e `client_user_agent` reais capturados no site do lead. Os cookies tambem podem existir no topo de `source_metadata`. Valores invalidos sao omitidos; nunca se deriva cookie de UTM ou CTWA. IP e navegador da VPS ou do operador nao sao capturados. Esta mudanca consome metadados existentes: nao instala coletor no site, nao cria dados ausentes e nao envia historico retroativo.

Living System Checklist: entrada `lerAtribuicao`; saida `transporteMeta.enviar`; registro `ad_conversion_dispatches` pelo handler; tela e porta Configuracoes > Conversoes; retry existente para erros transitorios e pendencias visiveis para erros definitivos; configuracao da conexao por organizacao; humano fornece dados no cadastro do contato; falha exige corrigir cadastro/conexao antes de tentar novamente. Nenhuma peca nova, rota, tabela ou dependencia de IA foi criada. Score da Meta nao e garantido.
