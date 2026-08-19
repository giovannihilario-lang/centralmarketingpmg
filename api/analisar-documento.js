import { createClient } from '@supabase/supabase-js';
import { bearerToken, requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';

const MAX_REQUESTS_PER_MINUTE = 6;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const recentRequests = new Map();
const DOCUMENT_TYPES = new Set(['cadastro_pagamento', 'pedido_compra', 'danfe', 'extrato_bancario', 'nao_identificado']);
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
- cadastro_pagamento: tela, ficha ou cadastro interno de pagamento;
- pedido_compra: pedido de compra emitido pelo sistema;
- danfe: nota fiscal ou DANFE;
- extrato_bancario: extrato ou comprovante bancario;
- nao_identificado: quando nao houver evidencia suficiente para os quatro modelos conhecidos.

Regras obrigatorias:
1. Um PDF pode conter varias paginas do mesmo documento ou documentos diferentes. Agrupe paginas relacionadas e separe documentos distintos.
2. Nunca confunda o total da compra, nota ou pagamento com o valor efetivamente relacionado ao Marketing.
3. Procure MKT, marketing, acordo, sobra, desconto, verba, bonificacao, doacao, brinde, transferencia recebida e destaques visuais.
4. No cadastro de pagamento, sugira o valor explicitamente ligado ao Marketing quando existir. Preserve bruto, descontos e liquido na descricao.
5. No pedido de compra, separe total do pedido, sobra de compras e sobra de Marketing. O valor de Marketing tem prioridade no lancamento sugerido.
6. Em DANFE de remessa em bonificacao, doacao ou brinde, sugira categoria bonificacao e natureza receita, mas crie um alerta para validacao humana.
7. Em extrato bancario, extraia apenas a movimentacao destacada ou claramente ligada ao fornecedor/Marketing. Nao transforme cada linha em um documento.
8. Datas devem usar AAAA-MM-DD. Valores devem ser numeros em reais. Quando nao houver certeza, use null e liste o campo em campos_duvidosos.
9. Nao invente fornecedor, numero, data, forma de pagamento ou valor. Cite evidencias curtas retiradas do proprio documento.
10. Todo resultado e apenas uma proposta e precisa de conferencia humana. Inclua um alerta de conferencia em cada item.
11. Se surgir um layout diferente dos quatro modelos, use nao_identificado e prepare os campos que conseguir reconhecer sem inventar.
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

export function validateAnalysis(value) {
  const source = value && typeof value === 'object' ? value : {};
  const documents = Array.isArray(source.documentos) ? source.documentos : [];
  const cleaned = documents.slice(0, 50).map((document, index) => {
    const pages = Array.isArray(document.paginas)
      ? [...new Set(document.paginas.map(Number).filter(page => Number.isInteger(page) && page > 0))].sort((a, b) => a - b)
      : [];
    const alerts = stringArray(document.alertas);
    if (!alerts.some(alert => /confer/i.test(alert))) alerts.push('Confira o PDF original antes de criar ou vincular qualquer lancamento.');
    return {
      ordem:index + 1,
      paginas:pages.length ? pages : [index + 1],
      tipo:DOCUMENT_TYPES.has(document.tipo) ? document.tipo : 'nao_identificado',
      confianca:Math.max(0, Math.min(1, Number(document.confianca) || 0)),
      fornecedor:textValue(document.fornecedor, 300),
      cnpj:textValue(document.cnpj, 30),
      fornecedor_codigo:textValue(document.fornecedor_codigo, 80),
      numero_documento:textValue(document.numero_documento, 120),
      numero_pedido:textValue(document.numero_pedido, 120),
      numero_nota:textValue(document.numero_nota, 120),
      data_emissao:textValue(document.data_emissao, 10),
      vencimento:textValue(document.vencimento, 10),
      data_pagamento:textValue(document.data_pagamento, 10),
      valor_total_documento:numericValue(document.valor_total_documento),
      valor_marketing:numericValue(document.valor_marketing),
      valor_lancamento_sugerido:numericValue(document.valor_lancamento_sugerido),
      natureza_sugerida:NATURES.has(document.natureza_sugerida) ? document.natureza_sugerida : 'neutro',
      categoria_sugerida:CATEGORIES.has(document.categoria_sugerida) ? document.categoria_sugerida : 'outro',
      forma_pagamento:textValue(document.forma_pagamento, 120),
      titulo_sugerido:textValue(document.titulo_sugerido, 300) || 'Documento aguardando conferencia',
      descricao:textValue(document.descricao, 3000) || '',
      observacoes:textValue(document.observacoes, 3000) || '',
      evidencias:stringArray(document.evidencias),
      alertas:alerts,
      campos_duvidosos:stringArray(document.campos_duvidosos),
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

function providerMessage(payload, status) {
  if (status === 429) return 'A cota gratuita do Gemini esta ocupada. O leitor local sera usado como contingencia.';
  if (status === 401 || status === 403) return 'A chave gratuita do Gemini precisa ser revisada no servidor.';
  return textValue(payload?.error?.message, 500) || `O Gemini nao concluiu a leitura (${status}).`;
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

    const model = process.env.GEMINI_DOCUMENT_MODEL || 'gemini-3.7-flash';
    const aiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method:'POST',
      headers:{ 'x-goog-api-key':apiKey, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model,
        input:[
          { type:'document', data:pdfBuffer.toString('base64'), mime_type:'application/pdf' },
          { type:'text', text:`${INSTRUCTIONS}\n\nArquivo: ${entry.nome_arquivo}. Devolva somente o JSON solicitado.` },
        ],
        response_format:{ type:'text', mime_type:'application/json', schema:DOCUMENT_SCHEMA },
      }),
      signal:AbortSignal.timeout(44_000),
    });

    const responseBody = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      const error = new Error(providerMessage(responseBody, aiResponse.status));
      error.status = aiResponse.status;
      throw error;
    }
    const output = interactionText(responseBody);
    if (!output) throw new Error('O Gemini nao devolveu campos para conferencia.');
    const analysis = validateAnalysis(JSON.parse(output));
    if (!analysis.documentos.length) throw new Error('O Gemini nao identificou paginas suficientes para montar a conferencia.');
    return json(res, 200, { analise:analysis, modelo:model, gratuito:true, conferencia_obrigatoria:true });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const providerStatus = Number(error?.status);
    const status = timeout ? 504 : (providerStatus >= 400 && providerStatus < 600 ? providerStatus : 500);
    return json(res, status, {
      erro:timeout ? 'A leitura Gemini demorou mais que o esperado. O leitor local sera usado.' : (error?.message || 'Nao foi possivel analisar o documento.'),
      fallback_local:status >= 429,
    });
  }
}
