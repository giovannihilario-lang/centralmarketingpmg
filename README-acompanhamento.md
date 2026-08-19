# PMG Connect — Central de Acompanhamento V1

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

## Instalação

1. Preserve o `.env` atual.
2. No **SQL Editor do Supabase**, execute:

```text
sql/06-CENTRAL-ACOMPANHAMENTO.sql
```

3. Reinicie o servidor local:

```powershell
npm install
npm start
```

4. Acesse pela Central ou diretamente:

```text
http://localhost:3001/acompanhamento.html
```

Para abrir a versão local, entre primeiro no PMG Connect hospedado e navegue pela ponte autenticada. O módulo não utiliza o SQL Server local e continua disponível na versão hospedada.

## Importação das planilhas antigas

1. Abra **Importar planilhas**.
2. Escolha o destino: **Marcos / Presidência** ou **Marketing / Fornecedores**.
3. Informe o ano de referência.
4. Envie o arquivo `.xlsx`, `.xls`, `.xlsm` ou `.csv`.
5. Confira o mapeamento sugerido das colunas.
6. Valide a prévia e conclua a importação.

O importador grava o nome do arquivo, a linha original e os dados brutos. Se o mesmo acompanhamento ou pagamento for importado novamente, o registro é atualizado sem criar uma duplicidade.

## Arquivos principais

- `public/acompanhamento.html`
- `public/assets/acompanhamento.css`
- `public/assets/acompanhamento.js`
- `sql/06-CENTRAL-ACOMPANHAMENTO.sql`
- `public/central.html`

## Segurança e permissões

- Somente usuários autenticados e ativos do PMG Connect visualizam os dados.
- Toda criação e alteração registra o colaborador responsável.
- Escritas são realizadas por funções protegidas no Supabase.
- Os anexos ficam em bucket privado e são abertos por link temporário.
- O `.env` e a chave `service_role` não são enviados ao navegador.

## Demonstração visual

Para revisar o layout sem cadastrar dados reais, use:

```text
/acompanhamento.html?demo=1
```

Esse modo existe apenas para validação visual e não grava informações.
