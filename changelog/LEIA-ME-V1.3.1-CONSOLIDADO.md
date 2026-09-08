# PMG Connect V1.3.1 — Leia antes de publicar

Esta é a versão consolidada entre a master com snapshot diário do Azure SQL e a evolução mais nova da Central de Acompanhamento / Gestão MKT.

## Atualização de uma instalação que já está na V1.2.5 ou superior

1. Faça backup da pasta atual.
2. Substitua os arquivos pelo conteúdo deste pacote.
3. Preserve o seu `.env`; ele não está incluído no ZIP.
4. No Supabase, se ainda não executou, rode os SQLs anteriores necessários (06 a 10).
5. Execute `sql/11-GESTAO-MKT-V1.3.0.sql`.
6. Na Central de Acompanhamento, reimporte `Fornecedores 2024.xlsx`, `Fornecedores 2025.xlsx`, `Fornecedores 2026.xlsx` e `MKTG 2026.xlsx`. Os modelos oficiais usam fingerprints e conciliação para atualizar sem duplicar.
7. Publique a parte hospedada na Vercel.
8. Na máquina do Node local, rode `npm install` e depois `npm start`.
9. Atualize o navegador com `Ctrl + F5`.

## Snapshot diário

A lógica de Regional/Campanhas não foi trocada pela versão antiga. Continua valendo:

- primeiro acesso do dia garante o snapshot;
- uma sincronização por instalação local;
- Regional e Campanhas leem o arquivo local depois da carga;
- falha no Azure mantém o último snapshot válido;
- `PMG_SNAPSHOT_NOT_BEFORE` pode impedir uma foto antes da carga diária do Azure terminar.

## Validação antes do commit

```bash
node --check public/assets/acompanhamento.js
node --check scripts/gerar-carga-acompanhamento.js
node --check server.js
node --check src/lib/daily-commercial-snapshot.js
node --check src/lib/regional-dashboard.js
node --check src/campanhas/daily-campaign-engine.js
npm run acompanhamento:testar
npm run documentos:testar
```

Resultado esperado do acompanhamento: 1.335 registros, 1.707 movimentos, Planejamento 15/104/0 e zero avisos nas quatro planilhas.

## Commit sugerido

```bash
git add .
git commit -m "feat: consolida gestao MKT com snapshot comercial diario"
git push origin main
```
