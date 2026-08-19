import { createClient } from '@supabase/supabase-js';
import { bearerToken, requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';

const MAX_REQUESTS_PER_MINUTE = 6;
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
Analise o PDF inteiro, incluindo paginas escaneadas, marca-texto, carimbos e anotacoes manuscritas.

Classifique cada documento ou grupo de paginas em exatamente um destes tipos:
- cadastro_pagamento: tela, ficha ou cadastro interno de pagamento;
- pedido_compra: pedido de compra emitido pelo sistema;
- danfe: nota fiscal ou DANFE;
- extrato_bancario: extrato ou comprovante bancario;
- nao_identificado: somente quando nao houver evidencia suficiente.

Regras essenciais:
1. Um PDF pode conter um documento, varias paginas do mesmo documento ou documentos diferentes. Agrupe paginas que pertencem ao mesmo documento e crie itens separados para documentos distintos.
2. Nunca confunda o valor total da compra, nota ou pagamento com o valor efetivamente relacionado ao Marketing.
3. Procure expressoes como MKT, marketing, acordo, sobra, desconto, verba, bonificacao, doacao, brinde, transferencia recebida e destaques visuais.
4. Em cadastro de pagamento, preserve bruto, descontos e liquido no texto, mas sugira como valor de lancamento o valor explicitamente associado ao Marketing quando existir.
5. Em pedido de compra, separe total do pedido, sobra de compras e sobra de Marketing. O valor de Marketing tem prioridade para valor_marketing.
6. Em DANFE de remessa em bonificacao, doacao ou brinde, sugira categoria bonificacao e natureza receita, mas crie alerta se a interpretacao financeira depender de confirmacao humana.
7. Em extrato bancario, extraia somente a movimentacao visualmente destacada ou claramente relacionada ao fornecedor/Marketing. Nao transforme todas as linhas do extrato em documentos.
8. Datas devem usar AAAA-MM-DD. Valores devem ser numeros em reais, sem simbolo e sem formatacao. Quando nao houver certeza, use null e liste o campo em campos_duvidosos.
9. Nao invente fornecedor, numero, data ou valor. Use evidencias curtas para explicar de onde veio cada informacao.
10. Todo resultado sera obrigatoriamente conferido por uma pessoa. Sua tarefa e somente classificar e preencher uma proposta; nunca declarar que algo esta aprovado.
`;

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
    const type = DOCUMENT_TYPES.has(document.tipo) ? document.tipo : 'nao_identificado';
    const nature = NATURES.has(document.natureza_sugerida) ? document.natureza_sugerida : 'neutro';
    const category = CATEGORIES.has(document.categoria_sugerida) ? document.categoria_sugerida : 'outro';
    return {
      ordem:index + 1,
      paginas:pages.length ? pages : [index + 1],
      tipo:type,
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
      natureza_sugerida:nature,
      categoria_sugerida:category,
      forma_pagamento:textValue(document.forma_pagamento, 120),
      titulo_sugerido:textValue(document.titulo_sugerido, 300) || 'Documento aguardando conferencia',
      descricao:textValue(document.descricao, 3000) || '',
      observacoes:textValue(document.observacoes, 3000) || '',
      evidencias:stringArray(document.evidencias),
      alertas:stringArray(document.alertas),
      campos_duvidosos:stringArray(document.campos_duvidosos),
    };
  });
  return {
    total_paginas:Math.max(1, Number.parseInt(source.total_paginas, 10) || Math.max(1, ...cleaned.flatMap(item => item.paginas))),
    resumo:textValue(source.resumo, 2000) || 'Documento preparado para conferencia.',
    documentos:cleaned,
  };
}

function responseText(response) {
  for (const output of response?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === 'output_text' && content.text) return content.text;
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro:'Metodo nao permitido.' });

  let user;
  try { user = await requireSupabaseUser(req); }
  catch (error) { return sendAuthError(res, error); }

  if (!rateLimit(user.id)) return json(res, 429, { erro:'Aguarde um minuto antes de iniciar novas leituras.' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(res, 503, { erro:'A leitura automatica ainda nao foi configurada no servidor.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return json(res, 400, { erro:'Corpo da requisição inválido.' });
  }
  const entryId = String(body.entrada_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entryId)) {
    return json(res, 400, { erro:'Documento invalido.' });
  }

  try {
    const token = bearerToken(req);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase nao configurado no servidor.');

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
    if (entry.mime_type !== 'application/pdf' || Number(entry.tamanho_bytes) > 15728640) {
      return json(res, 400, { erro:'O arquivo precisa ser um PDF de ate 15 MB.' });
    }

    const { data:signed, error:signedError } = await db.storage.from('acompanhamento').createSignedUrl(entry.caminho, 600);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Nao foi possivel abrir o PDF protegido.');

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model:process.env.OPENAI_DOCUMENT_MODEL || 'gpt-5.6',
        store:false,
        instructions:INSTRUCTIONS,
        input:[{
          role:'user',
          content:[
            { type:'input_text', text:`Analise o PDF ${entry.nome_arquivo} e devolva somente a estrutura solicitada.` },
            { type:'input_file', file_url:signed.signedUrl, detail:'high' },
          ],
        }],
        text:{ format:{ type:'json_schema', name:'documentos_pmg', strict:true, schema:DOCUMENT_SCHEMA } },
        max_output_tokens:9000,
      }),
      signal:AbortSignal.timeout(55_000),
    });

    const responseBody = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      const message = responseBody?.error?.message || `Falha na leitura automatica (${aiResponse.status}).`;
      const error = new Error(message);
      error.status = aiResponse.status;
      throw error;
    }
    const output = responseText(responseBody);
    if (!output) throw new Error('O leitor nao devolveu campos para conferencia.');
    const analysis = validateAnalysis(JSON.parse(output));
    return json(res, 200, { analise:analysis, modelo:responseBody.model || process.env.OPENAI_DOCUMENT_MODEL || 'gpt-5.6' });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const status = timeout ? 504 : (Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500);
    return json(res, status, { erro:timeout ? 'A leitura demorou mais que o esperado. Tente novamente.' : (error?.message || 'Nao foi possivel analisar o documento.') });
  }
}
