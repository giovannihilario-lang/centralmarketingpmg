# PMG Connect V1.3.6 — Snapshot comercial em streaming

## Problema corrigido

A sincronização diária podia falhar com `Invalid string length` e código `PMG_DAILY_SNAPSHOT_WORKER_ERROR` quando o volume comercial era grande. A causa era a serialização de todo o snapshot em uma única chamada a `JSON.stringify`, criando uma string maior do que o limite suportado pelo V8/Node.

## Mudança

O snapshot local passa do formato `pmg-comercial-diario-v1.json.gz` para `pmg-comercial-diario-v2.ndjson.gz`.

O novo formato é gravado em streaming:

- metadados em uma linha;
- um registro por linha para pedidos, itens, produtos, clientes e demais seções;
- compressão gzip conforme os registros são escritos;
- troca atômica do arquivo temporário pelo snapshot válido somente após a gravação terminar.

Assim, o servidor não precisa criar uma string JSON gigantesca antes de compactar.

## Compatibilidade

O leitor continua aceitando o snapshot v1 como fallback. Na primeira sincronização bem-sucedida com esta versão, o snapshot v2 é criado automaticamente. Não é necessário apagar o arquivo v1 manualmente.

## Validação

Foi validado round-trip de gravação e leitura com 400.000 linhas de venda, 133.334 pedidos e 5.000 produtos. As quantidades foram reconstruídas corretamente. Também foi validada a leitura de um snapshot legado v1 quando o v2 ainda não existe.

## Implantação

1. Substitua os arquivos pela V1.3.6.
2. Encerre completamente o `npm start` anterior.
3. Execute `npm start` novamente.
4. Abra Campanhas/Regional. A primeira sincronização bem-sucedida criará `data/pmg-comercial-diario-v2.ndjson.gz`.

Não há nova dependência npm nem serviço externo.
