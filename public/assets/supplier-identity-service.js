import {
  buildSupplierIdentityIndex,
  confirmedValuesForSupplier,
  normalizeSupplierText,
} from './supplier-identity-core.js';

function missingRelation(error) {
  const message = String(error?.message || error?.details || error || '');
  return /fornecedor_identidades|fornecedor_qualidade_decisoes|vincular_tarefa_fornecedor_v1|schema cache|does not exist|could not find/i.test(message);
}

export async function loadSupplierIdentityContext(db) {
  const suppliersResult = await db.from('fornecedores').select('id,nome,cnpj,categoria,slug,contato,email,status,ultimo_upload,total_pedidos,total_linhas,total_valor,total_kg,pct_sellin,criado_em,atualizado_em').order('nome');
  if (suppliersResult.error) throw suppliersResult.error;
  let identities = [];
  let decisions = [];
  let available = true;
  let installError = null;

  const [identityResult, decisionResult] = await Promise.all([
    db.from('fornecedor_identidades').select('*').order('criado_em', { ascending:false }),
    db.from('fornecedor_qualidade_decisoes').select('*').order('atualizado_em', { ascending:false }),
  ]);

  if (identityResult.error) {
    if (!missingRelation(identityResult.error)) throw identityResult.error;
    available = false;
    installError = identityResult.error;
  } else identities = identityResult.data || [];

  if (decisionResult.error) {
    if (!missingRelation(decisionResult.error)) throw decisionResult.error;
    available = false;
    installError ||= decisionResult.error;
  } else decisions = decisionResult.data || [];

  const suppliers = suppliersResult.data || [];
  return {
    suppliers,
    identities,
    decisions,
    available,
    installError,
    index:buildSupplierIdentityIndex(suppliers, identities),
  };
}

export async function registerSupplierIdentity(db, payload = {}) {
  const { data, error } = await db.rpc('registrar_identidade_fornecedor_v1', {
    p_fornecedor_id:payload.supplierId,
    p_tipo:payload.type || 'alias',
    p_valor_original:String(payload.value || '').trim(),
    p_origem:payload.source || 'manual',
    p_estado:payload.state || 'sugerido',
    p_confianca:payload.confidence ?? null,
    p_observacoes:payload.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function reviewSupplierIdentity(db, identityId, state, notes = null) {
  const { data, error } = await db.rpc('revisar_identidade_fornecedor_v1', {
    p_identidade_id:identityId,
    p_estado:state,
    p_observacoes:notes || null,
  });
  if (error) throw error;
  return data;
}

export async function saveSupplierQualityDecision(db, issueKey, state, { supplierId = null, notes = null } = {}) {
  const { data, error } = await db.rpc('salvar_decisao_qualidade_fornecedor_v1', {
    p_issue_key:issueKey,
    p_estado:state,
    p_fornecedor_id:supplierId,
    p_observacoes:notes || null,
  });
  if (error) throw error;
  return data;
}

export async function linkTaskSupplier(db, taskId, supplierId) {
  const { error } = await db.rpc('vincular_tarefa_fornecedor_v1', {
    p_tarefa_id:taskId,
    p_fornecedor_id:supplierId || null,
  });
  if (error) throw error;
}

export function supplierQueryValues(supplier, identities = []) {
  const confirmed = confirmedValuesForSupplier(supplier?.id, identities);
  return {
    names:[...new Set([supplier?.nome, ...confirmed.names, ...confirmed.aliases].filter(Boolean).map(value => String(value).trim()))],
    codes:[...new Set(confirmed.codes.map(value => String(value).trim()).filter(Boolean))],
    cnpjs:[...new Set([supplier?.cnpj, ...confirmed.cnpjs].filter(Boolean).map(value => String(value).trim()))],
  };
}

export function identityHealthForSupplier(supplier, identities = []) {
  const values = supplierQueryValues(supplier, identities);
  const pending = identities.filter(item => String(item.fornecedor_id) === String(supplier?.id) && item.estado === 'sugerido').length;
  const confirmedAliases = identities.filter(item => String(item.fornecedor_id) === String(supplier?.id) && item.estado === 'confirmado' && ['alias','nome'].includes(item.tipo)).length;
  return {
    level:pending ? 'attention' : values.codes.length || confirmedAliases ? 'good' : 'neutral',
    label:pending ? `${pending} identidade${pending === 1 ? '' : 's'} aguardando revisão` : 'Identidade canônica ativa',
    detail:[supplier?.cnpj ? 'CNPJ cadastrado' : 'CNPJ ausente', values.codes.length ? `${values.codes.length} código(s) vinculado(s)` : 'sem código externo confirmado'].join(' · '),
  };
}

export function uniqueExternalSupplierRecords(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const key = [row.source, row.entityType, row.entityId, row.code || '', row.cnpj || '', normalizeSupplierText(row.name || '')].join('|');
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}
