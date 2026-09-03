const PT_LOCALE = 'pt-BR';

export function normalizeSupplierText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(PT_LOCALE)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSupplierCnpj(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : digits;
}

export function normalizeSupplierCode(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').toLocaleUpperCase(PT_LOCALE);
}

export function normalizeIdentityValue(type, value) {
  if (type === 'cnpj') return normalizeSupplierCnpj(value);
  if (type === 'codigo') return normalizeSupplierCode(value);
  return normalizeSupplierText(value);
}

function addMap(map, key, supplier) {
  if (!key || !supplier) return;
  if (!map.has(key)) map.set(key, new Map());
  map.get(key).set(String(supplier.id), supplier);
}

function values(map, key) {
  return key && map.has(key) ? [...map.get(key).values()] : [];
}

function uniqueSuppliers(list = []) {
  const map = new Map();
  list.forEach(item => {
    if (item?.id != null) map.set(String(item.id), item);
  });
  return [...map.values()];
}

export function buildSupplierIdentityIndex(suppliers = [], identities = []) {
  const byId = new Map();
  const byName = new Map();
  const byCnpj = new Map();
  const confirmedByScopedIdentity = new Map();
  const confirmedByIdentity = new Map();
  const pending = [];

  for (const supplier of suppliers || []) {
    if (!supplier || supplier.id == null) continue;
    byId.set(String(supplier.id), supplier);
    addMap(byName, normalizeSupplierText(supplier.nome), supplier);
    const cnpj = normalizeSupplierCnpj(supplier.cnpj);
    if (cnpj) addMap(byCnpj, cnpj, supplier);
  }

  for (const identity of identities || []) {
    const supplier = byId.get(String(identity?.fornecedor_id));
    if (!supplier) continue;
    if (identity.estado !== 'confirmado') {
      if (identity.estado === 'sugerido') pending.push(identity);
      continue;
    }
    const type = String(identity.tipo || 'alias');
    const normalized = identity.valor_normalizado || normalizeIdentityValue(type, identity.valor_original);
    if (!normalized) continue;
    const source = String(identity.origem || 'manual').trim().toLocaleLowerCase(PT_LOCALE) || 'manual';
    addMap(confirmedByScopedIdentity, `${source}|${type}|${normalized}`, supplier);
    addMap(confirmedByIdentity, `${type}|${normalized}`, supplier);
  }

  return { suppliers, identities, byId, byName, byCnpj, confirmedByScopedIdentity, confirmedByIdentity, pending };
}

function resolution(status, supplier = null, method = null, candidates = [], evidence = null) {
  return { status, supplier, method, candidates:uniqueSuppliers(candidates), evidence };
}

function resolveUnique(candidates, method, evidence) {
  const unique = uniqueSuppliers(candidates);
  if (unique.length === 1) return resolution('resolved', unique[0], method, unique, evidence);
  if (unique.length > 1) return resolution('ambiguous', null, method, unique, evidence);
  return null;
}

function resolveConfirmed(index, type, rawValue, source) {
  const normalized = normalizeIdentityValue(type, rawValue);
  if (!normalized) return null;
  const normalizedSource = String(source || '').trim().toLocaleLowerCase(PT_LOCALE);
  if (normalizedSource) {
    const scoped = resolveUnique(values(index.confirmedByScopedIdentity, `${normalizedSource}|${type}|${normalized}`), `${type}_confirmado`, rawValue);
    if (scoped) return scoped;
    const generic = resolveUnique(values(index.confirmedByScopedIdentity, `manual|${type}|${normalized}`), `${type}_confirmado`, rawValue);
    if (generic) return generic;
  }
  return resolveUnique(values(index.confirmedByIdentity, `${type}|${normalized}`), `${type}_confirmado`, rawValue);
}

export function resolveSupplierIdentity(input = {}, indexOrData = {}, options = {}) {
  const index = indexOrData?.byId ? indexOrData : buildSupplierIdentityIndex(indexOrData.suppliers || [], indexOrData.identities || []);
  const source = options.source || input.source || '';

  if (input.masterId != null && String(input.masterId).trim()) {
    const supplier = index.byId.get(String(input.masterId));
    if (supplier) return resolution('resolved', supplier, 'master_id', [supplier], input.masterId);
  }

  if (input.code != null && String(input.code).trim()) {
    const confirmed = resolveConfirmed(index, 'codigo', input.code, source);
    if (confirmed) return confirmed;
  }

  if (input.cnpj != null && String(input.cnpj).trim()) {
    const cnpj = normalizeSupplierCnpj(input.cnpj);
    const canonical = resolveUnique(values(index.byCnpj, cnpj), 'cnpj_canonico', input.cnpj);
    if (canonical) return canonical;
    const confirmed = resolveConfirmed(index, 'cnpj', input.cnpj, source);
    if (confirmed) return confirmed;
  }

  const rawName = input.name ?? input.nome ?? input.alias;
  if (rawName != null && String(rawName).trim()) {
    const confirmedAlias = resolveConfirmed(index, 'alias', rawName, source)
      || resolveConfirmed(index, 'nome', rawName, source);
    if (confirmedAlias) return confirmedAlias;

    const normalizedName = normalizeSupplierText(rawName);
    const canonical = resolveUnique(values(index.byName, normalizedName), 'nome_exato', rawName);
    if (canonical) return canonical;
  }

  return resolution('unresolved');
}

function bigrams(value) {
  const normalized = normalizeSupplierText(value).replace(/\s+/g, ' ');
  if (normalized.length < 2) return normalized ? [normalized] : [];
  const result = [];
  for (let i = 0; i < normalized.length - 1; i += 1) result.push(normalized.slice(i, i + 2));
  return result;
}

export function supplierSimilarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  right.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
  let matches = 0;
  left.forEach(token => {
    const count = counts.get(token) || 0;
    if (count > 0) {
      matches += 1;
      counts.set(token, count - 1);
    }
  });
  return (2 * matches) / (left.length + right.length);
}

export function suggestSupplierMatches(name, suppliers = [], { limit = 5, threshold = 0.68 } = {}) {
  const normalized = normalizeSupplierText(name);
  if (!normalized) return [];
  return (suppliers || [])
    .map(supplier => ({ supplier, score:supplierSimilarity(normalized, supplier?.nome || '') }))
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score || String(a.supplier?.nome || '').localeCompare(String(b.supplier?.nome || ''), PT_LOCALE))
    .slice(0, limit);
}

export function confirmedValuesForSupplier(supplierId, identities = []) {
  const result = { names:[], codes:[], cnpjs:[], aliases:[] };
  for (const identity of identities || []) {
    if (String(identity?.fornecedor_id) !== String(supplierId) || identity.estado !== 'confirmado') continue;
    const value = String(identity.valor_original || '').trim();
    if (!value) continue;
    if (identity.tipo === 'codigo') result.codes.push(value);
    else if (identity.tipo === 'cnpj') result.cnpjs.push(value);
    else if (identity.tipo === 'nome') result.names.push(value);
    else result.aliases.push(value);
  }
  for (const key of Object.keys(result)) result[key] = [...new Set(result[key])];
  return result;
}

function qualityIssueKey(type, parts = []) {
  return [type, ...parts.map(part => normalizeSupplierText(part) || String(part ?? '').trim())].join('|');
}

export function buildSupplierQualityIssues({ suppliers = [], identities = [], externalRecords = [], decisions = [] } = {}) {
  const index = buildSupplierIdentityIndex(suppliers, identities);
  const decisionMap = new Map((decisions || []).map(item => [String(item.issue_key), item]));
  const issues = [];
  const push = issue => {
    const decision = decisionMap.get(issue.key);
    issues.push({ ...issue, decision, state:decision?.estado || issue.state || 'pendente' });
  };

  for (const [normalized, supplierMap] of index.byName.entries()) {
    const candidates = [...supplierMap.values()];
    if (normalized && candidates.length > 1) {
      push({ key:qualityIssueKey('nome-duplicado', [normalized]), type:'duplicate_name', severity:'important', title:'Nome canônico duplicado', detail:candidates.map(item => item.nome).join(' · '), candidates });
    }
  }

  for (const [cnpj, supplierMap] of index.byCnpj.entries()) {
    const candidates = [...supplierMap.values()];
    if (cnpj && candidates.length > 1) {
      push({ key:qualityIssueKey('cnpj-duplicado', [cnpj]), type:'duplicate_cnpj', severity:'critical', title:'Mesmo CNPJ em fornecedores diferentes', detail:candidates.map(item => item.nome).join(' · '), candidates, cnpj });
    }
  }

  for (const [identityKey, supplierMap] of index.confirmedByIdentity.entries()) {
    const candidates = [...supplierMap.values()];
    if (candidates.length <= 1) continue;
    const separator = identityKey.indexOf('|');
    const type = separator >= 0 ? identityKey.slice(0, separator) : 'alias';
    const normalized = separator >= 0 ? identityKey.slice(separator + 1) : identityKey;
    const severity = type === 'cnpj' ? 'critical' : 'important';
    push({
      key:qualityIssueKey('identidade-confirmada-conflitante', [type, normalized]),
      type:'conflicting_confirmed_identity', severity,
      title:type === 'cnpj' ? 'CNPJ confirmado em fornecedores diferentes' : 'Identidade confirmada conflita entre fornecedores',
      detail:`${type}: ${normalized} · ${candidates.map(item => item.nome).join(' · ')}`,
      candidates,
    });
  }

  for (const identity of identities || []) {
    if (identity.estado === 'sugerido') {
      const supplier = index.byId.get(String(identity.fornecedor_id));
      push({ key:qualityIssueKey('alias-pendente', [identity.id]), type:'pending_alias', severity:'important', title:'Alias aguardando revisão', detail:`${identity.valor_original} → ${supplier?.nome || 'fornecedor desconhecido'}`, identity, candidates:supplier ? [supplier] : [] });
    }
  }

  for (const record of externalRecords || []) {
    const resolutionResult = resolveSupplierIdentity(record, index, { source:record.source });
    if (resolutionResult.status === 'resolved') {
      if (record.code && resolutionResult.method === 'nome_exato') {
        const codeResult = resolveConfirmed(index, 'codigo', record.code, record.source);
        if (!codeResult) {
          push({
            key:qualityIssueKey('codigo-nao-mapeado', [record.source, record.code, record.entityId]), type:'unmapped_code', severity:'info',
            title:'Código ainda não registrado como identidade', detail:`${record.code} · ${record.name || resolutionResult.supplier.nome}`,
            external:record, candidates:[resolutionResult.supplier], suggestedSupplier:resolutionResult.supplier,
          });
        }
      }
      continue;
    }

    const fuzzy = record.name ? suggestSupplierMatches(record.name, suppliers, { limit:3, threshold:0.72 }) : [];
    push({
      key:qualityIssueKey('identidade-nao-resolvida', [record.source, record.entityType, record.entityId, record.code || '', record.cnpj || '', record.name || '']),
      type:resolutionResult.status === 'ambiguous' ? 'ambiguous_identity' : 'unresolved_identity',
      severity:resolutionResult.status === 'ambiguous' ? 'important' : 'warning',
      title:resolutionResult.status === 'ambiguous' ? 'Identidade ambígua' : 'Fornecedor não resolvido',
      detail:[record.name, record.code ? `cód. ${record.code}` : '', record.source].filter(Boolean).join(' · '),
      external:record,
      candidates:resolutionResult.candidates,
      fuzzySuggestions:fuzzy,
      suggestedSupplier:fuzzy.length === 1 && fuzzy[0].score >= 0.88 ? fuzzy[0].supplier : null,
    });
  }

  const order = { critical:0, important:1, warning:2, info:3 };
  return issues.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.title.localeCompare(b.title, PT_LOCALE));
}
