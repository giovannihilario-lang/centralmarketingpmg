# Instalação — Planilhas Vivas V1.5.0

## Patch
Copie o conteúdo do ZIP de patch sobre a raiz do projeto atual, preservando as pastas.

## Banco
A edição de registros e pagamentos usa as funções que já fazem parte da Central. Para o botão de conferência funcionar, a estrutura de `sql/11-GESTAO-MKT-V1.3.0.sql` precisa estar aplicada no Supabase. Se ela já foi executada em versões anteriores, não é necessário repetir.

## Dados
A versão mais recente de `MKTG 2026.xlsx` já está em `fontes/acompanhamento/` e `public/fontes/acompanhamento/`. A carga inicial e o SQL histórico também foram regenerados.

## Uso rápido
- Abra `Planilha de pagamentos`.
- Escolha o ano e clique no mês.
- Clique em uma célula para editar.
- Clique `Dar baixa` para marcar o pagamento como pago.
- Clique no check de `Conferência` para assinar a linha como correta.
- Em `Receita anual`, edite previsão ou qualquer mês diretamente na matriz.
- Em `Planejamento PMG`, edite qualquer célula mensal da matriz.
