# PMG Connect V1.3.3 — Hotfix Worker do Snapshot Diário

## Problema

A V1.3.2 aumentou os tempos de espera do navegador e melhorou a mensagem de erro, porém a sincronização diária continuava executando a consulta, transformação e compactação no mesmo processo Node que atende a API local.

Quando o Azure SQL devolvia um volume grande de vendas, o processamento podia ocupar o event loop do Node. Durante esse intervalo, até as rotas de status deixavam de responder e o navegador exibia `A API local demorou para responder.`.

## Correção estrutural

- A consulta pesada do snapshot diário agora roda em `Worker Thread` separada.
- Transformação das linhas comerciais e compactação gzip também rodam no worker.
- O processo Express principal permanece disponível para responder `/api` enquanto a carga diária acontece.
- O primeiro login usa `acao=iniciar`, que dispara a sincronização e retorna HTTP 202 imediatamente, sem manter uma requisição aberta esperando o Azure.
- `/api/dados-diarios?acao=status` publica fase, percentual e mensagem da sincronização.
- Campanhas reaproveita o progresso real do snapshot no overlay.
- A API de Campanhas foi identificada como versão 5.18.0.
- Snapshot diário, Regional, Campanhas, hotfix de CNPJ e Gestão MKT V1.3.x permanecem preservados.

## Fluxo

1. Primeiro acesso autenticado do dia chama `acao=iniciar`.
2. O servidor responde imediatamente que a carga foi enfileirada/iniciada.
3. Uma Worker Thread conecta ao Azure SQL, consulta e monta o snapshot.
4. Enquanto isso, o processo principal continua atendendo status e interface.
5. O worker grava `data/pmg-comercial-diario-v1.json.gz` por troca atômica.
6. O processo principal carrega o snapshot concluído e libera Regional/Campanhas.

## Testes realizados

- `node --check` nos arquivos alterados: OK.
- Central de Acompanhamento: 1.335 registros / 1.707 movimentos / Planejamento 15-104-0: OK.
- Caixa de Documentos: Gemini + fallback local / 4 modelos / conferência humana: OK.
- Endpoint `acao=iniciar`: HTTP 202 em aproximadamente 0,02 s no teste local.
- Endpoint de status durante a preparação: respostas em aproximadamente 0,002 s no teste local.
- Teste completo de Campanhas dependente do SQL real não foi executado neste ambiente por não haver credenciais/conectividade com o Azure SQL.

## Publicação

Substitua os arquivos da V1.3.2 pelos desta versão, preserve o `.env`, execute `npm install` se necessário e reinicie `npm start`.

Não há nova dependência npm: `Worker Threads` faz parte do próprio Node.js.
