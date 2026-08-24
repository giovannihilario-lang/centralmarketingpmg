# PMG Connect V1.6.0 — Central unificada

## O que mudou

- A interface deixou de separar a operação em “Marcos” e “Marketing”.
- Os registros agora são identificados pelo fluxo real: **Planejamento**, **Recebimento**, **Investimento**, **Detalhamento**, **Pendência** ou **Indicador**.
- O fechamento mensal compara **Recebido x Previsto** e pode ser conferido por qualquer usuário autenticado e ativo.
- O cadastro manual não pergunta mais a qual “controle” o registro pertence.
- A importação identifica os modelos oficiais e mostra somente destinos operacionais: **Recebimentos e fornecedores** ou **Planejamento e metas**.
- A Caixa de Documentos também deixou de pedir um controle.
- Importação, conferência, divergência, arquivamento, exclusão de pagamento e exclusão de PDF pendente não dependem mais do rótulo gestor/colaborador.
- A autenticação continua obrigatória, documentos aprovados continuam protegidos e autor/data continuam registrados na auditoria.

## Compatibilidade das planilhas

Os valores internos `marcos` e `marketing` foram mantidos apenas no banco e no importador para reconhecer arquivos antigos sem quebrar fingerprints, reimportações ou histórico. Eles não aparecem mais como divisão da experiência.

## Ativação no Supabase

Execute uma vez, depois dos scripts anteriores:

```text
sql/13-CENTRAL-UNIFICADA-V1.6.0.sql
```

Depois publique os arquivos da versão e atualize a página com `Ctrl + F5`.

