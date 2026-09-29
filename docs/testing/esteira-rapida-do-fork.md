# Esteira rápida do fork

Esta entrega reduz o relógio de validação sem transformar falha em sucesso.

## O que já existia na v1.59.0

- `verify` dividido em três grupos independentes;
- preparação Node com cache reutilizável;
- cinco partes E2E isoladas;
- invariantes com seleção de famílias afetadas e retorno à bateria completa quando a mudança é ampla;
- bateria completa mantida em `main`, releases e mudanças de infraestrutura.

## Mudança mínima desta entrega

1. As cinco partes E2E deixam de executar uma por vez e passam a aceitar duas em paralelo (`max-parallel: 2`). Isso mantém o limite conservador de pulls simultâneos das imagens públicas, mas reduz de cinco para três as ondas de execução. A redução projetada do caminho serial é de 40%; o tempo real deve ser registrado na primeira rodada publicada.
2. Quando o relógio interrompe uma parte sem nenhum caso vermelho, o resultado fica neutro e a continuação é sinalizada no resumo. Se já houver caso vermelho, a parte continua falhando.
3. Testes unitários vigiam essa distinção para impedir que um erro real seja escondido como continuação.

## Portões que continuam obrigatórios

- invariantes e segurança multiempresa;
- `verify` e checagem de tipos;
- build e tamanho;
- imagens publicáveis;
- cenários E2E críticos;
- bateria completa para releases e mudanças amplas.

Não há seleção fina de specs E2E nesta entrega: ainda não existe um mapa de dependências comprovado que permita pular cenários sem risco. Até existir, o fallback seguro é executar todas as partes nas entregas consolidadas.

## Como medir depois da publicação

Compare o relógio total entre o início da primeira e o fim da última parte E2E. Registre também, por parte, preparo, suíte e total, usando o resumo que o workflow já publica. A referência anterior é cinco ondas seriais; a nova configuração agenda no máximo três ondas, limitada a duas partes simultâneas.
