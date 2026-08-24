# Integração automática — Forms de inscrições da Academia PMG

Esta integração é **somente para inscrições de treinamento**. Ela não substitui nem altera o Forms de reservas/solicitações da Academia.

## Ativação única

1. Na Vercel, adicione a variável `ACADEMIA_INSCRICOES_WEBHOOK_SECRET` com um valor longo e aleatório e faça um novo deploy.
2. Abra a **planilha de respostas** do Forms `https://forms.gle/9FANZaCTBquJaRkz7`.
3. Vá em **Extensões → Apps Script**.
4. Cole o conteúdo de `Code.gs`.
5. Em `PMG.WEBHOOK_SECRET`, coloque exatamente o mesmo segredo configurado na Vercel.
6. Se o seu domínio não for `https://pmg-marketing.vercel.app`, ajuste `PMG.WEBHOOK_URL`.
7. Execute `testarIntegracaoPMG()`.
8. Execute `instalarIntegracaoPMG()` e conceda as permissões pedidas pelo Google.
9. Para trazer também respostas que já existem no Forms atual, execute uma vez `sincronizarRespostasExistentesPMG()`.

Depois disso, cada nova resposta é enviada automaticamente ao PMG Connect. A tabela `academia_inscricoes` já está no Realtime, então a pessoa aparece em **Demandas → Academia PMG → Inscrições e Presenças** sem exportar planilha.

## Treinamento

Se o Forms tiver uma pergunta como `Treinamento`, `Evento` ou `Curso`, o Connect tenta encontrar o treinamento cadastrado pelo título. Se este Forms for exclusivo de um treinamento, preencha `PMG.TREINAMENTO_PADRAO` com o título exatamente como está cadastrado na Academia. Se não houver correspondência segura, a inscrição entra **sem vínculo de treinamento** para você selecionar depois; ela não gera bônus até ser vinculada.

## Representante

O Connect tenta conciliar automaticamente por código ou nome exato quando a lista de representantes do Campanhas estiver disponível. Correspondências ambíguas continuam pendentes para ajuste manual.

## Histórico de outros Forms

Não instale este script em cada Forms antigo. Exporte XLSX/CSV e use **Importar histórico** no Connect. A importação é deduplicada pela chave da resposta quando disponível.
