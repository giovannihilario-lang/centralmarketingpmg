# PMG Connect V3.8.4 — Inscrições automáticas da Academia

- Forms de reservas/solicitações permanece intacto e usa seu fluxo anterior.
- Novo webhook separado: `POST /api/notificar-demandas?academia=inscricoes`.
- Novo segredo independente: `ACADEMIA_INSCRICOES_WEBHOOK_SECRET`.
- Apps Script pronto para a planilha de respostas do Forms de inscrição atual.
- Cada nova resposta entra diretamente em `academia_inscricoes`, com deduplicação.
- Reenvios preservam vínculo manual e presença já confirmada.
- Tentativa segura de identificar o treinamento pelo título/pergunta do Forms.
- Conciliação automática de representantes pendentes quando o contexto do Campanhas está disponível.
- Botão **Sincronizar agora** atualiza a lista sem depender de novo envio.
- Importador existente virou **Importar histórico**, destinado a XLSX/CSV de Forms antigos.
- O Forms atual pode ter suas respostas já existentes sincronizadas uma única vez pelo Apps Script.
- Nenhuma nova função Serverless foi criada: o fluxo reutiliza `api/notificar-demandas.js`, preservando o limite do plano da Vercel.
- Nenhuma nova migração SQL além da V3.8.1 é necessária.
