# PMG Connect V3.8.0 — Central de Acompanhamento

## Novo módulo

- Central React para unificar Controle Marcos e Controle Marketing / Fornecedores.
- Dashboard executivo com valores acompanhados, realizado, saldo futuro e atrasos.
- Fluxo previsto x realizado por mês e composição por categoria.
- Acompanhamentos editáveis para cotas, campanhas, feiras, eventos, trade, mídia, materiais, bonificações e parcerias.
- Agenda financeira com parcelas, vencimentos, formas de pagamento e baixa do realizado.
- Visão consolidada por fornecedor.
- Importador inteligente de Excel/CSV com mapeamento de colunas, prévia e proteção contra duplicidades.
- Anexos privados para contratos, notas fiscais, boletos, propostas e comprovantes.
- Histórico automático de alterações e atualização em tempo real.
- Interface responsiva com animações, transições, cards interativos e respeito a movimento reduzido.
- Carga histórica real com 1.182 acompanhamentos e 1.554 movimentos financeiros.
- Reconhecimento automático dos quatro modelos oficiais e leitura de todas as abas em uma única atualização.
- Conciliação integral de novas versões: valores corrigidos atualizam o mesmo movimento e itens retirados são arquivados com histórico, sem afetar lançamentos manuais.
- Conciliação entre o Controle Marcos e o Controle Marketing, com marcadores de R$ 1,00 ignorados e divergências preservadas para conferência.
- Separação entre receita, despesa, indicador executivo e detalhamento sem duplicação nos totais.
- Paginação progressiva para manter a navegação rápida mesmo com toda a base histórica carregada.
- Tela de ativação resiliente: quando as estruturas ainda não existem no Supabase, a página orienta a execução dos SQLs em vez de permanecer em branco.
- Carga histórica dividida em 16 lotes de até 200 KB para respeitar o limite do SQL Editor do Supabase, com conferência final automática.
- Correção do branco após o carregamento: fragmentos JSX incompatíveis com HTM foram substituídos por elementos HTML válidos e os assets passaram para a versão `1.0.2`.
- Redesign `1.1.0` no formato de cockpit executivo: hero contextual, índice de saúde operacional, radar de atenção, visão Marcos × Marketing, cards de sinais e dashboard bento responsivo.
- Central de comandos com `Ctrl/Cmd + K`, pesquisa unificada de fornecedores e acompanhamentos, navegação por teclado e atalhos para as principais ações.
- Nova linguagem visual PMG com profundidade, microinterações, animações progressivas, estados de foco, acabamento premium e adaptação completa para celular.
- Caixa de Entrada `1.2.0` para PDFs escaneados, com upload privado, fila visual, prévia por página e quatro classificações oficiais.
- Extração assistida de fornecedor, datas, identificadores e valores, mantendo separados total do documento, parcela do Marketing e valor aprovado.
- Conferência humana obrigatória antes de qualquer criação, vínculo, anexo ou baixa; decisão e responsável ficam auditados.
- Tratamento seguro de modelos desconhecidos como `Não identificado`, sem lançamento automático.
- Hotfix `1.2.1`: corrige a tela branca causada pela limpeza incorreta do efeito de ícones e reutiliza a sessão Supabase hospedada no endpoint de leitura, eliminando o `401` após o upload.
- Versão `1.2.2`: substitui a leitura por API paga por OCR local gratuito com PDF.js + Tesseract.js, remove a função serverless e elimina qualquer necessidade de chave, crédito ou contratação.

## Integração

- Novo acesso em `public/central.html`.
- Autenticação reaproveita a sessão única do PMG Connect.
- Persistência usa Supabase com RLS e funções protegidas, sem criar uma nova função Vercel.
- Migração idempotente em `sql/06-CENTRAL-ACOMPANHAMENTO.sql`.
- Carga idempotente em `sql/07-CARGA-HISTORICA-ACOMPANHAMENTO.sql`.
- Caixa de documentos e fluxo de aprovação em `sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql`.
- Leitura local em `public/assets/acompanhamento-ocr.js`, sem chave e sem custo de API.

## Segurança

- Credenciais legadas removidas de `public/users.json`.
- Anexos armazenados em bucket privado com links temporários.
- Criação e edição registram o colaborador autenticado.

## Instalação

Consulte `README-acompanhamento.md` antes do primeiro acesso.
