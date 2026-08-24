# PMG Connect — Demandas V3.8.1 UX Operacional

## Objetivo

Melhorar o uso diário do módulo Demandas sem substituir a base existente e sem remover funcionalidades anteriores.

## Principais mudanças

- Autoria simplificada: uma pessoa executora encerra direto após validação; duas ou mais pessoas iniciam confirmação coletiva.
- Remoção da regra de confirmação baseada em autoridade/papel do executor.
- Nova visão **Minha Mesa** com Agora, Depois, Aguardando alguém e Concluído hoje.
- Bloco **Precisa da sua ação** na Home para validações, autoria, ajustes, imediatas e atrasos.
- Ações rápidas diretamente nos cards: iniciar, enviar para revisão, validar, comentar e abrir.
- Nova demanda com informações essenciais primeiro; detalhes opcionais ficam em **Mais opções**.
- Visões de filtros salvas por usuário no navegador.
- Recorrência com vários horários no mesmo dia, agrupados como uma única rotina operacional.
- Edição, pausa e encerramento de rotinas multi-horário afetam o grupo corretamente.
- `@menções` em comentários com notificação direcionada.
- Anexos privados em demandas usando Supabase Storage e URL assinada.
- Ctrl+K com comandos naturais para criar demanda, abrir Minha Mesa e localizar a fila de uma pessoa.
- Bloqueios por dependência mais visíveis nos cards.
- Identificação mais clara de responsabilidade individual versus trabalho em conjunto.

## Instalação

1. Execute `sql/13-DEMANDAS-UX-V3-8-1.sql` no SQL Editor do Supabase.
2. Publique os arquivos de `public/` incluídos no patch.
3. Se o deploy usa o espelho `public/public/`, publique também os arquivos correspondentes já incluídos no pacote.
4. Recarregue o PMG Connect autenticado e teste uma demanda individual e outra compartilhada.

## Regra de autoria V3.8.1

- 1 executor selecionado na validação: conclui imediatamente, sem popup de confirmação.
- 2 ou mais executores: todos os participantes selecionados recebem a confirmação coletiva.
- Contestação mantém a demanda em revisão para correção dos participantes.
- O papel do executor não altera a regra.

## Validações realizadas

- `node --check` no JavaScript: aprovado.
- HTML analisado sem IDs duplicados.
- CSS com chaves balanceadas.
- Arquivos espelhados `public/` e `public/public/` conferidos byte a byte.
- A alteração do JavaScript preserva a base anterior e acrescenta a camada V3.8.1 ao final, sem remover funções existentes.
