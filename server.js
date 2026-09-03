import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const authCache = new Map();
const authInFlight = new Map();
const AUTH_CACHE_MS = 60 * 1000;

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const supabaseAuth = getSupabaseAuthClient();


function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } });
}
const supabaseAdmin = getSupabaseAdminClient();
const WAVE2_BUCKET = 'pmg-supplier-assets';
const WAVE2_MAX_FILE_BYTES = 10 * 1024 * 1024;
const WAVE2_MIME_EXT = new Map([
  ['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp'], ['application/pdf','pdf']
]);
function wave2SafeText(value, max = 180) { return String(value ?? '').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,max); }
function wave2Sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function wave2MagicMime(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.slice(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (b.length >= 12 && b.slice(0,4).toString('ascii') === 'RIFF' && b.slice(8,12).toString('ascii') === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.slice(0,5).toString('ascii') === '%PDF-') return 'application/pdf';
  return 'application/octet-stream';
}
function wave2UploadMeta(body = {}, allowedMimes = [...WAVE2_MIME_EXT.keys()], maxBytes = WAVE2_MAX_FILE_BYTES) {
  const name = wave2SafeText(body.name || body.fileName || 'arquivo', 160);
  const mime = wave2SafeText(body.mime || body.type || '', 80).toLowerCase();
  const size = Number(body.size || 0);
  const sha256 = wave2SafeText(body.sha256 || '', 64).toLowerCase();
  if (!name || !mime || !Number.isFinite(size) || size < 1) throw Object.assign(new Error('Metadados do arquivo incompletos.'), { status:400, code:'WAVE2_FILE_META' });
  if (size > Math.min(Number(maxBytes)||WAVE2_MAX_FILE_BYTES, WAVE2_MAX_FILE_BYTES)) throw Object.assign(new Error('Arquivo acima do limite permitido.'), { status:413, code:'WAVE2_FILE_TOO_LARGE' });
  if (!allowedMimes.includes(mime) || !WAVE2_MIME_EXT.has(mime)) throw Object.assign(new Error('Formato de arquivo não permitido.'), { status:415, code:'WAVE2_FILE_TYPE' });
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw Object.assign(new Error('Hash SHA-256 inválido.'), { status:400, code:'WAVE2_FILE_HASH' });
  return { name, mime, size, sha256, ext:WAVE2_MIME_EXT.get(mime) };
}
async function wave2ResolvePortalToken(rawToken) {
  if (!supabaseAdmin) throw Object.assign(new Error('Portal externo indisponível: backend Supabase não configurado.'), { status:503, code:'WAVE2_ADMIN_UNAVAILABLE' });
  const token = wave2SafeText(rawToken, 160);
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const { data, error } = await supabaseAdmin.rpc('resolver_portal_fornecedor_token_v2', { p_token:token });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}
async function wave2ResolveAcademyToken(rawToken) {
  if (!supabaseAdmin) throw Object.assign(new Error('Check-in indisponível: backend Supabase não configurado.'), { status:503, code:'WAVE2_ADMIN_UNAVAILABLE' });
  const token = wave2SafeText(rawToken, 128);
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;
  const { data, error } = await supabaseAdmin.rpc('resolver_checkin_academia_v2', { p_token:token });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}
async function wave2CreateSignedUpload({ supplierId, obligationId = null, meta }) {
  if (!supabaseAdmin) throw Object.assign(new Error('Storage indisponível.'), { status:503, code:'WAVE2_ADMIN_UNAVAILABLE' });
  const random = crypto.randomBytes(14).toString('hex');
  const pathParts = [`supplier/${Number(supplierId)}`];
  if (obligationId) pathParts.push(`obligation/${String(obligationId)}`); else pathParts.push('library');
  pathParts.push(`${Date.now()}-${random}.${meta.ext}`);
  const storagePath = pathParts.join('/');
  const { data, error } = await supabaseAdmin.storage.from(WAVE2_BUCKET).createSignedUploadUrl(storagePath, { upsert:false });
  if (error) throw error;
  return { storagePath, signedUrl:data?.signedUrl || data?.signedURL || null, uploadToken:data?.token || null, path:data?.path || storagePath };
}
async function wave2ValidateStoredObject({ path:storagePath, expected, allowedMimes, maxBytes }) {
  const { data, error } = await supabaseAdmin.storage.from(WAVE2_BUCKET).download(storagePath);
  if (error || !data) throw Object.assign(new Error('Não foi possível validar o arquivo enviado.'), { status:502, code:'WAVE2_STORAGE_READ', cause:error });
  const buffer = Buffer.from(await data.arrayBuffer());
  const actualMime = wave2MagicMime(buffer);
  const actualHash = wave2Sha256(buffer);
  if (buffer.length > Math.min(Number(maxBytes)||WAVE2_MAX_FILE_BYTES,WAVE2_MAX_FILE_BYTES)) throw Object.assign(new Error('Arquivo armazenado excede o limite permitido.'), { status:413, code:'WAVE2_FILE_TOO_LARGE' });
  if (!allowedMimes.includes(actualMime)) throw Object.assign(new Error('Conteúdo real do arquivo não é permitido.'), { status:415, code:'WAVE2_FILE_MAGIC' });
  if (expected.mime !== actualMime) throw Object.assign(new Error('O tipo real do arquivo não corresponde ao tipo informado.'), { status:415, code:'WAVE2_MIME_SPOOF' });
  if (expected.sha256 !== actualHash) throw Object.assign(new Error('O arquivo armazenado não corresponde ao hash informado.'), { status:409, code:'WAVE2_HASH_MISMATCH' });
  return { buffer, actualMime, actualHash };
}

async function exigirSessaoLocal(req) {
  if (String(process.env.PMG_LOCAL_API_REQUIRE_AUTH || 'true').toLowerCase() === 'false') return null;
  if (!supabaseAuth) {
    const error = new Error('Autenticação local indisponível: configure SUPABASE_URL e SUPABASE_ANON_KEY.');
    error.status = 503;
    error.code = 'PMG_AUTH_UNAVAILABLE';
    throw error;
  }

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Sessão do PMG Connect obrigatória para consultar o SQL local.');
    error.status = 401;
    error.code = 'PMG_AUTH_REQUIRED';
    throw error;
  }

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  if (authInFlight.has(token)) return authInFlight.get(token);
  const pending = (async () => {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      const authError = new Error('Sessão inválida ou expirada.');
      authError.status = 401;
      authError.code = 'PMG_AUTH_INVALID';
      throw authError;
    }
    authCache.set(token, { user: data.user, expiresAt: Date.now() + AUTH_CACHE_MS });
    return data.user;
  })().finally(() => authInFlight.delete(token));

  authInFlight.set(token, pending);
  return pending;
}


async function exigirCapacidadeWave2(req, capacidade) {
  const user = await exigirSessaoLocal(req);
  if (!user || !supabaseAdmin) {
    const error = new Error('Validação de permissão Wave 2 indisponível.');
    error.status = 503;
    error.code = 'WAVE2_CAPABILITY_UNAVAILABLE';
    throw error;
  }
  const { data: collaborator, error: collaboratorError } = await supabaseAdmin
    .from('colaboradores')
    .select('id,role,ativo,pode_gerenciar_fornecedores,pode_aprovar_materiais,pode_gerenciar_automacoes,pode_corrigir_presenca,pode_gerenciar_academia')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .maybeSingle();
  if (collaboratorError) throw collaboratorError;
  if (!collaborator) {
    const error = new Error('Usuário não possui perfil ativo no PMG Connect.');
    error.status = 403;
    error.code = 'WAVE2_PROFILE_REQUIRED';
    throw error;
  }
  const manager = String(collaborator.role || '').toLowerCase() === 'gestor';
  const allowed = manager || ({
    fornecedores: collaborator.pode_gerenciar_fornecedores,
    materiais: collaborator.pode_aprovar_materiais,
    automacoes: collaborator.pode_gerenciar_automacoes,
    academia: collaborator.pode_gerenciar_academia,
    presenca: collaborator.pode_corrigir_presenca || collaborator.pode_gerenciar_academia
  })[String(capacidade || '').toLowerCase()] === true;
  if (!allowed) {
    const error = new Error('Você não possui permissão para esta operação.');
    error.status = 403;
    error.code = 'WAVE2_CAPABILITY_DENIED';
    throw error;
  }
  return { user, collaborator };
}


// A API local é poderosa demais para aceitar qualquer site da internet.
// Permitimos localhost, o projeto PMG na Vercel e origens adicionais configuradas
// explicitamente em PMG_ALLOWED_ORIGINS (separadas por vírgula).
const ORIGENS_EXTRAS = new Set(
  String(process.env.PMG_ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function origemPermitida(origin) {
  if (!origin) return true; // curl/Postman e navegação direta
  let url;
  try { url = new URL(origin); } catch { return false; }
  const normalized = origin.replace(/\/$/, '');
  if (ORIGENS_EXTRAS.has(normalized)) return true;
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return true;
  if (url.protocol === 'https:' && (url.hostname === 'pmg-marketing.vercel.app' || /^pmg-marketing-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname))) return true;
  return false;
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  let mesmaOrigem = false;
  if (origin) {
    try { mesmaOrigem = new URL(origin).host === req.headers.host; } catch { mesmaOrigem = false; }
  }

  // Rejeita a requisição antes de qualquer rota. Requisições da própria página
  // servida por este Node são aceitas mesmo quando o acesso ocorre pelo IP da LAN.
  if (origin && !mesmaOrigem && !origemPermitida(origin)) {
    return res.status(403).json({ message: 'Origin não autorizada para a API local.' });
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');

  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  res.setHeader('Private-Network-Access-Name', 'API Local PMG Connect');
  res.setHeader('Private-Network-Access-ID', 'pmg-connect-local-api');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '15mb' }));

/**
 * Registra handlers no formato usado pela Vercel.
 *
 * /api       -> funções que também serão publicadas na Vercel.
 * /local-api -> funções que dependem do SQL Server acessível apenas na rede local.
 *
 * As duas pastas continuam respondendo localmente em /api/<nome>, então o
 * dashboard não precisa saber onde o arquivo físico está guardado.
 */
const rotasRegistradas = new Map();

async function registrarDiretorioApi(nomeDiretorio) {
  const diretorio = path.join(__dirname, nomeDiretorio);
  if (!fs.existsSync(diretorio)) return;

  const arquivos = fs.readdirSync(diretorio).filter((arquivo) => arquivo.endsWith('.js'));

  for (const arquivo of arquivos) {
    const nomeRota = arquivo.replace(/\.js$/, '');
    const rota = `/api/${nomeRota}`;

    // No servidor local, as rotas de local-api têm prioridade.
    // Isso impede que o arquivo de contingência da Vercel assuma a mesma URL.
    if (rotasRegistradas.has(rota)) {
      console.log(
        `[api] Ignorada rota duplicada ${nomeDiretorio}/${arquivo}; ` +
        `já registrada por ${rotasRegistradas.get(rota)}`
      );
      continue;
    }

    try {
      const modulo = await import(pathToFileURL(path.join(diretorio, arquivo)));
      const handler = modulo.default;

      if (typeof handler !== 'function') {
        throw new TypeError('O módulo não exporta um handler default');
      }

      if (nomeDiretorio === 'local-api') {
        app.all(rota, async (req, res) => {
          try {
            req.pmgUser = await exigirSessaoLocal(req);
            return handler(req, res);
          } catch (error) {
            return res.status(error.status || 401).json({
              message: error.message || 'Não autorizado.',
              codigo: error.code || 'PMG_AUTH_REQUIRED'
            });
          }
        });
      } else {
        app.all(rota, (req, res) => handler(req, res));
      }
      rotasRegistradas.set(rota, `${nomeDiretorio}/${arquivo}`);
      console.log(`[api] ${rota} <- ${nomeDiretorio}/${arquivo}`);
    } catch (erro) {
      console.error(`[api] Falha ao carregar ${nomeDiretorio}/${arquivo}: ${erro.message}`);
      app.all(rota, (req, res) => {
        res.status(500).json({
          message: `A rota ${rota} não pôde ser carregada`,
          detail: erro.message,
        });
      });
      rotasRegistradas.set(rota, `${nomeDiretorio}/${arquivo} (erro)`);
    }
  }
}

// Ordem intencional: tudo que depende do SQL local deve vencer rotas homônimas
// presentes em /api para publicação na Vercel.
await registrarDiretorioApi('local-api');
await registrarDiretorioApi('api');


// ------------------------------------------------------------
// WAVE 2 — PORTAL EXTERNO / STORAGE / ACADEMIA
// Mantidos no Express para não consumir outra Serverless Function.
// ------------------------------------------------------------
app.get('/api/wave2/portal/context', async (req,res) => {
  try {
    const ctx = await wave2ResolvePortalToken(req.query.token);
    if (!ctx) return res.status(404).json({ ok:false, code:'WAVE2_TOKEN_INVALID', message:'Link inválido, expirado ou revogado.' });
    return res.json({ ok:true, supplier:{ id:ctx.fornecedor_id, name:ctx.fornecedor_nome }, obligation:{ id:ctx.obrigacao_id, title:ctx.titulo, description:ctx.descricao, dueDate:ctx.prazo, status:ctx.status }, allowedMimes:ctx.allowed_mimes, maxBytes:ctx.max_bytes });
  } catch (error) { return res.status(error.status||500).json({ ok:false, code:error.code||'WAVE2_PORTAL_CONTEXT', message:error.message||'Falha ao abrir solicitação.' }); }
});

app.post('/api/wave2/portal/signed-upload', async (req,res) => {
  try {
    const ctx = await wave2ResolvePortalToken(req.body?.token);
    if (!ctx) return res.status(404).json({ ok:false, code:'WAVE2_TOKEN_INVALID', message:'Link inválido, expirado ou revogado.' });
    const meta = wave2UploadMeta(req.body, ctx.allowed_mimes || [], ctx.max_bytes);
    const { data: duplicate, error:dupError } = await supabaseAdmin.from('fornecedor_assets').select('id,nome_original,storage_path,mime,tamanho_bytes,sha256').eq('fornecedor_id',ctx.fornecedor_id).eq('sha256',meta.sha256).maybeSingle();
    if (dupError) throw dupError;
    if (duplicate) {
      const { error:finishError } = await supabaseAdmin.rpc('finalizar_asset_fornecedor_v2', { p_fornecedor_id:ctx.fornecedor_id,p_obrigacao_id:ctx.obrigacao_id,p_nome:duplicate.nome_original,p_bucket:WAVE2_BUCKET,p_path:duplicate.storage_path,p_mime:duplicate.mime,p_ext:WAVE2_MIME_EXT.get(duplicate.mime)||'',p_size:duplicate.tamanho_bytes,p_width:null,p_height:null,p_sha256:duplicate.sha256,p_origem:'portal_fornecedor',p_token_id:ctx.token_id,p_mensagem:wave2SafeText(req.body?.message,1000)||null });
      if (finishError) throw finishError;
      return res.json({ ok:true, duplicate:true, assetId:duplicate.id, message:'Este arquivo já havia sido enviado e foi relacionado à solicitação.' });
    }
    const signed = await wave2CreateSignedUpload({ supplierId:ctx.fornecedor_id, obligationId:ctx.obrigacao_id, meta });
    return res.json({ ok:true, bucket:WAVE2_BUCKET, path:signed.path, signedUrl:signed.signedUrl, uploadToken:signed.uploadToken, contentType:meta.mime });
  } catch (error) { return res.status(error.status||500).json({ ok:false, code:error.code||'WAVE2_UPLOAD_URL', message:error.message||'Falha ao preparar upload.' }); }
});

app.post('/api/wave2/portal/complete', async (req,res) => {
  let storagePath = wave2SafeText(req.body?.path, 500);
  try {
    const ctx = await wave2ResolvePortalToken(req.body?.token);
    if (!ctx) return res.status(404).json({ ok:false, code:'WAVE2_TOKEN_INVALID', message:'Link inválido, expirado ou revogado.' });
    const meta = wave2UploadMeta(req.body, ctx.allowed_mimes || [], ctx.max_bytes);
    const prefix=`supplier/${Number(ctx.fornecedor_id)}/obligation/${String(ctx.obrigacao_id)}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.includes('\\')) throw Object.assign(new Error('Caminho do arquivo fora do escopo do link.'), { status:403, code:'WAVE2_PATH_SCOPE' });
    await wave2ValidateStoredObject({ path:storagePath, expected:meta, allowedMimes:ctx.allowed_mimes||[], maxBytes:ctx.max_bytes });
    const { data:assetId,error } = await supabaseAdmin.rpc('finalizar_asset_fornecedor_v2', { p_fornecedor_id:ctx.fornecedor_id,p_obrigacao_id:ctx.obrigacao_id,p_nome:meta.name,p_bucket:WAVE2_BUCKET,p_path:storagePath,p_mime:meta.mime,p_ext:meta.ext,p_size:meta.size,p_width:Number(req.body?.width)||null,p_height:Number(req.body?.height)||null,p_sha256:meta.sha256,p_origem:'portal_fornecedor',p_token_id:ctx.token_id,p_mensagem:wave2SafeText(req.body?.message,1000)||null });
    if (error) throw error;
    return res.json({ ok:true, assetId, status:'recebido', message:'Material recebido. A PMG fará a revisão antes da aprovação.' });
  } catch (error) {
    if (storagePath && supabaseAdmin) { try { await supabaseAdmin.storage.from(WAVE2_BUCKET).remove([storagePath]); } catch {} }
    return res.status(error.status||500).json({ ok:false, code:error.code||'WAVE2_UPLOAD_COMPLETE', message:error.message||'Não foi possível concluir o envio.' });
  }
});

app.post('/api/wave2/internal/signed-upload', async (req,res) => {
  try {
    await exigirCapacidadeWave2(req, 'materiais');
    if (!supabaseAdmin) throw Object.assign(new Error('Storage administrativo indisponível.'),{status:503});
    const supplierId=Number(req.body?.supplierId), obligationId=wave2SafeText(req.body?.obligationId,80)||null;
    if(!Number.isFinite(supplierId)) throw Object.assign(new Error('Fornecedor inválido.'),{status:400});
    const meta=wave2UploadMeta(req.body,[...WAVE2_MIME_EXT.keys()],WAVE2_MAX_FILE_BYTES);
    const signed=await wave2CreateSignedUpload({supplierId,obligationId,meta});
    return res.json({ok:true,bucket:WAVE2_BUCKET,path:signed.path,signedUrl:signed.signedUrl,uploadToken:signed.uploadToken,contentType:meta.mime});
  } catch(error){return res.status(error.status||500).json({ok:false,code:error.code||'WAVE2_INTERNAL_UPLOAD',message:error.message||'Falha ao preparar upload.'});}
});

app.post('/api/wave2/internal/complete', async (req,res) => {
  let storagePath=wave2SafeText(req.body?.path,500);
  try {
    await exigirCapacidadeWave2(req, 'materiais');
    const supplierId=Number(req.body?.supplierId),obligationId=wave2SafeText(req.body?.obligationId,80)||null;
    if(!Number.isFinite(supplierId)) throw Object.assign(new Error('Fornecedor inválido.'),{status:400});
    const meta=wave2UploadMeta(req.body,[...WAVE2_MIME_EXT.keys()],WAVE2_MAX_FILE_BYTES);
    const prefix=`supplier/${supplierId}/`;
    if(!storagePath.startsWith(prefix)||storagePath.includes('..')||storagePath.includes('\\'))throw Object.assign(new Error('Caminho inválido.'),{status:403,code:'WAVE2_PATH_SCOPE'});
    await wave2ValidateStoredObject({path:storagePath,expected:meta,allowedMimes:[...WAVE2_MIME_EXT.keys()],maxBytes:WAVE2_MAX_FILE_BYTES});
    const {data:assetId,error}=await supabaseAdmin.rpc('finalizar_asset_fornecedor_v2',{p_fornecedor_id:supplierId,p_obrigacao_id:obligationId||null,p_nome:meta.name,p_bucket:WAVE2_BUCKET,p_path:storagePath,p_mime:meta.mime,p_ext:meta.ext,p_size:meta.size,p_width:Number(req.body?.width)||null,p_height:Number(req.body?.height)||null,p_sha256:meta.sha256,p_origem:'interno',p_token_id:null,p_mensagem:null});
    if(error)throw error;
    return res.json({ok:true,assetId});
  }catch(error){if(storagePath&&supabaseAdmin){try{await supabaseAdmin.storage.from(WAVE2_BUCKET).remove([storagePath]);}catch{}}return res.status(error.status||500).json({ok:false,code:error.code||'WAVE2_INTERNAL_COMPLETE',message:error.message||'Falha ao concluir upload.'});}
});

app.get('/api/wave2/academy/context', async (req,res) => {
  try { const ctx=await wave2ResolveAcademyToken(req.query.token); if(!ctx)return res.status(404).json({ok:false,code:'WAVE2_CHECKIN_INVALID',message:'QR inválido, expirado ou desativado.'}); return res.json({ok:true,training:{id:ctx.treinamento_id,title:ctx.titulo,start:ctx.inicio_em,end:ctx.fim_em,location:ctx.local_treinamento}}); }
  catch(error){return res.status(error.status||500).json({ok:false,code:error.code||'WAVE2_CHECKIN_CONTEXT',message:error.message||'Falha ao abrir check-in.'});}
});

app.post('/api/wave2/academy/checkin', async (req,res) => {
  try {
    const ctx=await wave2ResolveAcademyToken(req.body?.token); if(!ctx)return res.status(404).json({ok:false,code:'WAVE2_CHECKIN_INVALID',message:'QR inválido, expirado ou desativado.'});
    const identifier=wave2SafeText(req.body?.identifier,160); if(!identifier)return res.status(400).json({ok:false,code:'WAVE2_CHECKIN_IDENTIFIER',message:'Informe seu código, e-mail ou telefone.'});
    const digits=identifier.replace(/\D+/g,''),lower=identifier.toLowerCase().trim();
    const {data:rows,error}=await supabaseAdmin.from('academia_inscricoes').select('id,representante_codigo,representante_nome,email,telefone,match_status').eq('treinamento_id',ctx.treinamento_id).eq('match_status','resolvido').limit(5000); if(error)throw error;
    const matches=(rows||[]).filter(r=>String(r.representante_codigo||'').trim()===identifier.trim()||String(r.email||'').toLowerCase().trim()===lower||(digits&&String(r.telefone||'').replace(/\D+/g,'')===digits));
    if(matches.length!==1)return res.status(matches.length?409:404).json({ok:false,code:matches.length?'WAVE2_CHECKIN_AMBIGUOUS':'WAVE2_CHECKIN_NOT_FOUND',message:matches.length?'Identificação ambígua. Procure a equipe da PMG.':'Inscrição não encontrada. Procure a equipe da PMG para presença manual.'});
    const rep=matches[0];
    const {data:existing,error:existingError}=await supabaseAdmin.from('academia_presencas').select('id,presente_em').eq('treinamento_id',ctx.treinamento_id).eq('representante_codigo',rep.representante_codigo).maybeSingle();if(existingError)throw existingError;
    if(existing)return res.json({ok:true,already:true,name:rep.representante_nome,checkedAt:existing.presente_em,message:'Sua presença já estava registrada.'});
    const {data:created,error:createError}=await supabaseAdmin.from('academia_presencas').insert({treinamento_id:ctx.treinamento_id,representante_codigo:rep.representante_codigo,representante_nome:rep.representante_nome,metodo:'qr'}).select('id,presente_em').single();
    if(createError){
      if(createError.code==='23505'){
        const {data:raceExisting,error:raceError}=await supabaseAdmin.from('academia_presencas').select('id,presente_em').eq('treinamento_id',ctx.treinamento_id).eq('representante_codigo',rep.representante_codigo).maybeSingle();
        if(raceError)throw raceError;
        if(raceExisting)return res.json({ok:true,already:true,name:rep.representante_nome,checkedAt:raceExisting.presente_em,message:'Sua presença já estava registrada.'});
      }
      throw createError;
    }
    supabaseAdmin.from('operational_audit_events').insert({modulo:'academia',acao:'presenca_qr',entidade_tipo:'academia_presenca',entidade_id:String(created.id),metadata:{treinamento_id:ctx.treinamento_id,metodo:'qr'}}).then(({error:auditError})=>{if(auditError)console.warn('[Wave2][Academia] Falha não bloqueante no audit trail:',auditError.message);});
    return res.json({ok:true,name:rep.representante_nome,checkedAt:created.presente_em,message:'Presença registrada com sucesso.'});
  } catch(error){return res.status(error.status||500).json({ok:false,code:error.code||'WAVE2_CHECKIN',message:error.message||'Não foi possível registrar a presença.'});}
});

// Uma rota de API inexistente deve responder JSON, não uma página HTML.
app.use('/api', (req, res) => {
  res.status(404).json({
    message: `Rota local não encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// O frontend local é servido somente depois das rotas da API.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/fornecedor/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fornecedor', 'slug.html'));
});

app.get('/img-proxy', async (req, res) => {
  const modulo = await import(pathToFileURL(path.join(__dirname, 'api', 'img-proxy.js')));
  return modulo.default(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\nServidor local do PMG Connect rodando.');
  console.log(`- Neste computador: http://localhost:${PORT}`);
  console.log(`- Dashboard regional: http://localhost:${PORT}/dashboard-regional.html`);
  console.log(`- Campanhas: http://localhost:${PORT}/campanhas.html`);
  console.log(`- Na rede local: http://<IP-DESTE-PC>:${PORT}`);
  console.log('Mantenha este terminal aberto enquanto usar os relatórios conectados ao SQL Server.\n');
});
