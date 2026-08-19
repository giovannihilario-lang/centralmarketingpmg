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

## Integração

- Novo acesso em `public/central.html`.
- Autenticação reaproveita a sessão única do PMG Connect.
- Persistência usa Supabase com RLS e funções protegidas, sem criar uma nova função Vercel.
- Migração idempotente em `sql/06-CENTRAL-ACOMPANHAMENTO.sql`.

## Segurança

- Credenciais legadas removidas de `public/users.json`.
- Anexos armazenados em bucket privado com links temporários.
- Criação e edição registram o colaborador autenticado.

## Instalação

Consulte `README-acompanhamento.md` antes do primeiro acesso.
