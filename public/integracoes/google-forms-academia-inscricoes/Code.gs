/**
 * PMG Connect V3.8.4 — Google Forms -> Inscrições da Academia PMG
 *
 * Instale ESTE script somente na PLANILHA DE RESPOSTAS do Forms de inscrição.
 * Ele NÃO é o conector do Forms de reservas da Academia.
 */

const PMG = {
  WEBHOOK_URL: 'https://pmg-marketing.vercel.app/api/notificar-demandas?academia=inscricoes',
  WEBHOOK_SECRET: 'COLE_AQUI_O_MESMO_SEGREDO_DA_VERCEL',

  // Opcional. Se este Forms for de um único treinamento, escreva exatamente
  // o título cadastrado na Academia PMG. Se o Forms já pergunta qual é o
  // treinamento/evento, deixe vazio para o Connect tentar identificar sozinho.
  TREINAMENTO_PADRAO: ''
};

function instalarIntegracaoPMG() {
  validarConfiguracao_();
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'enviarInscricaoPMG')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('enviarInscricaoPMG')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  SpreadsheetApp.getUi().alert(
    'PMG Connect',
    'Integração instalada. As próximas respostas deste Forms serão enviadas automaticamente para Inscrições e Presenças.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function removerIntegracaoPMG() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'enviarInscricaoPMG')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function enviarInscricaoPMG(e) {
  if (!e || !e.range) throw new Error('Esta função deve ser executada pelo gatilho de envio do formulário.');
  enviarLinha_(e.range.getSheet(), e.range.getRow());
}

/**
 * Execute uma única vez para trazer as respostas que já existem no Forms ATUAL.
 * Forms antigos continuam podendo ser importados por XLSX/CSV no PMG Connect.
 */
function sincronizarRespostasExistentesPMG() {
  validarConfiguracao_();
  const spreadsheet = SpreadsheetApp.getActive();
  const sheets = spreadsheet.getSheets();
  let enviados = 0;
  let falhas = 0;

  sheets.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) return;
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    const pareceResposta = headers.some(h => /carimbo|timestamp|nome|e-?mail|representante|vendedor/i.test(String(h || '')));
    if (!pareceResposta) return;

    for (let row = 2; row <= lastRow; row++) {
      try {
        enviarLinha_(sheet, row);
        enviados++;
      } catch (error) {
        falhas++;
        console.error(`Falha na linha ${row} de ${sheet.getName()}: ${error.message}`);
      }
    }
  });

  SpreadsheetApp.getUi().alert(
    'PMG Connect',
    `${enviados} resposta(s) enviada(s).${falhas ? ` ${falhas} falha(s); consulte o log do Apps Script.` : ''}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function testarIntegracaoPMG() {
  validarConfiguracao_();
  const response = UrlFetchApp.fetch(PMG.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Academia-Inscricoes-Secret': PMG.WEBHOOK_SECRET },
    payload: JSON.stringify({ dryRun: true }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`Webhook respondeu HTTP ${code}: ${text}`);
  SpreadsheetApp.getUi().alert('PMG Connect', 'Conector autorizado e respondendo corretamente.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function gerarSegredoPMG() {
  const secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  console.log(secret);
  SpreadsheetApp.getUi().alert(
    'Segredo gerado',
    'O segredo foi gravado no registro de execução. Copie-o e use o MESMO valor em ACADEMIA_INSCRICOES_WEBHOOK_SECRET na Vercel e em PMG.WEBHOOK_SECRET neste script.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function enviarLinha_(sheet, row) {
  validarConfiguracao_();
  const spreadsheet = sheet.getParent();
  const lastColumn = sheet.getLastColumn();
  if (row < 2 || lastColumn < 1) return;

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const data = sheet.getRange(row, 1, 1, lastColumn).getDisplayValues()[0];
  const values = {};
  headers.forEach((header, index) => {
    const key = String(header || `Coluna ${index + 1}`).trim();
    values[key] = data[index] == null ? '' : String(data[index]);
  });

  const payload = {
    responseId: `google-sheet:${spreadsheet.getId()}:${sheet.getSheetId()}:${row}`,
    submittedAt: new Date().toISOString(),
    spreadsheetId: spreadsheet.getId(),
    sheetName: sheet.getName(),
    row,
    trainingName: PMG.TREINAMENTO_PADRAO || null,
    values
  };

  const response = UrlFetchApp.fetch(PMG.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Academia-Inscricoes-Secret': PMG.WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`PMG Connect respondeu HTTP ${code}: ${response.getContentText()}`);
  }
}

function validarConfiguracao_() {
  if (!/^https:\/\//i.test(PMG.WEBHOOK_URL)) throw new Error('Preencha PMG.WEBHOOK_URL com a URL HTTPS do PMG Connect.');
  if (!PMG.WEBHOOK_SECRET || PMG.WEBHOOK_SECRET.includes('COLE_AQUI')) {
    throw new Error('Preencha PMG.WEBHOOK_SECRET antes de instalar a integração.');
  }
}
