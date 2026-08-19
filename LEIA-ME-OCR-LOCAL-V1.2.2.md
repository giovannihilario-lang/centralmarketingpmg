# PMG Central — OCR Local Gratuito V1.2.2

Esta atualização remove integralmente a leitura por API paga. Os PDFs passam a ser processados no navegador com PDF.js e Tesseract.js, sem chave, créditos ou contratação.

## Atualização

1. Copie os arquivos deste pacote sobre o projeto.
2. Remova a função antiga, caso ela ainda esteja no projeto:

```powershell
Remove-Item api\analisar-documento.js -ErrorAction SilentlyContinue
```

3. A variável `OPENAI_API_KEY` pode ser excluída da Vercel; ela não é mais utilizada.
4. Faça o commit, aguarde o deploy e pressione `Ctrl + Shift + R` na Central.
5. No documento que apresentou erro, clique em **Tentar leitura local**.

Não é necessário executar SQL novamente.

## Como funciona

- PDF com texto: leitura direta no navegador.
- PDF escaneado: cada página vira uma imagem temporária e passa pelo OCR em português.
- As quatro classificações atuais continuam ativas.
- O arquivo permanece privado no Supabase.
- Nenhum lançamento acontece sem conferência humana.

Na primeira leitura, o navegador baixa o mecanismo e o idioma do OCR. Isso pode levar alguns segundos; depois, o idioma fica em cache local.

## Validação

```powershell
node scripts/testar-documentos.js
```

Resultado esperado: `{"status":"ok","ocr":"local","templates":4,"paid_api":false}`.
