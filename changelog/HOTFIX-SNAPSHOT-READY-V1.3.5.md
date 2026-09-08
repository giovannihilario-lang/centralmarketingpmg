# PMG Connect V1.3.5 — Hotfix snapshot pronto antes da apuração

## Causa

A V1.3.4 isolou os cálculos pesados de Campanhas em Worker Threads e colocou esses workers em modo somente leitura para impedir novas consultas ao Azure SQL.

Entretanto, se `campanhas-contexto-v5.json` já existisse, a tela podia abrir usando esse contexto antigo sem iniciar a sincronização diária. Ao clicar em Performance, o worker de cálculo era criado antes de existir `data/pmg-comercial-diario-v1.json.gz`, resultando em `PMG_DAILY_SNAPSHOT_NOT_READY`.

## Correção

1. `runHeavyResource()` agora executa `ensureDailySnapshot()` no processo principal antes de criar qualquer worker de cálculo.
2. O processo principal continua responsivo, porque a sincronização pesada já é feita por `daily-commercial-snapshot-worker.js`.
3. `syncPromise` continua impedindo mais de uma sincronização simultânea.
4. Ao abrir Campanhas com contexto antigo salvo, a atualização diária é disparada em segundo plano imediatamente.
5. O timeout do navegador para operações pesadas passou de 8 para 18 minutos, pois no primeiro acesso a mesma operação pode aguardar a carga diária e depois executar a apuração.
6. Asset de Campanhas atualizado para `v=5.20.0` para evitar cache da versão anterior.

## Resultado esperado

- Primeiro acesso do dia inicia a carga diária mesmo se houver contexto antigo.
- Performance/Auditoria/Benefícios/Diagnóstico nunca criam worker sem snapshot persistido.
- Se o Azure falhar e existir snapshot anterior, o fallback anterior continua funcionando.
- Se não existir snapshot algum e a carga falhar, a tela recebe o erro real do SQL/sincronização, e não o falso `PMG_DAILY_SNAPSHOT_NOT_READY`.
