import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { requireSupabaseUser } from './supabase-auth.js';
import { requireCapacidade } from './colaborador.js';
import { resolveSupabaseUrl, resolveServiceKey } from './env.js';

let adminClient = null;

function getAdminClient() {
  if (adminClient) return adminClient;
  const url = resolveSupabaseUrl();
  const key = resolveServiceKey();
  if (!url || !key) return null;
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return adminClient;
}

export const WAVE2_BUCKET = 'pmg-supplier-assets';
export const WAVE2_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const WAVE2_MIME_EXT = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['application/pdf', 'pdf']
]);

function safeText(value, max = 180) {
  const str = String(value == null ? '' : value);
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    out += code <= 31 ? ' ' : ch;
  }
  return out.trim().slice(0, max);
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function magicMime(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return 'application/octet-stream';
}
function uploadMeta(body = {}, allowedMimes = [...WAVE2_MIME_EXT.keys()], maxBytes = WAVE2_MAX_FILE_BYTES) {
  const name = safeText(body.name || body.fileName || 'arquivo', 160);
  const mime = safeText(body.mime || body.type || '', 80).toLowerCase();
  const size = Number(body.size || 0);
  const hash = safeText(body.sha256 || '', 64).toLowerCase();
  if (!name || !mime || !Number.isFinite(size) || size < 1) throw Object.assign(new Error('Metadados do arquivo incompletos.'), { status: 400, code: 'WAVE2_FILE_META' });
  if (size > Math.min(Number(maxBytes) || WAVE2_MAX_FILE_BYTES, WAVE2_MAX_FILE_BYTES)) throw Object.assign(new Error('Arquivo acima do limite permitido.'), { status: 413, code: 'WAVE2_FILE_TOO_LARGE' });
  if (!allowedMimes.includes(mime) || !WAVE2_MIME_EXT.has(mime)) throw Object.assign(new Error('Formato de arquivo não permitido.'), { status: 415, code: 'WAVE2_FILE_TYPE' });
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Object.assign(new Error('Hash SHA-256 inválido.'), { status: 400, code: 'WAVE2_FILE_HASH' });
  return { name, mime, size, sha256: hash, ext: WAVE2_MIME_EXT.get(mime) };
}
async function resolvePortalToken(rawToken) {
  const admin = getAdminClient();
  if (!admin) throw Object.assign(new Error('Portal externo indisponível: backend Supabase não configurado.'), { status: 503, code: 'WAVE2_ADMIN_UNAVAILABLE' });
  const token = safeText(rawToken, 160);
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const { data, error } = await admin.rpc('resolver_portal_fornecedor_token_v2', { p_token: token });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}
async function resolveAcademyToken(rawToken) {
  const admin = getAdminClient();
  if (!admin) throw Object.assign(new Error('Check-in indisponível: backend Supabase não configurado.'), { status: 503, code: 'WAVE2_ADMIN_UNAVAILABLE' });
  const token = safeText(rawToken, 128);
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;
  const { data, error } = await admin.rpc('resolver_checkin_academia_v2', { p_token: token });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}
async function createSignedUpload({ supplierId, obligationId = null, meta }) {
  const admin = getAdminClient();
  if (!admin) throw Object.assign(new Error('Storage indisponível.'), { status: 503, code: 'WAVE2_ADMIN_UNAVAILABLE' });
  const random = crypto.randomBytes(14).toString('hex');
  const pathParts = [`supplier/${Number(supplierId)}`];
  if (obligationId) pathParts.push(`obligation/${String(obligationId)}`); else pathParts.push('library');
  pathParts.push(`${Date.now()}-${random}.${meta.ext}`);
  const storagePath = pathParts.join('/');
  const { data, error } = await admin.storage.from(WAVE2_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (error) throw error;
  return { storagePath, signedUrl: data?.signedUrl || data?.signedURL || null, uploadToken: data?.token || null, path: data?.path || storagePath };
}
async function validateStoredObject({ path: storagePath, expected, allowedMimes, maxBytes }) {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(WAVE2_BUCKET).download(storagePath);
  if (error || !data) throw Object.assign(new Error('Não foi possível validar o arquivo enviado.'), { status: 502, code: 'WAVE2_STORAGE_READ', cause: error });
  const buffer = Buffer.from(await data.arrayBuffer());
  const actualMime = magicMime(buffer);
  const actualHash = sha256(buffer);
  if (buffer.length > Math.min(Number(maxBytes) || WAVE2_MAX_FILE_BYTES, WAVE2_MAX_FILE_BYTES)) throw Object.assign(new Error('Arquivo armazenado excede o limite permitido.'), { status: 413, code: 'WAVE2_FILE_TOO_LARGE' });
  if (!allowedMimes.includes(actualMime)) throw Object.assign(new Error('Conteúdo real do arquivo não é permitido.'), { status: 415, code: 'WAVE2_FILE_MAGIC' });
  if (expected.mime !== actualMime) throw Object.assign(new Error('O tipo real do arquivo não corresponde ao tipo informado.'), { status: 415, code: 'WAVE2_MIME_SPOOF' });
  if (expected.sha256 !== actualHash) throw Object.assign(new Error('O arquivo armazenado não corresponde ao hash informado.'), { status: 409, code: 'WAVE2_HASH_MISMATCH' });
  return { buffer, actualMime, actualHash };
}
async function requireCapacidadeWave2(req, capacidade) {
  const user = await requireSupabaseUser(req);
  const colaborador = await requireCapacidade(user.id, capacidade);
  return { user, colaborador };
}

// ------------------------------------------------------------
// Handlers de rota — usados tanto pelo server.js (dev local via Express)
// quanto por api/wave2/[...route].js (produção na Vercel), a partir da
// mesma implementação, para as duas nunca divergirem entre si.
// ------------------------------------------------------------

export async function portalContext(req, res) {
  try {
    const ctx = await resolvePortalToken(req.query.token);
    if (!ctx) return res.status(404).json({ ok: false, code: 'WAVE2_TOKEN_INVALID', message: 'Link inválido, expirado ou revogado.' });
    return res.json({ ok: true, supplier: { id: ctx.fornecedor_id, name: ctx.fornecedor_nome }, obligation: { id: ctx.obrigacao_id, title: ctx.titulo, description: ctx.descricao, dueDate: ctx.prazo, status: ctx.status }, allowedMimes: ctx.allowed_mimes, maxBytes: ctx.max_bytes });
  } catch (error) { return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_PORTAL_CONTEXT', message: error.message || 'Falha ao abrir solicitação.' }); }
}

export async function portalSignedUpload(req, res) {
  try {
    const admin = getAdminClient();
    const ctx = await resolvePortalToken(req.body?.token);
    if (!ctx) return res.status(404).json({ ok: false, code: 'WAVE2_TOKEN_INVALID', message: 'Link inválido, expirado ou revogado.' });
    const meta = uploadMeta(req.body, ctx.allowed_mimes || [], ctx.max_bytes);
    const { data: duplicate, error: dupError } = await admin.from('fornecedor_assets').select('id,nome_original,storage_path,mime,tamanho_bytes,sha256').eq('fornecedor_id', ctx.fornecedor_id).eq('sha256', meta.sha256).maybeSingle();
    if (dupError) throw dupError;
    if (duplicate) {
      const { error: finishError } = await admin.rpc('finalizar_asset_fornecedor_v2', { p_fornecedor_id: ctx.fornecedor_id, p_obrigacao_id: ctx.obrigacao_id, p_nome: duplicate.nome_original, p_bucket: WAVE2_BUCKET, p_path: duplicate.storage_path, p_mime: duplicate.mime, p_ext: WAVE2_MIME_EXT.get(duplicate.mime) || '', p_size: duplicate.tamanho_bytes, p_width: null, p_height: null, p_sha256: duplicate.sha256, p_origem: 'portal_fornecedor', p_token_id: ctx.token_id, p_mensagem: safeText(req.body?.message, 1000) || null });
      if (finishError) throw finishError;
      return res.json({ ok: true, duplicate: true, assetId: duplicate.id, message: 'Este arquivo já havia sido enviado e foi relacionado à solicitação.' });
    }
    const signed = await createSignedUpload({ supplierId: ctx.fornecedor_id, obligationId: ctx.obrigacao_id, meta });
    return res.json({ ok: true, bucket: WAVE2_BUCKET, path: signed.path, signedUrl: signed.signedUrl, uploadToken: signed.uploadToken, contentType: meta.mime });
  } catch (error) { return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_UPLOAD_URL', message: error.message || 'Falha ao preparar upload.' }); }
}

export async function portalComplete(req, res) {
  const admin = getAdminClient();
  let storagePath = safeText(req.body?.path, 500);
  try {
    const ctx = await resolvePortalToken(req.body?.token);
    if (!ctx) return res.status(404).json({ ok: false, code: 'WAVE2_TOKEN_INVALID', message: 'Link inválido, expirado ou revogado.' });
    const meta = uploadMeta(req.body, ctx.allowed_mimes || [], ctx.max_bytes);
    const prefix = `supplier/${Number(ctx.fornecedor_id)}/obligation/${String(ctx.obrigacao_id)}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.includes('\\')) throw Object.assign(new Error('Caminho do arquivo fora do escopo do link.'), { status: 403, code: 'WAVE2_PATH_SCOPE' });
    await validateStoredObject({ path: storagePath, expected: meta, allowedMimes: ctx.allowed_mimes || [], maxBytes: ctx.max_bytes });
    const { data: assetId, error } = await admin.rpc('finalizar_asset_fornecedor_v2', { p_fornecedor_id: ctx.fornecedor_id, p_obrigacao_id: ctx.obrigacao_id, p_nome: meta.name, p_bucket: WAVE2_BUCKET, p_path: storagePath, p_mime: meta.mime, p_ext: meta.ext, p_size: meta.size, p_width: Number(req.body?.width) || null, p_height: Number(req.body?.height) || null, p_sha256: meta.sha256, p_origem: 'portal_fornecedor', p_token_id: ctx.token_id, p_mensagem: safeText(req.body?.message, 1000) || null });
    if (error) throw error;
    return res.json({ ok: true, assetId, status: 'recebido', message: 'Material recebido. A PMG fará a revisão antes da aprovação.' });
  } catch (error) {
    if (storagePath && admin) { try { await admin.storage.from(WAVE2_BUCKET).remove([storagePath]); } catch { } }
    return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_UPLOAD_COMPLETE', message: error.message || 'Não foi possível concluir o envio.' });
  }
}

export async function internalSignedUpload(req, res) {
  try {
    await requireCapacidadeWave2(req, 'materiais');
    const admin = getAdminClient();
    if (!admin) throw Object.assign(new Error('Storage administrativo indisponível.'), { status: 503 });
    const supplierId = Number(req.body?.supplierId), obligationId = safeText(req.body?.obligationId, 80) || null;
    if (!Number.isFinite(supplierId)) throw Object.assign(new Error('Fornecedor inválido.'), { status: 400 });
    const meta = uploadMeta(req.body, [...WAVE2_MIME_EXT.keys()], WAVE2_MAX_FILE_BYTES);
    const signed = await createSignedUpload({ supplierId, obligationId, meta });
    return res.json({ ok: true, bucket: WAVE2_BUCKET, path: signed.path, signedUrl: signed.signedUrl, uploadToken: signed.uploadToken, contentType: meta.mime });
  } catch (error) { return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_INTERNAL_UPLOAD', message: error.message || 'Falha ao preparar upload.' }); }
}

export async function internalComplete(req, res) {
  const admin = getAdminClient();
  let storagePath = safeText(req.body?.path, 500);
  try {
    await requireCapacidadeWave2(req, 'materiais');
    const supplierId = Number(req.body?.supplierId), obligationId = safeText(req.body?.obligationId, 80) || null;
    if (!Number.isFinite(supplierId)) throw Object.assign(new Error('Fornecedor inválido.'), { status: 400 });
    const meta = uploadMeta(req.body, [...WAVE2_MIME_EXT.keys()], WAVE2_MAX_FILE_BYTES);
    const prefix = `supplier/${supplierId}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.includes('\\')) throw Object.assign(new Error('Caminho inválido.'), { status: 403, code: 'WAVE2_PATH_SCOPE' });
    await validateStoredObject({ path: storagePath, expected: meta, allowedMimes: [...WAVE2_MIME_EXT.keys()], maxBytes: WAVE2_MAX_FILE_BYTES });
    const { data: assetId, error } = await admin.rpc('finalizar_asset_fornecedor_v2', { p_fornecedor_id: supplierId, p_obrigacao_id: obligationId || null, p_nome: meta.name, p_bucket: WAVE2_BUCKET, p_path: storagePath, p_mime: meta.mime, p_ext: meta.ext, p_size: meta.size, p_width: Number(req.body?.width) || null, p_height: Number(req.body?.height) || null, p_sha256: meta.sha256, p_origem: 'interno', p_token_id: null, p_mensagem: null });
    if (error) throw error;
    return res.json({ ok: true, assetId });
  } catch (error) {
    if (storagePath && admin) { try { await admin.storage.from(WAVE2_BUCKET).remove([storagePath]); } catch { } }
    return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_INTERNAL_COMPLETE', message: error.message || 'Falha ao concluir upload.' });
  }
}

export async function academyContext(req, res) {
  try {
    const ctx = await resolveAcademyToken(req.query.token);
    if (!ctx) return res.status(404).json({ ok: false, code: 'WAVE2_CHECKIN_INVALID', message: 'QR inválido, expirado ou desativado.' });
    return res.json({ ok: true, training: { id: ctx.treinamento_id, title: ctx.titulo, start: ctx.inicio_em, end: ctx.fim_em, location: ctx.local_treinamento } });
  } catch (error) { return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_CHECKIN_CONTEXT', message: error.message || 'Falha ao abrir check-in.' }); }
}

export async function academyCheckin(req, res) {
  const admin = getAdminClient();
  try {
    const ctx = await resolveAcademyToken(req.body?.token);
    if (!ctx) return res.status(404).json({ ok: false, code: 'WAVE2_CHECKIN_INVALID', message: 'QR inválido, expirado ou desativado.' });
    const identifier = safeText(req.body?.identifier, 160);
    if (!identifier) return res.status(400).json({ ok: false, code: 'WAVE2_CHECKIN_IDENTIFIER', message: 'Informe seu código, e-mail ou telefone.' });
    const digits = identifier.replace(/\D+/g, ''), lower = identifier.toLowerCase().trim();
    const { data: rows, error } = await admin.from('academia_inscricoes').select('id,representante_codigo,representante_nome,email,telefone,match_status').eq('treinamento_id', ctx.treinamento_id).eq('match_status', 'resolvido').limit(5000);
    if (error) throw error;
    const matches = (rows || []).filter(r => String(r.representante_codigo || '').trim() === identifier.trim() || String(r.email || '').toLowerCase().trim() === lower || (digits && String(r.telefone || '').replace(/\D+/g, '') === digits));
    if (matches.length !== 1) return res.status(matches.length ? 409 : 404).json({ ok: false, code: matches.length ? 'WAVE2_CHECKIN_AMBIGUOUS' : 'WAVE2_CHECKIN_NOT_FOUND', message: matches.length ? 'Identificação ambígua. Procure a equipe da PMG.' : 'Inscrição não encontrada. Procure a equipe da PMG para presença manual.' });
    const rep = matches[0];
    const { data: existing, error: existingError } = await admin.from('academia_presencas').select('id,presente_em').eq('treinamento_id', ctx.treinamento_id).eq('representante_codigo', rep.representante_codigo).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return res.json({ ok: true, already: true, name: rep.representante_nome, checkedAt: existing.presente_em, message: 'Sua presença já estava registrada.' });
    const { data: created, error: createError } = await admin.from('academia_presencas').insert({ treinamento_id: ctx.treinamento_id, representante_codigo: rep.representante_codigo, representante_nome: rep.representante_nome, metodo: 'qr' }).select('id,presente_em').single();
    if (createError) {
      if (createError.code === '23505') {
        const { data: raceExisting, error: raceError } = await admin.from('academia_presencas').select('id,presente_em').eq('treinamento_id', ctx.treinamento_id).eq('representante_codigo', rep.representante_codigo).maybeSingle();
        if (raceError) throw raceError;
        if (raceExisting) return res.json({ ok: true, already: true, name: rep.representante_nome, checkedAt: raceExisting.presente_em, message: 'Sua presença já estava registrada.' });
      }
      throw createError;
    }
    admin.from('operational_audit_events').insert({ modulo: 'academia', acao: 'presenca_qr', entidade_tipo: 'academia_presenca', entidade_id: String(created.id), metadata: { treinamento_id: ctx.treinamento_id, metodo: 'qr' } }).then(({ error: auditError }) => { if (auditError) console.warn('[Wave2][Academia] Falha não bloqueante no audit trail:', auditError.message); });
    return res.json({ ok: true, name: rep.representante_nome, checkedAt: created.presente_em, message: 'Presença registrada com sucesso.' });
  } catch (error) { return res.status(error.status || 500).json({ ok: false, code: error.code || 'WAVE2_CHECKIN', message: error.message || 'Não foi possível registrar a presença.' }); }
}

export const WAVE2_ROUTES = {
  'GET /portal/context': portalContext,
  'POST /portal/signed-upload': portalSignedUpload,
  'POST /portal/complete': portalComplete,
  'POST /internal/signed-upload': internalSignedUpload,
  'POST /internal/complete': internalComplete,
  'GET /academy/context': academyContext,
  'POST /academy/checkin': academyCheckin,
};
