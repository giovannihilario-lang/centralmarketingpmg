# PMG Connect V3.8.1 — Academia: inscrições, presenças e bônus

## O que foi adicionado

- Nova aba **Academia PMG → Inscrições e Presenças**.
- O fluxo novo é independente de **Reservas** e **Solicitações**.
- O Forms de inscrição oficial fica separado do `forms_url` já usado pelas reservas:
  - `https://forms.gle/9FANZaCTBquJaRkz7`
- Importação de respostas do Forms em `.xlsx`, `.xls` ou `.csv` com mapeamento de colunas.
- Vínculo de cada inscrição com um treinamento cadastrado na Academia PMG.
- Conciliação com a lista de representantes já carregada pelo contexto local do módulo Campanhas.
- Vínculo automático quando o código ou o nome normalizado do representante coincidem exatamente.
- Ajuste manual do representante por inscrição.
- Toggle **SIM/NÃO** para confirmar presença.
- Regra de bônus: **+10 pontos percentuais por treinamento distinto com presença confirmada, limitado a +30% por representante**.
- Duplicidades de inscrição no mesmo treinamento não multiplicam o bônus.
- Exportação Excel com três abas:
  - `BONUS_CAMPANHAS`: lista completa de representantes do contexto comercial e o acréscimo correspondente.
  - `PRESENCAS`: auditoria detalhada das inscrições e confirmações.
  - `LEIA-ME`: regra usada no cálculo.
- O Excel não altera venda real nem crescimento original. Ele exporta o **acréscimo de crescimento** separadamente para ser usado na apuração.

## Banco de dados

Execute no Supabase SQL Editor, uma única vez:

`sql/12-ACADEMIA-INSCRICOES-PRESENCAS-V3.8.1.sql`

A migração cria `academia_inscricoes` e as RPCs específicas de inscrição/presença. Ela **não altera nem substitui** `academia_reservas` e não mexe no Forms de solicitações de espaço.

## Fluxo de uso

1. Cadastre normalmente o treinamento na aba **Treinamentos**.
2. Abra **Inscrições e Presenças**.
3. Exporte as respostas do Forms e use **Importar inscrições**.
4. Escolha o treinamento correspondente e confira o mapeamento das colunas.
5. Atualize os representantes do SQL se necessário.
6. Corrija vínculos pendentes usando a lista de representantes.
7. No dia do treinamento, marque **SIM** para quem compareceu.
8. Use **Exportar Excel** para gerar a planilha destinada à apuração das campanhas.
