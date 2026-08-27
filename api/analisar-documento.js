import { createClient } from '@supabase/supabase-js';
import { bearerToken, requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';

const MAX_REQUESTS_PER_MINUTE = 6;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const GEMINI_TIME_BUDGET_MS = 48_000;
const GEMINI_RETRY_DELAYS_MS = [500, 900];
const DEFAULT_GEMINI_MODELS = Object.freeze(['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
const recentRequests = new Map();
const DOCUMENT_TYPES = new Set(['desconto_nota', 'deposito', 'extrato_bancario', 'nao_identificado']);
const LEGACY_DOCUMENT_TYPES = Object.freeze({ cadastro_pagamento:'desconto_nota', pedido_compra:'desconto_nota', danfe:'deposito' });
const NATURES = new Set(['receita', 'despesa', 'neutro']);
const CATEGORIES = new Set(['cota_anual', 'campanha_incentivo', 'feira', 'evento', 'acao_trade', 'midia', 'material', 'bonificacao', 'parceria', 'social', 'equipe', 'pendencia', 'outro']);

export const DOCUMENT_SCHEMA = {
  type:'object',
  additionalProperties:false,
  properties:{
    total_paginas:{ type:'integer', minimum:1 },
    resumo:{ type:'string' },
    documentos:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        properties:{
          ordem:{ type:'integer', minimum:1 },
          paginas:{ type:'array', items:{ type:'integer', minimum:1 } },
          tipo:{ type:'string', enum:[...DOCUMENT_TYPES] },
          confianca:{ type:'number', minimum:0, maximum:1 },
          fornecedor:{ type:['string', 'null'] },
          cnpj:{ type:['string', 'null'] },
          fornecedor_codigo:{ type:['string', 'null'] },
          numero_documento:{ type:['string', 'null'] },
          numero_pedido:{ type:['string', 'null'] },
          numero_nota:{ type:['string', 'null'] },
          data_emissao:{ type:['string', 'null'] },
          vencimento:{ type:['string', 'null'] },
          data_pagamento:{ type:['string', 'null'] },
          valor_total_documento:{ type:['number', 'null'] },
          valor_marketing:{ type:['number', 'null'] },
          valor_lancamento_sugerido:{ type:['number', 'null'] },
          natureza_sugerida:{ type:'string', enum:[...NATURES] },
          categoria_sugerida:{ type:'string', enum:[...CATEGORIES] },
          forma_pagamento:{ type:['string', 'null'] },
          titulo_sugerido:{ type:'string' },
          descricao:{ type:'string' },
          observacoes:{ type:'string' },
          evidencias:{ type:'array', items:{ type:'string' } },
          alertas:{ type:'array', items:{ type:'string' } },
          campos_duvidosos:{ type:'array', items:{ type:'string' } },
        },
        required:[
          'ordem', 'paginas', 'tipo', 'confianca', 'fornecedor', 'cnpj', 'fornecedor_codigo',
          'numero_documento', 'numero_pedido', 'numero_nota', 'data_emissao', 'vencimento',
          'data_pagamento', 'valor_total_documento', 'valor_marketing', 'valor_lancamento_sugerido',
          'natureza_sugerida', 'categoria_sugerida', 'forma_pagamento', 'titulo_sugerido',
          'descricao', 'observacoes', 'evidencias', 'alertas', 'campos_duvidosos'
        ],
      },
    },
  },
  required:['total_paginas', 'resumo', 'documentos'],
};

const INSTRUCTIONS = `
Voce e o leitor de documentos financeiros da Central de Acompanhamento da PMG.
Analise visualmente o PDF inteiro, inclusive paginas escaneadas, tabelas, marca-texto, carimbos e anotacoes.

Classifique cada documento ou grupo de paginas em exatamente um destes tipos:
- desconto_nota: desconto em nota. Inclui tanto cadastro/ficha interna de pagamento quanto pedido/ordem de compra quando o documento representa desconto, sobra ou verba de Marketing;
- deposito: deposito. Inclui nota fiscal ou DANFE, conforme a classificacao operacional usada pela PMG;
- extrato_bancario: extrato ou comprovante bancario;
- nao_identificado: quando nao houver evidencia suficiente para os tres modelos conhecidos.

Regras obrigatorias:
1. Um PDF pode conter varias paginas do mesmo documento ou documentos diferentes. Agrupe paginas relacionadas e separe documentos distintos. Nao crie um item por pagina se as paginas pertencem ao mesmo documento.
2. Antes de preencher valores, identifique visualmente os rotulos e a relacao entre eles. Nunca escolha simplesmente o maior numero da pagina.
3. Nunca confunda o total da compra, nota ou pagamento com o valor efetivamente relacionado ao Marketing. valor_lancamento_sugerido so pode existir quando houver evidencia direta de Marketing/MKT, acordo, sobra, desconto/verba, bonificacao, ou uma movimentacao bancaria claramente ligada ao fornecedor. Caso contrario, use null.
4. Procure MKT, marketing, acordo, sobra, desconto, verba, bonificacao, doacao, brinde, transferencia recebida e destaques visuais. Dê prioridade a texto destacado, campos rotulados e linhas de totais claramente nomeadas.
5. Em desconto_nota, reconheca tanto cadastro de pagamento quanto pedido de compra. O valor de Marketing tem prioridade sobre total do pedido, valor bruto e valor liquido. Preserve esses valores distintos na descricao quando existirem.
6. Em deposito originado de nota fiscal/DANFE de remessa em bonificacao, doacao ou brinde, o total da nota pode ser sugerido como valor de Marketing apenas quando essa natureza estiver clara no documento. Sugira categoria bonificacao e natureza receita e crie alerta de validacao humana.
7. Em extrato bancario, extraia somente a movimentacao destacada ou claramente ligada ao fornecedor/Marketing. Nao transforme cada linha do extrato em um documento e nao use o saldo da conta como valor do lancamento.
8. fornecedor significa a contraparte externa da PMG. Nao use PMG, PMG Atacadista, PAMA ou o titular da propria conta como fornecedor quando o documento mostrar uma contraparte externa. Em DANFE normalmente use o emitente quando a PMG for destinataria; em extrato use o remetente da movimentacao escolhida. Prefira o nome comercial curto e reconhecivel do fornecedor, removendo apenas sufixos de razao social como S.A., LTDA ou EIRELI quando isso for seguro. Preserve marcas compostas inteiras, por exemplo Gomes da Costa; nunca reduza uma marca composta apenas ao primeiro termo.
9. numero_nota e numero_documento nao podem ser CNPJ, chave de acesso de NF-e, numero de pedido ou codigo aleatorio. Respeite o rotulo visual correspondente.
10. Datas devem usar AAAA-MM-DD e existir no calendario. Valores devem ser numeros em reais, preservando centavos. Quando nao houver certeza, use null e liste o campo em campos_duvidosos.
11. Nao invente fornecedor, numero, data, forma de pagamento ou valor. Cite evidencias curtas retiradas do proprio documento, de preferencia contendo o rotulo que justificou o campo.
12. A confianca deve refletir a qualidade real da leitura. Se houver ambiguidade relevante de fornecedor, tipo ou valor, use confianca abaixo de 0.70 e liste os campos duvidosos.
13. Todo resultado e apenas uma proposta e precisa de conferencia humana. Inclua um alerta de conferencia em cada item.
14. Se surgir um layout diferente dos tres modelos, use nao_identificado e preencha somente o que estiver claro, sem forcar uma classificacao.
`.trim();

function textValue(value, max = 2000) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, max) || null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function stringArray(value, maxItems = 20) {
  return Array.isArray(value) ? value.map(item => textValue(item, 500)).filter(Boolean).slice(0, maxItems) : [];
}

function isoDateValue(value) {
  const text = textValue(value, 10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : null;
}

function looksLikePmg(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\bpmg\b|pmg atacadista|\bpama\b/.test(normalized);
}

function hasMarketingEvidence(document) {
  const evidence = [...stringArray(document?.evidencias), textValue(document?.descricao, 3000), textValue(document?.observacoes, 3000)]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /marketing|\bmkt\b|acordo|sobra|desconto|verba|bonif|doacao|brinde|transfer|pix|ted|credito|recebid/.test(evidence);
}

export function validateAnalysis(value) {
  const source = value && typeof value === 'object' ? value : {};
  const documents = Array.isArray(source.documentos) ? source.documentos : [];
  const cleaned = documents.slice(0, 50).map((document, index) => {
    const pages = Array.isArray(document.paginas)
      ? [...new Set(document.paginas.map(Number).filter(page => Number.isInteger(page) && page > 0))].sort((a, b) => a - b)
      : [];
    const alerts = stringArray(document.alertas);
    const doubts = stringArray(document.campos_duvidosos);
    let supplier = textValue(document.fornecedor, 300);
    let marketingAmount = numericValue(document.valor_marketing);
    let launchAmount = numericValue(document.valor_lancamento_sugerido);
    const totalAmount = numericValue(document.valor_total_documento);
    const type = DOCUMENT_TYPES.has(document.tipo) ? document.tipo : (LEGACY_DOCUMENT_TYPES[document.tipo] || 'nao_identificado');
    if (supplier && looksLikePmg(supplier)) {
      supplier = null;
      if (!doubts.includes('fornecedor')) doubts.push('fornecedor');
      alerts.push('A IA indicou a propria PMG/PAMA como fornecedor; o campo foi limpo para evitar vinculacao incorreta.');
    }
    if (type !== 'extrato_bancario' && totalAmount !== null && launchAmount !== null && launchAmount > totalAmount * 1.01) {
      launchAmount = null;
      marketingAmount = null;
      if (!doubts.includes('valor_lancamento_sugerido')) doubts.push('valor_lancamento_sugerido');
      alerts.push('O valor sugerido para lancamento excedia o total do documento e foi removido para conferencia.');
    }
    if (launchAmount !== null && type !== 'extrato_bancario' && type !== 'deposito' && !hasMarketingEvidence(document)) {
      launchAmount = null;
      marketingAmount = null;
      if (!doubts.includes('valor_lancamento_sugerido')) doubts.push('valor_lancamento_sugerido');
      alerts.push('Nao havia evidencia textual suficiente para sustentar o valor de Marketing; o campo foi deixado em branco.');
    }
    if (!alerts.some(alert => /confer/i.test(alert))) alerts.push('Confira o PDF original antes de criar ou vincular qualquer lancamento.');
    return {
      ordem:index + 1,
      paginas:pages.length ? pages : [index + 1],
      tipo:type,
      confianca:Math.max(0, Math.min(1, Number(document.confianca) || 0)),
      fornecedor:supplier,
      cnpj:textValue(document.cnpj, 30),
      fornecedor_codigo:textValue(document.fornecedor_codigo, 80),
      numero_documento:textValue(document.numero_documento, 120),
      numero_pedido:textValue(document.numero_pedido, 120),
      numero_nota:textValue(document.numero_nota, 120),
      data_emissao:isoDateValue(document.data_emissao),
      vencimento:isoDateValue(document.vencimento),
      data_pagamento:isoDateValue(document.data_pagamento),
      valor_total_documento:totalAmount,
      valor_marketing:marketingAmount,
      valor_lancamento_sugerido:launchAmount,
      natureza_sugerida:NATURES.has(document.natureza_sugerida) ? document.natureza_sugerida : 'neutro',
      categoria_sugerida:CATEGORIES.has(document.categoria_sugerida) ? document.categoria_sugerida : 'outro',
      forma_pagamento:textValue(document.forma_pagamento, 120),
      titulo_sugerido:textValue(document.titulo_sugerido, 300) || 'Documento aguardando conferencia',
      descricao:textValue(document.descricao, 3000) || '',
      observacoes:textValue(document.observacoes, 3000) || '',
      evidencias:stringArray(document.evidencias),
      alertas:alerts,
      campos_duvidosos:doubts,
    };
  });
  const lastPage = cleaned.flatMap(item => item.paginas).reduce((max, page) => Math.max(max, page), 1);
  return {
    total_paginas:Math.max(1, Number.parseInt(source.total_paginas, 10) || lastPage),
    resumo:textValue(source.resumo, 2000) || 'Documento preparado pela IA para conferencia humana.',
    documentos:cleaned,
    modelo_leitura:process.env.GEMINI_DOCUMENT_MODEL || 'gemini-3.7-flash',
  };
}

function interactionText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const steps = Array.isArray(response?.steps) ? [...response.steps].reverse() : [];
  for (const step of steps) {
    for (const content of step?.content || []) {
      if (typeof content?.text === 'string' && content.text.trim()) return content.text;
    }
  }
  return '';
}

function rateLimit(userId) {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const recent = (recentRequests.get(userId) || []).filter(timestamp => timestamp > minuteAgo);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) return false;
  recent.push(now);
  recentRequests.set(userId, recent);
  return true;
}

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}

export function shouldRetryGemini(status, message = '') {
  return [429, 500, 502, 503, 504].includes(Number(status))
    || /high demand|overloaded|temporar(?:ily|iamente)|try again|indisponivel/i.test(String(message || ''));
}

export function providerMessage(payload, status) {
  const originalMessage = textValue(payload?.error?.message, 500) || '';
  if (shouldRetryGemini(status, originalMessage)) {
    return 'A leitura visual esta ocupada no momento. A leitura local sera usada automaticamente.';
  }
  if (status === 401 || status === 403) return 'A chave gratuita do Gemini precisa ser revisada no servidor.';
  return originalMessage || `A leitura visual nao concluiu o documento (${status}).`;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export function geminiModelCandidates(primaryModel = process.env.GEMINI_DOCUMENT_MODEL) {
  const configuredFallbacks = String(process.env.GEMINI_DOCUMENT_FALLBACK_MODELS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return [...new Set([primaryModel, ...configuredFallbacks, ...DEFAULT_GEMINI_MODELS].filter(Boolean))].slice(0, 4);
}

async function requestGemini({ apiKey, models, buildRequestBody }) {
  const deadline = Date.now() + GEMINI_TIME_BUDGET_MS;
  let lastError = null;
  const attemptedModels = [];

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    attemptedModels.push(model);

    try {
      const modelBudget = modelIndex === 0 ? 22_000 : modelIndex === 1 ? 15_000 : 10_000;
      const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method:'POST',
        headers:{ 'x-goog-api-key':apiKey, 'Content-Type':'application/json' },
        body:buildRequestBody(model),
        signal:AbortSignal.timeout(Math.min(modelBudget, remaining)),
      });
      const responseBody = await aiResponse.json().catch(() => ({}));
      if (aiResponse.ok) return { responseBody, model, attemptedModels };

      const message = providerMessage(responseBody, aiResponse.status);
      const error = Object.assign(new Error(message), { status:aiResponse.status, providerPayload:responseBody, model });
      lastError = error;
      if (!shouldRetryGemini(aiResponse.status, responseBody?.error?.message)) throw error;
    } catch (error) {
      lastError = error;
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      if (!timedOut && !shouldRetryGemini(error?.status, error?.message)) throw error;
    }

    const delay = GEMINI_RETRY_DELAYS_MS[Math.min(modelIndex, GEMINI_RETRY_DELAYS_MS.length - 1)] || 500;
    if (Date.now() + delay + 5_000 >= deadline) break;
    await wait(delay);
  }

  const error = lastError || Object.assign(new Error('A leitura visual nao respondeu a tempo.'), { status:504 });
  error.attemptedModels = attemptedModels;
  throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro:'Metodo nao permitido.' });

  let user;
  try { user = await requireSupabaseUser(req); }
  catch (error) { return sendAuthError(res, error); }

  if (!rateLimit(user.id)) return json(res, 429, { erro:'Aguarde um minuto antes de iniciar novas leituras.', fallback_local:true });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(res, 503, { erro:'A leitura Gemini gratuita ainda nao foi configurada no servidor.', fallback_local:true });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { return json(res, 400, { erro:'Corpo da requisicao invalido.' }); }
  const entryId = String(body.entrada_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entryId)) {
    return json(res, 400, { erro:'Documento invalido.' });
  }

  try {
    const token = bearerToken(req);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw Object.assign(new Error('Supabase nao configurado no servidor.'), { status:503 });

    const db = createClient(supabaseUrl, supabaseKey, {
      auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
      global:{ headers:{ Authorization:`Bearer ${token}` } },
    });
    const { data:entry, error:entryError } = await db
      .from('acompanhamento_documentos_entrada')
      .select('id,nome_arquivo,caminho,mime_type,tamanho_bytes,status')
      .eq('id', entryId)
      .single();
    if (entryError || !entry) return json(res, 404, { erro:'Documento nao encontrado ou sem permissao.' });
    if (entry.mime_type !== 'application/pdf' || Number(entry.tamanho_bytes) > MAX_FILE_SIZE) {
      return json(res, 400, { erro:'O arquivo precisa ser um PDF de ate 15 MB.' });
    }

    const { data:signed, error:signedError } = await db.storage.from('acompanhamento').createSignedUrl(entry.caminho, 300);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Nao foi possivel abrir o PDF protegido.');
    const pdfResponse = await fetch(signed.signedUrl, { signal:AbortSignal.timeout(10_000) });
    if (!pdfResponse.ok) throw new Error('Nao foi possivel baixar o PDF protegido.');
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    if (!pdfBuffer.length || pdfBuffer.length > MAX_FILE_SIZE) throw new Error('O PDF esta vazio ou ultrapassa 15 MB.');

    const mode = body.modo === 'reescan' ? 'reescan' : 'normal';
    const models = geminiModelCandidates();
    const pdfBase64 = pdfBuffer.toString('base64');
    const buildRequestBody = model => JSON.stringify({
      model,
      input:[
        { type:'document', data:pdfBase64, mime_type:'application/pdf' },
        { type:'text', text:`${INSTRUCTIONS}\n\nArquivo: ${entry.nome_arquivo}. Faça uma checagem final de fornecedor, numero do documento e valores antes de responder. Devolva somente o JSON solicitado.` },
      ],
      generation_config:{ thinking_level:mode === 'reescan' ? 'high' : 'medium' },
      response_format:{ type:'text', mime_type:'application/json', schema:DOCUMENT_SCHEMA },
    });
    const { responseBody, model, attemptedModels } = await requestGemini({ apiKey, models, buildRequestBody });
    const output = interactionText(responseBody);
    if (!output) throw new Error('O Gemini nao devolveu campos para conferencia.');
    const analysis = validateAnalysis(JSON.parse(output));
    if (!analysis.documentos.length) throw new Error('O Gemini nao identificou paginas suficientes para montar a conferencia.');
    analysis.modelo_leitura = model;
    analysis.documentos = analysis.documentos.map(document => ({ ...document, origem_leitura:'gemini', modelo_leitura:model }));
    return json(res, 200, { analise:analysis, modelo:model, modelos_tentados:attemptedModels, gratuito:true, conferencia_obrigatoria:true });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const providerStatus = Number(error?.status);
    const status = timeout ? 504 : (providerStatus >= 400 && providerStatus < 600 ? providerStatus : 500);
    return json(res, status, {
      erro:timeout ? 'A leitura Gemini demorou mais que o esperado. O leitor local sera usado.' : (error?.message || 'Nao foi possivel analisar o documento.'),
      fallback_local:true,
    });
  }
}
