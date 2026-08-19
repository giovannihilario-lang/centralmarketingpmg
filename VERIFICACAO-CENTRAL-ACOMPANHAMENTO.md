# Verificação da Central de Acompanhamento — V3.8.0

Data da verificação: 19/08/2026

## Resultado

- JavaScript: todos os arquivos do pacote passaram por `node --check`.
- HTML: referências locais da Central e da página de Acompanhamento válidas.
- CSS: 658 blocos abertos e 658 fechados.
- Segurança: `.env`, `.git` e `node_modules` não fazem parte da entrega.
- Autenticação: credenciais legadas em texto puro removidas de `public/users.json`.
- Infraestrutura: APIs e rotas locais da versão-base restauradas no pacote final.
- Vercel: 11 funções em `api/`, dentro do limite operacional já usado pelo projeto.
- Banco: script `sql/06-CENTRAL-ACOMPANHAMENTO.sql` incluído.

## Escopo validado

- Dashboard executivo consolidado.
- Controle Marcos e Controle Marketing.
- Cadastros, edição, arquivamento e histórico de atividades.
- Parcelas, formas de pagamento, baixas e vencimentos futuros.
- Cotas anuais, campanhas de incentivo, feiras, eventos e categorias livres.
- Visão financeira, visão por fornecedor e filtros cruzados.
- Anexos privados com URL temporária.
- Importação dinâmica de Excel e CSV, com mapeamento de colunas, prévia e prevenção de duplicidades.
- Layout responsivo e redução de movimento conforme preferência do dispositivo.

## Observação sobre os dados históricos

O arquivo recebido continha o projeto PMG Connect, mas não continha planilhas `.xlsx`, `.xls` ou `.csv`. Por isso, os registros históricos de 2024, 2025 e 2026 não foram inseridos. O importador já está pronto para receber as planilhas reais e fazer o mapeamento final sem alterar o código da aplicação.
