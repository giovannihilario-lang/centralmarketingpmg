# PMG Connect V3.8.2 — Demandas recorrentes várias vezes ao dia

## Alteração

- Mantém o comportamento atual de uma ocorrência por dia como padrão.
- Adiciona a opção **Mais de uma vez por dia** ao criar uma demanda recorrente.
- Permite até 8 horários diferentes no mesmo dia válido da recorrência.
- Cada horário adicional possui horário da ocorrência e horário próprio de popup.
- Cada ocorrência é criada e concluída separadamente.
- Responsáveis, modo de responsabilidade, prioridade, briefing, projeto, checklist, frequência e dias da semana são preservados em todos os horários.
- Não altera o banco de dados nem exige nova migração: utiliza a estrutura de recorrências já instalada.
- Reservas, Academia PMG, Inscrições e Presenças e Campanhas não foram alterados.

## Implementação

Para preservar compatibilidade com a estrutura atual, cada horário do mesmo dia é registrado como uma série recorrente irmã, com os mesmos dados da demanda e horário próprio. Assim o processador existente continua funcionando sem mudança de schema ou RPC.
