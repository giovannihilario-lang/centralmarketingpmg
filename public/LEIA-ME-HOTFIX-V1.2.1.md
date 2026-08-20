# Hotfix PMG Central — Documentos V1.2.1

Esta atualização corrige:

- tela branca com `TypeError: c is not a function`;
- retorno `401` em `/api/analisar-documento` mesmo com o usuário conectado;
- cache dos arquivos JavaScript anteriores.

## Aplicação

1. Copie a pasta `public` sobre a pasta `public` do projeto.
2. Faça o commit e o deploy na Vercel.
3. Na Central, use `Ctrl + Shift + R` uma vez.

Não é necessário executar outro SQL para este hotfix. O `sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql` continua sendo necessário apenas na instalação inicial do módulo.
