# Verificação da Central de Acompanhamento — V3.8.0

Data da verificação: 19/08/2026

## Resultado

- JavaScript: todos os arquivos do pacote passaram por `node --check`.
- HTML: referências locais da Central e da página de Acompanhamento válidas.
- CSS: blocos abertos e fechados validados automaticamente.
- Segurança: `.env`, `.git` e `node_modules` não fazem parte da entrega.
- Dados privados: o snapshot consolidado fica em `data/`, fora da raiz pública do Vercel.
- Autenticação: credenciais legadas em texto puro removidas de `public/users.json`.
- Infraestrutura: APIs e rotas locais da versão-base restauradas no pacote final.
- Vercel: 12 funções no pacote completo, incluindo o leitor Gemini protegido, dentro do limite operacional do projeto.
- Banco: estrutura em `sql/06-CENTRAL-ACOMPANHAMENTO.sql` e carga real idempotente em `sql/07-CARGA-HISTORICA-ACOMPANHAMENTO.sql`.
- Dados: 1.182 acompanhamentos e 1.554 movimentos financeiros normalizados.
- Conciliação: totais mensais das três planilhas Fornecedores fecham com as respectivas abas.
- Atualizações futuras: os quatro modelos oficiais são reconhecidos e processados em todas as abas sem duplicação; correções atualizam os mesmos movimentos e itens removidos são arquivados com histórico.

## Escopo validado

- Dashboard executivo consolidado.
- Controle Marcos e Controle Marketing.
- Cadastros, edição, arquivamento e histórico de atividades.
- Parcelas, formas de pagamento, baixas e vencimentos futuros.
- Cotas anuais, campanhas de incentivo, feiras, eventos e categorias livres.
- Visão financeira, visão por fornecedor e filtros cruzados.
- Anexos privados com URL temporária.
- Importação dinâmica de Excel e CSV, com mapeamento de colunas, prévia e prevenção de duplicidades.
- Reconhecimento especial de `Fornecedores 2024/2025/2026` e `MKTG 2026`.
- Separação entre receitas, despesas, indicadores executivos e detalhamentos.
- Layout responsivo e redução de movimento conforme preferência do dispositivo.
- PDFs com leitura visual Gemini, saída estruturada, fallback OCR local e conferência humana obrigatória.

## Dados históricos

As fontes `Fornecedores 2024.xlsx`, `Fornecedores 2025.xlsx`, `Fornecedores 2026.xlsx` e `MKTG 2026.xlsx` foram preservadas em `fontes/acompanhamento/`. A metodologia, os totais e as diferenças entre os controles estão documentados em `RELATORIO-CONSOLIDACAO-PLANILHAS.md`.
