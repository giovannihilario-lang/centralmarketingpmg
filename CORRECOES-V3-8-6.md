# PMG Connect Demandas V3.8.6

Correções principais:

- Migração não falha mais quando existem estados históricos em `demandas_recorrentes_ocorrencias`.
- Estados legados são normalizados antes da recriação do CHECK.
- Trabalho individual não chama mais a RPC antiga `avaliar_conclusao`.
- Uma única pessoa é validada e concluída diretamente pela rotina de autoria.
- Duas ou mais pessoas continuam usando confirmação coletiva.
- O frontend não bloqueia a validação apenas porque o snapshot local de autoria ainda não atualizou.
- Cache-buster de Demandas atualizado para V3.8.6.

Para um banco que já está em produção, execute apenas `EXECUTAR-AGORA-DEMANDAS-V3-8-6.sql`.
