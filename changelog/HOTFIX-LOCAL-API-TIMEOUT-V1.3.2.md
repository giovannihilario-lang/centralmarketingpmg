# PMG Connect V1.3.2 — Hotfix da primeira carga diária

## Problema corrigido

Na primeira abertura do dia, a sincronização do snapshot comercial pode levar mais de 20 segundos. O frontend de Campanhas encerrava as chamadas de status antes do fim da carga e exibia uma mensagem enganosa dizendo que a página local não conseguia acessar `/api`.

## Alterações

- Campanhas passa a acompanhar a primeira sincronização por até 12 minutos, compatível com a carga pesada diária.
- Consultas de status toleram períodos em que o Node está ocupado processando o snapshot.
- O overlay informa explicitamente quando o snapshot diário está sendo sincronizado com o Azure SQL.
- AbortController agora é classificado corretamente como `LOCAL_API_TIMEOUT`.
- O backend de Campanhas publica estado `loading` antes de aguardar o snapshot.
- Contexto já atualizado volta corretamente ao estado `ready`.
- API local de Campanhas atualizada para 5.17.1.

## O que não mudou

- Snapshot diário e hotfix de CNPJ permanecem intactos.
- Dashboard Regional continua usando o mesmo snapshot.
- Não há serviço novo, cobrança nova ou armazenamento na Vercel.
- A Vercel continua apenas hospedando a aplicação web.
