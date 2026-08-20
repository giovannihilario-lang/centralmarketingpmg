# PMG Connect V1.3.4 — Worker para cálculos de Campanhas

A V1.3.3 isolava apenas a sincronização diária. A Performance ainda percorria o snapshot inteiro na thread do Express, podendo ultrapassar o timeout de 20 segundos.

Na V1.3.4, apuração, auditoria, benefício de primeira compra e diagnóstico rodam em Worker Thread. O worker usa apenas o snapshot persistido e nunca abre uma segunda sincronização no Azure. O frontend aguarda até 8 minutos para cálculos pesados e o processo principal continua livre para responder às demais rotas.

## Cache do navegador
`campanhas.html` agora referencia os assets com `?v=5.19.0`, forçando a nova versão do JavaScript após o deploy.
