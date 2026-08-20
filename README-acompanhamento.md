# PMG Connect — Central de Acompanhamento V1.3.1

> Interface `1.3.1`: cockpit executivo PMG com Planejamento PMG, Receita, Fechamento Mensal, Caixa de Entrada, leitura visual pelo Gemini, contingência OCR local e conferência obrigatória. Use `Ctrl + K` (ou `Cmd + K`) para localizar fornecedores, acompanhamentos e ações rápidas sem sair da tela atual.

Novo módulo operacional para reunir o **Controle Marcos** e o **Controle Marketing / Fornecedores** em uma única base editável.

## O que o módulo controla

- Cotas e planos anuais.
- Campanhas de incentivo.
- Feiras e eventos.
- Ações de trade, mídia, materiais e bonificações.
- Valores acordados, parcelas e pagamentos futuros.
- Forma de pagamento, vencimento, baixa e documento.
- Responsável, contato do fornecedor e período de vigência.
- Histórico automático de alterações.
- Contratos, boletos, notas fiscais, propostas e comprovantes.
- Importações de Excel com identificação de reimportações.
- Separação financeira entre receitas, despesas, indicadores e detalhamentos.
- Planejamento PMG 2026 com previsto x realizado sem baixa automática pelo simples vencimento do mês.
- Receita com previsão, recebido, a receber, investimento e saldo.
- Fechamento mensal Marketing → Marcos com de-para alfabético e assinatura de conferência.
- Centro de custo obrigatório nos lançamentos manuais; MTRIX/Emitrix é tratado como investimento adicional fora da VERBA, enquanto demais aberturas ficam dentro da VERBA.

## Dados já consolidados

A entrega inclui a carga real das quatro fontes recebidas:

- `Fornecedores 2024.xlsx`
- `Fornecedores 2025.xlsx`
- `Fornecedores 2026.xlsx`
- `MKTG 2026.xlsx`

Foram normalizados **1.335 acompanhamentos** e **1.707 movimentos financeiros**. O Planejamento 2026 contém **15 frentes estratégicas**, **104 parcelas planejadas** e **0 baixas automáticas**. Os arquivos originais permanecem em `fontes/acompanhamento/`, e as regras de transformação ficam em `scripts/gerar-carga-acompanhamento.js`.

## Instalação

1. Preserve o `.env` atual.
2. No **SQL Editor do Supabase**, execute primeiro:

```text
sql/06-CENTRAL-ACOMPANHAMENTO.sql
```

3. Para carregar os dados pelo SQL Editor, abra `sql/carga-acompanhamento-sql-editor/00-LEIA-ME.md` e execute os lotes `07-01` até `07-18`, terminando com `07-99-CONFERENCIA-FINAL.sql`. Todos podem ser executados novamente com segurança.

O arquivo integral `sql/07-CARGA-HISTORICA-ACOMPANHAMENTO.sql` permanece disponível para terminal/CLI, mas ultrapassa o limite de tamanho do editor web do Supabase.

4. Para ativar a Caixa de Entrada de documentos e a taxonomia atual, execute também:

```text
sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql
sql/09-EXCLUIR-DOCUMENTOS-PENDENTES.sql
sql/10-TAXONOMIA-DOCUMENTOS-V1.2.5.sql
```

5. Para ativar Planejamento / Receita / Fechamento e a assinatura mensal, execute:

```text
sql/11-GESTAO-MKT-V1.3.0.sql
```

No ambiente da Vercel, mantenha `GEMINI_API_KEY` com uma chave gratuita do Google AI Studio e, opcionalmente, `GEMINI_DOCUMENT_MODEL=gemini-3.7-flash`. Não é necessário ativar faturamento. Se a chave não existir ou a cota gratuita estiver indisponível, a interface usa automaticamente o OCR local.

6. Reinicie o servidor local:

```powershell
npm install
npm start
```

7. Acesse pela Central ou diretamente:

```text
http://localhost:3001/acompanhamento.html
```

Para abrir a versão local, entre primeiro no PMG Connect hospedado e navegue pela ponte autenticada. O módulo não utiliza o SQL Server local e continua disponível na versão hospedada.

## Importação das planilhas antigas

1. Abra **Importar planilhas**.
2. Envie `Fornecedores 2024/2025/2026` ou `MKTG 2026`.
3. A Central reconhecerá o modelo oficial e processará todas as abas automaticamente, inclusive Podcast, Copa, convenções, pendências, ANUGA, FISPAL, FIPAN e cartão no controle do Marcos.
4. Confira a quantidade de registros, movimentos e a conciliação dos totais.
5. Conclua a atualização.

Outras planilhas e arquivos CSV continuam usando o mapeamento manual de colunas.

O importador grava o nome do arquivo, a linha original e os dados brutos. Se o mesmo acompanhamento ou pagamento for importado novamente, o registro é atualizado sem criar uma duplicidade. Nos quatro modelos oficiais, itens retirados de uma nova versão são arquivados com histórico; registros e pagamentos criados manualmente permanecem preservados.

## Caixa de Entrada de documentos

A Caixa de Entrada recebe PDFs escaneados, separa as páginas e prepara a conferência dos três tipos operacionais usados atualmente pela PMG:

- desconto em nota, incluindo cadastro de pagamento e pedido de compra;
- depósito, incluindo nota fiscal / DANFE;
- extrato ou comprovante bancário.

O leitor sugere fornecedor, datas, números, categoria e valores. Ele mantém três valores separados para evitar lançamentos indevidos: valor total do documento, valor relacionado ao Marketing e valor efetivamente aprovado para lançamento.

Nenhum documento é lançado automaticamente. Cada item permanece em **Aguardando conferência** até uma pessoa revisar os campos, escolher se deseja criar, vincular, somente anexar ou ignorar, marcar a confirmação obrigatória e aprovar. A decisão, o colaborador e a data ficam no histórico.

A leitura principal usa o Gemini 3.7 Flash para compreender o PDF visualmente e devolver campos estruturados. A cota gratuita não exige contratação nem ativa cobrança automática. O servidor valida a sessão do PMG Connect, busca o PDF no bucket privado e mantém a chave fora do navegador.

Se o Gemini não estiver configurado, exceder a cota ou não responder, PDF.js e Tesseract.js assumem localmente no navegador. A conferência manual também permanece disponível. Em qualquer caminho, nenhum valor é lançado sem a confirmação humana já exigida pelo módulo.

### Privacidade do modo gratuito

Quando o Gemini está ativo, o conteúdo do PDF é enviado temporariamente à API do Google para interpretação. A política do free tier informa que esse conteúdo pode ser usado para melhorar os produtos. Se isso não for aceitável para os documentos da PMG, remova `GEMINI_API_KEY`: o módulo continuará funcionando com OCR local e conferência manual, sem enviar o PDF ao Gemini.

## Arquivos principais

- `public/acompanhamento.html`
- `public/assets/acompanhamento.css`
- `public/assets/acompanhamento.js`
- `public/assets/acompanhamento-documentos.js`
- `public/assets/acompanhamento-documentos.css`
- `public/assets/acompanhamento-ocr.js`
- `api/analisar-documento.js`
- `sql/06-CENTRAL-ACOMPANHAMENTO.sql`
- `sql/07-CARGA-HISTORICA-ACOMPANHAMENTO.sql`
- `sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql`
- `sql/09-EXCLUIR-DOCUMENTOS-PENDENTES.sql`
- `sql/10-TAXONOMIA-DOCUMENTOS-V1.2.5.sql`
- `sql/11-GESTAO-MKT-V1.3.0.sql`
- `data/acompanhamento-carga-inicial.json` (fora de `public/` para não expor a consolidação por URL)
- `scripts/gerar-carga-acompanhamento.js`
- `scripts/testar-acompanhamento.js`
- `RELATORIO-CONSOLIDACAO-PLANILHAS.md`
- `fontes/acompanhamento/`
- `public/central.html`

## Segurança e permissões

- Somente usuários autenticados e ativos do PMG Connect visualizam os dados.
- Toda criação e alteração registra o colaborador responsável.
- Todo documento exige confirmação humana explícita antes de gerar ou vincular um lançamento.
- Escritas são realizadas por funções protegidas no Supabase.
- Os anexos ficam em bucket privado e são abertos por link temporário.
- A rota Gemini valida a sessão Supabase, limita requisições e nunca envia a chave ao navegador.
- O `.env` e a chave `service_role` não são enviados ao navegador.

## Demonstração visual

Para revisar o layout sem cadastrar dados reais, use:

```text
/acompanhamento.html?demo=1
```

Esse modo existe apenas para validação visual e não grava informações.
