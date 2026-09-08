export const STRATEGY_VERSION = '1.0.0';
export const DEFAULT_REVENUE_TARGET = 200_000_000;
export const DEFAULT_CYCLE_DAYS = 90;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const pct = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;

export function periodShift(de, ate = de) {
  if (!/^\d{4}-\d{2}$/.test(String(de || '')) || !/^\d{4}-\d{2}$/.test(String(ate || ''))) return null;
  const [ay, am] = de.split('-').map(Number);
  const [by, bm] = ate.split('-').map(Number);
  const start = ay * 12 + am - 1;
  const end = by * 12 + bm - 1;
  const span = end - start + 1;
  if (span < 1) return null;
  const previousEnd = start - 1;
  const previousStart = previousEnd - span + 1;
  const fmt = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
  return { de: fmt(previousStart), ate: fmt(previousEnd) };
}

export function datePlusDays(dateKey, days) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? new Date(`${dateKey}T12:00:00-03:00`) : new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
}

export function normalizeKpis(row = {}) {
  const totalValor = number(row.total_valor);
  const totalKg = number(row.total_kg);
  const pedidos = number(row.n_pedidos);
  return {
    total_valor: totalValor,
    total_kg: totalKg,
    n_registros: number(row.n_registros),
    n_pedidos: pedidos,
    n_cidades: number(row.n_cidades),
    n_ufs: number(row.n_ufs),
    n_fornecedores: number(row.n_fornecedores),
    n_clientes: number(row.n_clientes),
    ticket_medio: number(row.ticket_medio) || (pedidos ? totalValor / pedidos : 0),
  };
}

export function median(values = []) {
  const clean = values.map(number).filter(v => v > 0).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const half = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[half] : (clean[half - 1] + clean[half]) / 2;
}

export function mapDimension(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    const key = String(row?.chave ?? row?.cidade ?? '').trim();
    if (!key) return;
    map.set(key, number(row?.total ?? row?.valor));
  });
  return map;
}

function makeEvidence(label, current, previous = null, extra = null) {
  return { label, current: number(current), previous: previous == null ? null : number(previous), extra };
}

export function detectRegionalOpportunities(currentRows = [], previousRows = [], options = {}) {
  const minRevenue = number(options.minRevenue) || 50_000;
  const declineThreshold = number(options.declineThreshold) || -15;
  const underMedianThreshold = number(options.underMedianThreshold) || 0.55;
  const max = number(options.max) || 12;
  const prevMap = new Map(previousRows.map(r => [`${String(r.cidade || '').trim()}|${String(r.uf || '').trim()}`, number(r.valor)]));
  const byUf = new Map();
  currentRows.forEach(r => {
    const uf = String(r.uf || '').trim();
    if (!byUf.has(uf)) byUf.set(uf, []);
    byUf.get(uf).push(number(r.valor));
  });
  const medians = new Map([...byUf.entries()].map(([uf, values]) => [uf, median(values)]));
  const result = [];

  for (const row of currentRows) {
    const city = String(row.cidade || '').trim();
    const uf = String(row.uf || '').trim();
    const current = number(row.valor);
    const previous = prevMap.get(`${city}|${uf}`) || 0;
    const change = pct(current, previous);
    const ufMedian = medians.get(uf) || 0;

    if (previous >= minRevenue && change != null && change <= declineThreshold) {
      const gap = Math.max(0, previous - current);
      result.push({
        id: `regional-recovery:${city}:${uf}`,
        kind: 'regional', subtype: 'recuperacao', key: city, uf,
        title: `Recuperar desempenho em ${city}/${uf}`,
        description: `O faturamento caiu ${Math.abs(change).toFixed(1)}% contra o período anterior. O gap histórico observado é ${Math.round(gap).toLocaleString('pt-BR')} em receita.`,
        score: clamp(Math.abs(change) + Math.log10(Math.max(previous, 1)) * 8, 0, 100),
        measurableGap: gap,
        filters: { p_cidade: city, p_uf: uf },
        evidence: [makeEvidence('Faturamento', current, previous), makeEvidence('Volume kg', row.kg, null)],
        rule: 'REGIONAL_DECLINE_V1',
      });
    }

    if (current >= minRevenue && ufMedian > 0 && current < ufMedian * underMedianThreshold) {
      const gap = Math.max(0, ufMedian - current);
      result.push({
        id: `regional-under:${city}:${uf}`,
        kind: 'regional', subtype: 'baixa_penetracao_relativa', key: city, uf,
        title: `Investigar baixa penetração em ${city}/${uf}`,
        description: `A cidade fatura abaixo da mediana das cidades atendidas no mesmo estado. Isto é um sinal comparativo interno, não uma previsão de mercado.`,
        score: clamp((1 - current / ufMedian) * 70 + Math.log10(Math.max(current, 1)) * 4, 0, 100),
        measurableGap: gap,
        filters: { p_cidade: city, p_uf: uf },
        evidence: [makeEvidence('Faturamento', current, null, { referencia_mediana_uf: ufMedian })],
        rule: 'REGIONAL_UNDER_MEDIAN_V1',
      });
    }
  }

  const seen = new Set();
  return result
    .sort((a, b) => b.score - a.score)
    .filter(item => !seen.has(`${item.kind}:${item.key}`) && seen.add(`${item.kind}:${item.key}`))
    .slice(0, max);
}

export function detectDimensionOpportunities(currentRows = [], previousRows = [], kind = 'categoria', options = {}) {
  const minRevenue = number(options.minRevenue) || 100_000;
  const growthThreshold = number(options.growthThreshold) || 15;
  const declineThreshold = number(options.declineThreshold) || -15;
  const max = number(options.max) || 10;
  const currentMap = mapDimension(currentRows);
  const previousMap = mapDimension(previousRows);
  const totalCurrent = [...currentMap.values()].reduce((sum, value) => sum + value, 0) || 1;
  const result = [];
  for (const [key, current] of currentMap.entries()) {
    const previous = previousMap.get(key) || 0;
    const change = pct(current, previous);
    if (current < minRevenue || change == null) continue;
    const share = current / totalCurrent;
    if (change >= growthThreshold) {
      result.push({
        id: `${kind}-growth:${key}`,
        kind, subtype: 'aceleracao', key,
        title: `${key}: categoria em aceleração`,
        description: `Crescimento de ${change.toFixed(1)}% contra o período anterior. O sinal é histórico e deve ser validado por Comercial, Compras, Logística e Marketing antes de virar meta.`,
        score: clamp(change * 0.9 + share * 100, 0, 100),
        measurableGap: null,
        filters: kind === 'fornecedor' ? { p_fornecedor: key } : kind === 'produto' ? { p_produto: key } : { p_grupo: key },
        evidence: [makeEvidence('Faturamento', current, previous, { participacao: share })],
        rule: `${kind.toUpperCase()}_GROWTH_V1`,
      });
    } else if (change <= declineThreshold && previous >= minRevenue) {
      result.push({
        id: `${kind}-decline:${key}`,
        kind, subtype: 'recuperacao', key,
        title: `${key}: queda relevante para investigar`,
        description: `Queda de ${Math.abs(change).toFixed(1)}% contra o período anterior. O objetivo é entender se o problema é comercial, estoque, mix, logística ou mercado.`,
        score: clamp(Math.abs(change) * 0.8 + share * 70, 0, 100),
        measurableGap: Math.max(0, previous - current),
        filters: kind === 'fornecedor' ? { p_fornecedor: key } : kind === 'produto' ? { p_produto: key } : { p_grupo: key },
        evidence: [makeEvidence('Faturamento', current, previous, { participacao: share })],
        rule: `${kind.toUpperCase()}_DECLINE_V1`,
      });
    }
  }
  return result.sort((a, b) => b.score - a.score).slice(0, max);
}

export function projectMetricValue(kpis = {}, indicator = 'faturamento') {
  if (indicator === 'kg') return number(kpis.total_kg);
  if (indicator === 'pedidos') return number(kpis.n_pedidos);
  if (indicator === 'clientes') return number(kpis.n_clientes);
  if (indicator === 'ticket') return number(kpis.ticket_medio);
  return number(kpis.total_valor);
}

export function projectProgress(project = {}, currentKpis = null, now = new Date()) {
  const baseline = normalizeKpis(project.baseline || {});
  const current = normalizeKpis(currentKpis || project.current || {});
  const indicator = project.meta_indicador || 'faturamento';
  const baselineValue = projectMetricValue(baseline, indicator);
  const currentValue = projectMetricValue(current, indicator);
  const goal = number(project.meta_valor);
  const goalType = project.meta_tipo || 'percentual';
  const start = new Date(`${project.inicio || new Intl.DateTimeFormat('en-CA').format(now)}T12:00:00-03:00`);
  const end = new Date(`${project.fim || datePlusDays(project.inicio, DEFAULT_CYCLE_DAYS)}T12:00:00-03:00`);
  const elapsedDays = Math.max(0, (now - start) / 864e5);
  const durationDays = Math.max(1, (end - start) / 864e5);
  const timeProgress = clamp(elapsedDays / durationDays, 0, 1);
  let actualProgress = 0;
  let achieved = false;
  let delta = 0;

  if (goalType === 'absoluta') {
    const targetValue = goal;
    delta = currentValue - baselineValue;
    actualProgress = targetValue > baselineValue ? (currentValue - baselineValue) / (targetValue - baselineValue) : currentValue / Math.max(targetValue, 1);
    achieved = currentValue >= targetValue;
  } else {
    delta = baselineValue > 0 ? ((currentValue - baselineValue) / baselineValue) * 100 : 0;
    actualProgress = goal > 0 ? delta / goal : 0;
    achieved = goal >= 0 ? delta >= goal : delta <= goal;
  }
  actualProgress = clamp(actualProgress, -1, 2);
  const expected = timeProgress;
  let health = 'no_ritmo';
  if (achieved) health = 'atingido';
  else if (timeProgress >= 1) health = 'abaixo';
  else if (actualProgress < expected * 0.7) health = 'em_risco';
  else if (actualProgress < expected * 0.9) health = 'atencao';

  return { baselineValue, currentValue, goal, goalType, delta, timeProgress, actualProgress, achieved, health };
}

export function summarizeProjects(projects = [], latestByProject = new Map()) {
  const counters = { total: 0, active: 0, achieved: 0, risk: 0, attention: 0, below: 0, closed: 0 };
  let committedPotential = 0;
  for (const project of projects) {
    counters.total += 1;
    if (['encerrado', 'cancelado'].includes(project.status)) counters.closed += 1;
    else counters.active += 1;
    const latest = latestByProject.get(String(project.id))?.indicadores || null;
    const p = projectProgress(project, latest);
    if (p.health === 'atingido') counters.achieved += 1;
    else if (p.health === 'em_risco') counters.risk += 1;
    else if (p.health === 'atencao') counters.attention += 1;
    else if (p.health === 'abaixo') counters.below += 1;
    if (project.meta_indicador === 'faturamento') {
      if (project.meta_tipo === 'absoluta') committedPotential += Math.max(0, number(project.meta_valor) - p.baselineValue);
      else committedPotential += Math.max(0, p.baselineValue * number(project.meta_valor) / 100);
    }
  }
  return { ...counters, committedPotential };
}

export function sourceLineage({ endpoint, filters = {}, period = {}, capturedAt = new Date().toISOString(), note = '' } = {}) {
  return { source: 'PMG Bridge / SQL comercial', endpoint, filters, period, captured_at: capturedAt, note };
}
