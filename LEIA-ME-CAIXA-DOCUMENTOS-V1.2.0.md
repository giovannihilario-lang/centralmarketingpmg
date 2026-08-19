# PMG Connect — Caixa de Entrada de Documentos V1.2.0

Complemento da Central de Acompanhamento para receber PDFs escaneados, reconhecer os quatro modelos atuais e preparar lançamentos sempre sujeitos a conferência humana.

## Instalação

1. Copie o conteúdo deste pacote sobre o projeto PMG Connect, preservando o `.env` atual.
2. Execute `sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql` no SQL Editor do Supabase. O arquivo tem menos de 20 KB e pode ser executado novamente com segurança.
3. Na Vercel, configure `OPENAI_API_KEY` e, opcionalmente, `OPENAI_DOCUMENT_MODEL=gpt-5.6`.
4. Faça um novo deploy e atualize a Central com `Ctrl + Shift + R`.

## Fluxo protegido

- O PDF entra no bucket privado `acompanhamento`.
- A leitura separa cadastro/comprovante de pagamento, pedido de compra, nota fiscal/DANFE e extrato/comprovante bancário.
- Um modelo diferente é marcado como `Não identificado`.
- A proposta fica em `Aguardando conferência`.
- Somente depois da confirmação humana o sistema cria, vincula, anexa ou ignora o item.
- O colaborador, a decisão e o horário ficam auditados.

Sem a chave de leitura automática, o botão **Conferir manualmente** continua disponível. Nenhum documento é lançado automaticamente em qualquer cenário.

## Validação

```powershell
node scripts/testar-documentos.js
```

Resultado esperado: `{"status":"ok", ...}`.
