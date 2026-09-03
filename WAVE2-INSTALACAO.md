# PMG Connect — Wave 2 — Instalação

## Pré-requisito
O projeto deve estar na Wave 1B. A migration 26 precisa ser aplicada antes da 27.

## Ordem das migrations no Supabase PMG
1. `sql/26-FORNECEDOR-IDENTIDADE-WAVE1B.sql`
2. `sql/27-WAVE2-OPERACOES.sql`

Não execute os arquivos `ROLLBACK` durante instalação normal. Eles existem apenas para reversão controlada.

## Aplicando o patch
Extraia o ZIP do patch na raiz do projeto PMG Connect e permita substituir os arquivos existentes.

## Testes obrigatórios
No PowerShell, dentro da pasta do projeto:

```powershell
npm install
npm run wave2:testar
npm test
npm ls --depth=0
npm run vercel:check
```

O resultado esperado da Wave 2 inclui:

- `CALENDARIO_WAVE2: PASS`
- `FORNECEDORES_OBRIGACOES_WAVE2: PASS`
- `FORNECEDORES_ASSETS_WAVE2: PASS`
- `EXTERNAL_PORTAL_WAVE2: PASS`
- `AUTOMACOES_WAVE2: PASS`
- `ACADEMIA_WAVE2: PASS`
- `RELACIONAMENTOS_WAVE2: PASS`
- `WAVE2_SECURITY: PASS`
- `WAVE2: PASS`
- 10 Serverless Functions no `vercel:check`

## Teste local

```powershell
npm start
```

Abra e confira:

- `/central.html`
- `/operacoes.html`
- `/fornecedores.html`
- `/demandas.html`
- `/fornecedor-envio.html`
- `/academia-checkin.html`
- `/dashboard-regional.html`
- `/catalogo.html`

## Validação real necessária após migrations
Com uma conta PMG autenticada, valide:

1. Criar Demanda relacionada a fornecedor e atualizar a página.
2. Criar obrigação e abrir pela Matriz/Calendário/Supplier 360.
3. Criar contato de fornecedor.
4. Enviar um asset interno válido e verificar duplicidade/hash.
5. Gerar token do portal externo e testar upload escopado.
6. Confirmar que o material fica `Recebido`, e não `Aprovado`.
7. Criar treinamento, importar inscrição e validar lista de não inscritos.
8. Fazer check-in QR/manual e tentar repetir a presença.
9. Criar uma regra de automação em preview e depois habilitada; reavaliar e confirmar ausência de duplicação.

## Rollback
Se for necessário reverter a Wave 2, use primeiro:

`sql/27-ROLLBACK-WAVE2-OPERACOES.sql`

A Wave 1B só deve ser revertida separadamente com:

`sql/26-ROLLBACK-FORNECEDOR-IDENTIDADE-WAVE1B.sql`

Não reverta a 26 enquanto a 27 estiver aplicada.
