/*
 * fechamento.js — aba "Fechamento" dentro de Demandas.
 *
 * Fluxo do mês:
 *   1. Sobe os relatórios do CRM (vários de uma vez). O navegador lê, identifica o
 *      fornecedor, resume e publica storage/fornecedor-dashboards/<slug>.json.
 *   2. Lança os débitos da competência (digitados à mão).
 *   3. Sell-in (fornecedores com acordo): sobe a planilha "Sell In" (NFs do fornecedor
 *      pra PMG, TOTAL × PARTICIPAÇÃO = VERBA) ou digita no "Débitos e contatos".
 *      Fica em fechamento_sellin e entra como tabela SELL-IN no e-mail.
 *   4. Copia o e-mail pronto (Para, CC, assunto e corpo) e marca como enviado.
 *
 * Depende de globais do demandas-v2.js: db (Supabase autenticado), state, switchView,
 * VIEW_META, toast, refreshIcons. Depende de window.FechamentoCore e XLSX.
 *
 * Toda gravação confere o retorno do banco (RLS bloqueando volta 0 linhas, sem erro).
 * A tela só muda depois que o banco confirmou.
 */
(function () {
  'use strict';

  const BUCKET = 'fornecedor-dashboards';
  const EQUIPE_CC = ['marketing@pmg.com.br', 'marketing02@pmg.com.br', 'marketing04@pmg.com.br', 'marketing05@pmg.com.br', 'supervisaomarketing@pmg.com.br'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const C = () => window.FechamentoCore;

  const F = {
    pronto: false,
    carregando: false,
    fornecedores: [],
    debitos: new Map(),      // fornecedor_id → linha de fechamento_debitos da competência
    sellin: new Map(),       // fornecedor_id → linha de fechamento_sellin da competência
    sellinOff: false,        // tabela fechamento_sellin ainda não criada (SQL 42 não rodou)
    competencia: competenciaPadrao(),
    filtro: 'todos',
    busca: '',
    fila: [],                // arquivos do upload
    processando: false,
    geoPromise: null,
  };

  /* ───────────── helpers ───────────── */
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const aviso = (msg, tipo = 'success') => (typeof toast === 'function' ? toast(msg, tipo) : console[tipo === 'error' ? 'error' : 'log'](msg));
  const icones = () => { if (typeof refreshIcons === 'function') refreshIcons(); else if (window.lucide) window.lucide.createIcons(); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function competenciaPadrao() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const competenciaData = () => `${F.competencia}-01`;
  const nomeMesCompetencia = () => MESES[Number(F.competencia.split('-')[1]) - 1];
  const linkDashboard = (f) => `${location.origin}/fornecedor/${f.slug_publico}`;
  const caminhoJson = (slug) => `${slug}.json`;

  function parseNumero(v) {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  const pct = (p) => (Number(p) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
  const nomeMesDe = (comp) => MESES[Number(String(comp).split('-')[1]) - 1] || comp;

  // "1,5" / "1,5%" / "0,015" → 0.015 (o que passar de 1 é tratado como porcentagem)
  function parsePct(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = parseNumero(s.replace('%', ''));
    if (Number.isNaN(n)) return NaN;
    return s.includes('%') || n > 1 ? n / 100 : n;
  }

  function listaEmails(txt) {
    return [...new Set(String(txt || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }
  const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

  async function usuarioAtual() {
    const s = (typeof state !== 'undefined' && state.session) ? state.session : (await db.auth.getSession()).data.session;
    return s?.user || null;
  }

  /* ───────────── dados ───────────── */
  async function carregar() {
    if (F.carregando) return;
    F.carregando = true;
    renderLista(true);
    try {
      const [forn, deb, sel] = await Promise.all([
        db.from('fechamento_fornecedores').select('*').order('nome'),
        db.from('fechamento_debitos').select('*').eq('competencia', competenciaData()),
        db.from('fechamento_sellin').select('*').eq('competencia', competenciaData()),
      ]);
      if (forn.error) throw forn.error;
      if (deb.error) throw deb.error;
      // sem a tabela de sell-in (SQL 42 não rodou) o resto do fechamento continua funcionando
      F.sellinOff = !!sel.error;
      if (sel.error) console.warn('[fechamento] sell-in indisponível:', sel.error.message || sel.error);
      F.fornecedores = forn.data || [];
      F.debitos = new Map((deb.data || []).map((d) => [d.fornecedor_id, d]));
      F.sellin = new Map((sel.data || []).map((d) => [d.fornecedor_id, d]));
      F.pronto = true;
    } catch (e) {
      el('fechLista').innerHTML = `<div class="empty-state">Não deu pra carregar o fechamento: ${esc(e.message || e)}</div>`;
      F.carregando = false;
      return;
    }
    F.carregando = false;
    render();
  }

  /* ───────────── render principal ───────────── */
  function render() {
    if (!el('viewFechamento')) return;
    el('fechCompetencia').value = F.competencia;
    renderResumo();
    renderFila();
    renderLista();
    icones();
  }

  function statusFornecedor(f) {
    const deb = F.debitos.get(f.id);
    const dashOk = f.dashboard_mes_final && f.dashboard_mes_final.slice(0, 7) >= F.competencia;
    const itens = deb?.itens || [];
    const sl = F.sellin.get(f.id) || null;
    return {
      sellin: sl,
      temSellin: !!f.tem_sellin || !!sl,
      sellinPendente: !!f.tem_sellin && !sl,
      dashOk,
      temDash: !!f.dashboard_mes_final,
      enviado: !!deb?.enviado_em,
      enviadoEm: deb?.enviado_em,
      totalPendente: itens.reduce((a, i) => a + (Number(i.pendente) || 0), 0),
      temDebito: itens.length > 0,
      semEmail: !(f.emails_para || []).length,
    };
  }

  function renderResumo() {
    const ativos = F.fornecedores.filter((f) => f.ativo);
    const st = ativos.map(statusFornecedor);
    const dash = st.filter((s) => s.dashOk).length;
    const deb = st.filter((s) => s.temDebito).length;
    const env = st.filter((s) => s.enviado).length;
    const total = st.reduce((a, s) => a + s.totalPendente, 0);
    const comSellin = st.filter((s) => s.temSellin);
    const sellinOk = comSellin.filter((s) => s.sellin).length;
    const verba = comSellin.reduce((a, s) => a + (Number(s.sellin?.verba) || 0), 0);
    const card = (rot, val, sub, cls = '') => `<div class="fech-kpi ${cls}"><span>${rot}</span><strong>${val}</strong><small>${sub}</small></div>`;
    el('fechResumo').innerHTML =
      card('Dashboards atualizados', `${dash}/${ativos.length}`, `com ${nomeMesCompetencia()}`, dash === ativos.length && ativos.length ? 'ok' : '') +
      card('Débitos lançados', `${deb}/${ativos.length}`, brl(total) + ' pendente') +
      (comSellin.length && !F.sellinOff ? card('Sell-in lançado', `${sellinOk}/${comSellin.length}`, `${brl(verba)} de verba`, sellinOk === comSellin.length ? 'ok' : '') : '') +
      card('E-mails enviados', `${env}/${ativos.length}`, `fechamento de ${nomeMesCompetencia()}`, env === ativos.length && ativos.length ? 'ok' : '');
    el('fechResumo').classList.toggle('com-sellin', !!comSellin.length && !F.sellinOff);
  }

  function renderLista(carregando = false) {
    const box = el('fechLista');
    if (!box) return;
    if (carregando && !F.pronto) { box.innerHTML = '<div class="empty-state">Carregando fornecedores…</div>'; return; }
    const busca = C() ? C().chave(F.busca) : F.busca.toLowerCase();
    let lista = F.fornecedores.filter((f) => (F.filtro === 'inativos' ? !f.ativo : f.ativo));
    if (busca) lista = lista.filter((f) => C().chave(f.nome).includes(busca) || (f.emails_para || []).some((e) => e.includes(F.busca.toLowerCase())));
    if (F.filtro === 'pendentes') lista = lista.filter((f) => { const s = statusFornecedor(f); return !s.dashOk || !s.enviado || s.sellinPendente; });
    if (F.filtro === 'sellin') lista = lista.filter((f) => statusFornecedor(f).temSellin);
    if (F.filtro === 'sem-email') lista = lista.filter((f) => statusFornecedor(f).semEmail);
    if (!lista.length) { box.innerHTML = '<div class="empty-state">Nenhum fornecedor nesse filtro.</div>'; return; }
    box.innerHTML = lista.map((f) => {
      const s = statusFornecedor(f);
      const chipDash = s.dashOk
        ? `<span class="fech-chip ok"><i data-lucide="chart-no-axes-combined"></i>Até ${C().nomeMes(f.dashboard_mes_final.slice(0, 7), true)}</span>`
        : s.temDash
          ? `<span class="fech-chip warn"><i data-lucide="chart-no-axes-combined"></i>Parado em ${C().nomeMes(f.dashboard_mes_final.slice(0, 7), true)}</span>`
          : '<span class="fech-chip muted"><i data-lucide="chart-no-axes-combined"></i>Sem dashboard</span>';
      const chipDeb = s.temDebito
        ? `<span class="fech-chip ${s.totalPendente > 0 ? 'info' : 'muted'}"><i data-lucide="receipt"></i>${brl(s.totalPendente)}</span>`
        : '<span class="fech-chip muted"><i data-lucide="receipt"></i>Sem débito lançado</span>';
      const chipSellin = !s.temSellin || F.sellinOff ? ''
        : s.sellin
          ? `<span class="fech-chip info" title="${esc(`${(s.sellin.notas || []).length} NF(s) · ${brl(s.sellin.total)} × ${pct(s.sellin.participacao)}`)}"><i data-lucide="file-input"></i>Sell-in · verba ${brl(s.sellin.verba)}</span>`
          : '<span class="fech-chip warn"><i data-lucide="file-input"></i>Sell-in a lançar</span>';
      const chipEnv = s.enviado
        ? `<span class="fech-chip ok"><i data-lucide="mail-check"></i>Enviado ${new Date(s.enviadoEm).toLocaleDateString('pt-BR')}</span>`
        : s.semEmail
          ? '<span class="fech-chip danger"><i data-lucide="mail-x"></i>Sem e-mail</span>'
          : '<span class="fech-chip muted"><i data-lucide="mail"></i>A enviar</span>';
      return `<article class="fech-row card" data-id="${f.id}">
        <div class="fech-row-main">
          <strong>${esc(f.nome)}</strong>
          <small>${(f.emails_para || []).length} contato(s)${f.observacoes ? ' · ' + esc(f.observacoes) : ''}</small>
        </div>
        <div class="fech-row-chips">${chipDash}${chipDeb}${chipSellin}${chipEnv}</div>
        <div class="fech-row-actions">
          <button type="button" class="icon-btn subtle" data-fech-acao="abrir" title="Abrir dashboard" ${s.temDash ? '' : 'disabled'}><i data-lucide="external-link"></i></button>
          <button type="button" class="icon-btn subtle" data-fech-acao="link" title="Copiar link do dashboard"><i data-lucide="link"></i></button>
          <button type="button" class="btn secondary" data-fech-acao="editar"><i data-lucide="pencil"></i><span>${s.temSellin ? 'Débitos, sell-in e contatos' : 'Débitos e contatos'}</span></button>
          <button type="button" class="btn primary" data-fech-acao="email"><i data-lucide="mail"></i><span>E-mail</span></button>
        </div>
      </article>`;
    }).join('');
    icones();
  }

  /* ───────────── upload ───────────── */
  function adicionarArquivos(files) {
    const xs = [...files].filter((f) => /\.xlsx?$/i.test(f.name));
    if (!xs.length) { aviso('Escolha arquivos .xlsx exportados do CRM.', 'error'); return; }
    for (const file of xs) F.fila.push({ id: crypto.randomUUID(), file, tipo: null, status: 'lendo', msg: 'Lendo arquivo…' });
    renderFila();
    processarFila();
  }

  async function processarFila() {
    if (F.processando) return;
    F.processando = true;
    try {
      // Um arquivo por vez, do começo ao fim: lê, resume e (se der) já publica.
      // Assim só um arquivo grande fica na memória por vez, e dois arquivos do
      // mesmo fornecedor nunca se atropelam.
      let item;
      while ((item = F.fila.find((i) => i.status === 'lendo' || i.status === 'publicar'))) {
        if (item.status === 'lendo') {
          try {
            await lerItem(item);
          } catch (e) {
            item.status = 'erro'; item.msg = e.message || String(e);
          }
          renderFila();
        }
        if (item.status === 'publicar') {
          if (item.tipo === 'sellin') await publicarSellin(item); else await publicarItem(item);
          renderFila();
        }
      }
    } finally {
      F.processando = false;
      renderResumo(); renderLista();
    }
  }

  async function lerItem(item) {
    const buf = await item.file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 20)); // deixa a tela pintar "Lendo…"
    if (item.tipo === 'sellin') return lerItemSellin(item, buf);

    // Um arquivo pode ter vendas (aba Base / relatório do CRM) E sell-in (aba "Sell-In"),
    // como as planilhas com tracinho. Nesse caso vira dois itens na fila.
    const nomes = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
    const abasSellin = nomes.filter((n) => C().ehAbaSellin(n));
    const outras = nomes.filter((n) => !abasSellin.includes(n));
    const temBase = outras.some((n) => C().chave(n) === 'base');
    let abaSellin = abasSellin[0] || null;
    let temVendas = temBase;
    if (!temBase && outras.length) {
      // espia só o começo das abas: relatório de vendas ou sell-in numa aba sem nome ("Planilha1")
      const peek = XLSX.read(buf, { type: 'array', sheets: outras, sheetRows: 60, cellDates: true, dense: true });
      temVendas = C().pareceVendas(peek, XLSX);
      if (!abaSellin) abaSellin = C().acharAbaSellin(peek, XLSX);
      if (!temVendas && !abaSellin) temVendas = true; // deixa a leitura normal dar o erro de formato
    }
    if (abaSellin && !F.sellinOff) {
      if (!temVendas) { item.tipo = 'sellin'; item.abaSellin = abaSellin; return lerItemSellin(item, buf); }
      const pos = F.fila.indexOf(item);
      F.fila.splice(pos + 1, 0, { id: crypto.randomUUID(), file: item.file, tipo: 'sellin', abaSellin, status: 'lendo', msg: 'Lendo sell-in…' });
    }
    item.tipo = 'vendas';

    // template antigo tem pivot/Power Pivot pesados: lê só a aba Base
    const opts = { type: 'array', cellDates: true, dense: true };
    if (temBase) opts.sheets = outras.filter((n) => C().chave(n) === 'base');
    else if (abasSellin.length) opts.sheets = outras;
    const wb = XLSX.read(buf, opts);
    const lido = C().lerWorkbook(wb, XLSX, item.file.name);
    const id = C().identificarFornecedor(lido, F.fornecedores);
    // guarda só o resumo mensal: as linhas brutas (até ~450 mil) saem da memória aqui
    item.resumo = C().resumir(lido.rows, lido.formato);
    lido.nLinhas = lido.rows.length;
    lido.rows = null;
    item.lido = lido;
    item.fornecedorId = id.fornecedor?.id || null;
    item.certeza = id.certeza;
    item.motivo = id.motivo;
    const avisos = [...lido.avisos];
    if (lido.totalConfere === false) avisos.push(`Soma das linhas (${brl(lido.totalVenda)}) não bate com o "Total:" do relatório (${brl(lido.totalRelatorio)}).`);
    if (lido.formato !== 'template' && lido.dataMin.getDate() > 3) avisos.push(`O arquivo começa em ${lido.dataMin.toLocaleDateString('pt-BR')}. ${C().nomeMes(lido.meses[0])} vai ficar só com os dias do arquivo.`);
    if (lido.formato === 'template') avisos.push(`Carga de histórico: substitui ${lido.meses.length} mês(es), de ${C().nomeMes(lido.meses[0], true)} a ${C().nomeMes(lido.meses.at(-1), true)}.`);
    item.avisos = avisos;
    const auto = item.certeza && lido.totalConfere !== false && !avisos.length && lido.formato !== 'template';
    item.status = auto ? 'publicar' : 'confirmar';
    item.msg = auto ? 'Publicando…' : (item.fornecedorId ? 'Confira e publique' : 'Escolha o fornecedor');
  }

  /* ───────────── sell-in ───────────── */
  function lerItemSellin(item, buf) {
    const opts = { type: 'array', cellDates: true, dense: true, sheetRows: 3000 };
    if (item.abaSellin) opts.sheets = [item.abaSellin];
    const wb = XLSX.read(buf, opts);
    const lido = C().lerSellinWorkbook(wb, XLSX, item.file.name);
    if (!lido) throw new Error('Não achei a tabela de sell-in (colunas Número, Emissão e Valor).');
    const id = C().identificarSellin(lido, F.fornecedores);
    item.lido = lido;
    item.fornecedorId = id.fornecedor?.id || null;
    item.certeza = id.certeza;
    item.motivo = id.motivo;
    item.competencia = lido.competencia || F.competencia;
    const f = F.fornecedores.find((x) => x.id === item.fornecedorId);
    item.participacao = lido.participacao ?? (f?.sellin_participacao != null ? Number(f.sellin_participacao) : null);
    const avisos = [...lido.avisos];
    if (lido.participacao === null) {
      avisos.push(item.participacao !== null
        ? `A planilha não tem PARTICIPAÇÃO. Usando o último % de ${f.nome} (${pct(item.participacao)}).`
        : 'A planilha não tem PARTICIPAÇÃO. Informe o % pra calcular a verba.');
    }
    if (item.competencia !== F.competencia) avisos.push(`O sell-in é de ${nomeMesDe(item.competencia)} de ${item.competencia.slice(0, 4)} e a tela está em ${nomeMesCompetencia()}. Confira o mês antes de salvar.`);
    if (f && !f.tem_sellin) avisos.push(`${f.nome} ainda não estava marcado com sell-in. Ao salvar, passa a ser.`);
    item.avisos = avisos;
    const auto = item.certeza && !avisos.length && item.participacao !== null;
    item.status = auto ? 'publicar' : 'confirmar';
    item.msg = auto ? 'Salvando sell-in…' : (item.fornecedorId ? 'Confira e salve o sell-in' : 'Escolha o fornecedor');
  }

  async function publicarSellin(item) {
    const f = F.fornecedores.find((x) => x.id === item.fornecedorId);
    if (!f) { item.status = 'confirmar'; item.msg = 'Escolha o fornecedor'; return; }
    const lido = item.lido;
    const p = item.participacao;
    if (p === null || p === undefined || Number.isNaN(p) || p < 0 || p > 1) { item.status = 'confirmar'; item.msg = 'Informe o % de participação (ex.: 1,5)'; return; }
    if (!/^\d{4}-\d{2}$/.test(item.competencia || '')) { item.status = 'confirmar'; item.msg = 'Escolha o mês do sell-in'; return; }
    item.status = 'publicando'; item.msg = 'Salvando sell-in…'; renderFila();
    try {
      const comp = `${item.competencia}-01`;
      // já tem sell-in desse mês com outro total? só substitui se a pessoa confirmar
      if (!item.forcar) {
        const atual = item.competencia === F.competencia ? F.sellin.get(f.id)
          : (await db.from('fechamento_sellin').select('total, notas').eq('fornecedor_id', f.id).eq('competencia', comp).maybeSingle()).data;
        if (atual && Math.abs(Number(atual.total) - lido.total) > 0.005) {
          item.status = 'confirmar';
          item.msg = `${f.nome} já tem sell-in de ${nomeMesDe(item.competencia)}: ${brl(atual.total)} (${(atual.notas || []).length} NFs). Salvar substitui.`;
          item.forcarPendente = true;
          return;
        }
      }
      const verba = r2(lido.total * p);
      const res = await db.from('fechamento_sellin').upsert({
        fornecedor_id: f.id, competencia: comp, notas: lido.notas, total: lido.total,
        participacao: p, verba, arquivo_nome: item.file.name,
      }, { onConflict: 'fornecedor_id,competencia' }).select().single();
      if (res.error || !res.data) throw new Error('Sell-in não salvou: ' + (res.error?.message || 'sem permissão'));
      if (item.competencia === F.competencia) F.sellin.set(f.id, res.data);

      if (!f.tem_sellin || Number(f.sellin_participacao) !== p) {
        const upd = await db.from('fechamento_fornecedores').update({ tem_sellin: true, sellin_participacao: p }).eq('id', f.id).select().single();
        if (!upd.error && upd.data) Object.assign(f, upd.data);
      }
      const log = await db.from('fechamento_uploads').insert({
        fornecedor_id: f.id, tipo: 'sellin', arquivo_nome: item.file.name, nome_crm: null,
        mes_inicial: comp, mes_final: comp, linhas: lido.notas.length, total_venda: lido.total, total_relatorio: lido.totalPlanilha ?? null,
      });
      if (log.error) console.warn('[fechamento] log de upload do sell-in não gravou', log.error);

      item.status = 'ok';
      item.msg = `Sell-in salvo em ${f.nome} · ${nomeMesDe(item.competencia)} · ${brl(lido.total)} × ${pct(p)} = verba ${brl(verba)}`;
    } catch (e) {
      item.status = 'erro';
      item.msg = e.message || String(e);
    }
  }

  function carregarGeo() {
    if (typeof GEO_BR !== 'undefined') return Promise.resolve(GEO_BR); // eslint-disable-line no-undef
    if (!F.geoPromise) {
      F.geoPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '/geo-data.js';
        s.onload = () => resolve(typeof GEO_BR !== 'undefined' ? GEO_BR : {}); // eslint-disable-line no-undef
        s.onerror = () => resolve({}); // sem coordenadas o mapa só não aparece; o resto publica normal
        document.head.appendChild(s);
      });
    }
    return F.geoPromise;
  }

  async function lerPublicado(slug, deveExistir = false) {
    const { data, error } = await db.storage.from(BUCKET).download(caminhoJson(slug));
    if (error) {
      const msg = String(error.message || error);
      const naoAchou = /not.?found|404|does not exist/i.test(msg) || error.statusCode === '404' || error.status === 400 || error.status === 404;
      // Se o cadastro diz que já existe dashboard, "não achei" é problema de acesso/rede:
      // seguir em frente apagaria o histórico publicado.
      if (naoAchou && !deveExistir) return null;
      throw new Error('Não deu pra ler o dashboard publicado (' + msg + '). Nada foi alterado.');
    }
    try { return JSON.parse(await data.text()); } catch { throw new Error('O dashboard publicado está corrompido. Fale com quem cuida do Connect antes de publicar por cima.'); }
  }

  async function publicarItem(item) {
    const f = F.fornecedores.find((x) => x.id === item.fornecedorId);
    if (!f) { item.status = 'confirmar'; item.msg = 'Escolha o fornecedor'; return; }
    item.status = 'publicando'; item.msg = 'Publicando…'; renderFila();
    try {
      const lido = item.lido;
      const [publicado, geoBR] = await Promise.all([lerPublicado(f.slug_publico, !!f.dashboard_mes_final), carregarGeo()]);
      const anteriores = C().decodificar(publicado);

      // Trava de segurança: o arquivo novo traz bem menos do que já está publicado
      // no mesmo mês (ex.: relatório filtrado por poucos produtos). Só segue se
      // a pessoa confirmar.
      if (!item.forcar) {
        const quedas = [];
        for (const [m, novo] of Object.entries(item.resumo)) {
          const velho = anteriores[m];
          if (!velho || !velho.t.venda) continue;
          const nProdVelho = Object.keys(velho.p).length, nProdNovo = Object.keys(novo.p).length;
          if (novo.t.venda < velho.t.venda * 0.95 || nProdNovo < nProdVelho * 0.8) {
            quedas.push(`${C().nomeMes(m, true)}: publicado ${brl(velho.t.venda)} (${nProdVelho} produtos) → arquivo ${brl(novo.t.venda)} (${nProdNovo} produtos)`);
          }
        }
        if (quedas.length) {
          item.status = 'confirmar';
          item.msg = 'Esse arquivo tem MENOS do que já está publicado. Confira se o relatório saiu completo.';
          item.avisos = [...(item.avisos || []).filter((a) => !a.startsWith('Diferença:')), ...quedas.map((q) => 'Diferença: ' + q)];
          item.forcarPendente = true;
          return;
        }
      }
      const meses = C().mesclar(anteriores, item.resumo);
      const json = C().codificar(meses, { fornecedor: f.nome }, { geo: C().criarGeo(geoBR) });
      const corpo = JSON.stringify(json);
      if (corpo.length > 5 * 1024 * 1024) throw new Error(`O resumo ficou com ${(corpo.length / 1048576).toFixed(1)} MB (limite 5 MB). Fale com quem cuida do Connect.`);

      const up = await db.storage.from(BUCKET).upload(caminhoJson(f.slug_publico), new Blob([corpo], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '60' });
      if (up.error) throw new Error('Upload recusado: ' + (up.error.message || up.error));

      // confere que o que está no Storage é o que acabou de ser gerado
      const conferido = await lerPublicado(f.slug_publico);
      if (!conferido || conferido.atualizado_em !== json.atualizado_em) throw new Error('O arquivo subiu, mas a conferência não bateu. Tente de novo.');

      // aprende o nome/código do CRM pra próxima vez cair direto
      const aliases = new Set(f.nomes_crm || []);
      if (lido.fornecedorCrm) aliases.add(lido.fornecedorCrm);
      if (lido.codigoArquivo && lido.formato !== 'template') aliases.add(lido.codigoArquivo);

      const upd = await db.from('fechamento_fornecedores').update({
        dashboard_atualizado_em: json.atualizado_em,
        dashboard_mes_inicial: json.mes_inicial + '-01',
        dashboard_mes_final: json.mes_final + '-01',
        dashboard_bytes: corpo.length,
        nomes_crm: [...aliases],
      }).eq('id', f.id).select().single();
      if (upd.error || !upd.data) throw new Error('Dashboard publicado, mas o cadastro não atualizou: ' + (upd.error?.message || 'sem permissão'));
      Object.assign(f, upd.data);

      const log = await db.from('fechamento_uploads').insert({
        fornecedor_id: f.id, tipo: lido.formato === 'template' ? 'template' : 'crm', arquivo_nome: item.file.name,
        nome_crm: lido.fornecedorCrm || lido.codigoArquivo || null,
        mes_inicial: lido.meses[0] + '-01', mes_final: lido.meses.at(-1) + '-01',
        linhas: lido.nLinhas, total_venda: lido.totalVenda, total_relatorio: lido.totalRelatorio ?? null,
      });
      if (log.error) console.warn('[fechamento] log de upload não gravou', log.error);

      item.status = 'ok';
      const mesesTxt = lido.meses.length > 3
        ? `${lido.meses.length} meses (${C().nomeMes(lido.meses[0], true)} a ${C().nomeMes(lido.meses.at(-1), true)})`
        : lido.meses.map((m) => C().nomeMes(m, true)).join(', ');
      item.msg = `Publicado em ${f.nome} · ${mesesTxt} · ${brl(lido.totalVenda)}`;
    } catch (e) {
      item.status = 'erro';
      item.msg = e.message || String(e);
    }
  }

  function renderFila() {
    const box = el('fechFila');
    if (!box) return;
    if (!F.fila.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const ativos = F.fornecedores.filter((f) => f.ativo);
    const icone = { lendo: 'loader-circle', publicar: 'loader-circle', publicando: 'loader-circle', confirmar: 'circle-alert', ok: 'circle-check-big', erro: 'circle-x' };
    const conferidos = F.fila.filter((i) => i.status === 'confirmar' && i.fornecedorId && !i.forcarPendente && (i.tipo !== 'sellin' || i.participacao != null)).length;
    box.innerHTML = `<div class="fech-fila-head"><strong>Relatórios</strong><div class="fech-fila-botoes">${conferidos > 1 ? `<button type="button" class="btn primary" data-fech-acao="publicar-todos"><i data-lucide="upload-cloud"></i><span>Publicar ${conferidos} conferidos</span></button>` : ''}<button type="button" class="btn secondary" data-fech-acao="limpar-fila"><i data-lucide="eraser"></i><span>Limpar concluídos</span></button></div></div>` +
      F.fila.map((i) => {
        const L = i.lido;
        const sellin = i.tipo === 'sellin';
        const detalhes = !L ? ''
          : sellin
            ? `${L.notas.length} NF(s) · ${brl(L.total)}${i.participacao != null && !Number.isNaN(i.participacao) ? ` × ${pct(i.participacao)} = verba ${brl(r2(L.total * i.participacao))}` : ''}${L.totalPlanilha != null && Math.abs(L.totalPlanilha - L.total) <= 0.05 ? ' · confere com o TOTAL da planilha ✓' : ''}`
            : `${L.nLinhas.toLocaleString('pt-BR')} linhas · ${L.dataMin.toLocaleDateString('pt-BR')} a ${L.dataMax.toLocaleDateString('pt-BR')} · ${brl(L.totalVenda)}${L.totalConfere ? ' · confere com o Total do relatório ✓' : ''}`;
        const extrasSellin = sellin && i.status === 'confirmar'
          ? `<input type="month" data-fech-comp="${i.id}" value="${esc(i.competencia || '')}" title="Mês do sell-in">
             <input type="text" inputmode="decimal" data-fech-pct="${i.id}" value="${i.participacao != null && !Number.isNaN(i.participacao) ? (i.participacao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : ''}" placeholder="% part." title="% de participação">`
          : '';
        const podeSalvar = i.fornecedorId && (!sellin || (i.participacao != null && !Number.isNaN(i.participacao)));
        const rotuloBtn = sellin ? (i.forcarPendente ? 'Substituir sell-in' : 'Salvar sell-in') : (i.forcarPendente ? 'Publicar mesmo assim' : 'Publicar');
        const select = i.status === 'confirmar'
          ? `<select data-fech-forn="${i.id}"><option value="">Qual fornecedor?</option>${ativos.map((f) => `<option value="${f.id}" ${f.id === i.fornecedorId ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>
             ${extrasSellin}
             <button type="button" class="btn primary" data-fech-acao="publicar" data-item="${i.id}" ${podeSalvar ? '' : 'disabled'}><i data-lucide="${sellin ? 'file-input' : 'upload-cloud'}"></i><span>${rotuloBtn}</span></button>`
          : '';
        const descartar = ['confirmar', 'erro'].includes(i.status) ? `<button type="button" class="icon-btn subtle" data-fech-acao="descartar" data-item="${i.id}" title="Tirar da fila"><i data-lucide="x"></i></button>` : '';
        return `<div class="fech-item ${i.status}">
          <i data-lucide="${icone[i.status]}" class="${['lendo', 'publicar', 'publicando'].includes(i.status) ? 'spin' : ''}"></i>
          <div class="fech-item-txt">
            <strong>${sellin ? '<span class="fech-tag">Sell-in</span>' : ''}${esc(i.file.name)}</strong>
            <small>${esc(i.msg)}${i.motivo && i.status === 'confirmar' ? ' · ' + esc(i.motivo) : ''}</small>
            ${detalhes ? `<small class="fech-item-det">${esc(detalhes)}</small>` : ''}
            ${(i.avisos || []).map((a) => `<small class="fech-item-aviso">${esc(a)}</small>`).join('')}
          </div>
          <div class="fech-item-acao">${select}${descartar}</div>
        </div>`;
      }).join('');
    icones();
  }

  /* ───────────── e-mail ───────────── */
  function montarEmail(f, eu) {
    const sl = F.sellin.get(f.id) || null;
    const deb = F.debitos.get(f.id);
    const itens = deb?.itens || [];
    const mes = nomeMesCompetencia();
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const link = linkDashboard(f);
    const assunto = `Fechamento PMG - ${cap(mes)} - ${f.nome}`;
    const meu = (eu?.email || '').toLowerCase();
    const cc = [...new Set([...EQUIPE_CC, ...(f.emails_cc || [])])].filter((e) => e !== meu);
    const totRef = itens.reduce((a, i) => a + (Number(i.referente) || 0), 0);
    const totPen = itens.reduce((a, i) => a + (Number(i.pendente) || 0), 0);

    const td = 'border:1px solid #9bb3a3;padding:6px 12px;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
    const th = td + 'background:#184b2d;color:#ffffff;font-weight:bold;text-align:center;';
    const tabela = itens.length ? `
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px">
  <tr><td colspan="3" style="${th}">DÉBITOS</td></tr>
  <tr><td style="${th}">REFERE:</td><td style="${th}">${esc(mes.toUpperCase())}</td><td style="${th}">TOTAL PENDENTE</td></tr>
  ${itens.map((i) => `<tr><td style="${td}font-weight:bold">${esc(String(i.descricao || '').toUpperCase())}</td><td style="${td}text-align:right">${brl(i.referente)}</td><td style="${td}text-align:right">${brl(i.pendente)}</td></tr>`).join('')}
  <tr><td style="${td}font-weight:bold;background:#e2f5e9">TOTAL</td><td style="${td}text-align:right;font-weight:bold;background:#e2f5e9">${brl(totRef)}</td><td style="${td}text-align:right;font-weight:bold;background:#e2f5e9">${brl(totPen)}</td></tr>
</table>` : '';

    const notasSl = sl?.notas || [];
    const tabelaSellin = sl ? `
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px">
  <tr><td colspan="3" style="${th}">SELL-IN ${esc(mes.toUpperCase())}</td></tr>
  ${notasSl.length ? `<tr><td style="${th}">NF</td><td style="${th}">EMISSÃO</td><td style="${th}">VALOR</td></tr>
  ${notasSl.map((n) => `<tr><td style="${td}">${esc(n.numero)}</td><td style="${td}text-align:center">${esc(dataBR(n.emissao))}</td><td style="${td}text-align:right">${brl(n.valor)}</td></tr>`).join('')}` : ''}
  <tr><td colspan="2" style="${td}font-weight:bold;background:#e2f5e9">TOTAL</td><td style="${td}text-align:right;font-weight:bold;background:#e2f5e9">${brl(sl.total)}</td></tr>
  <tr><td colspan="2" style="${td}font-weight:bold">PARTICIPAÇÃO</td><td style="${td}text-align:right">${pct(sl.participacao)}</td></tr>
  <tr><td colspan="2" style="${td}font-weight:bold;background:#e2f5e9">VERBA</td><td style="${td}text-align:right;font-weight:bold;background:#e2f5e9">${brl(sl.verba)}</td></tr>
</table>` : '';

    const p = 'margin:0 0 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f1f1f;';
    const html = `<div>
<p style="${p}">Olá, ${saudacao}! Tudo bem?</p>
<p style="${p}">Segue abaixo o link do dashboard de fechamento PMG, já atualizado com os dados de ${esc(mes)}:</p>
<p style="${p}"><a href="${esc(link)}">${esc(link)}</a></p>
<p style="${p}">O link é fixo e fica sempre com a versão mais recente, então pode salvar nos favoritos.</p>
${tabela}
${tabelaSellin}
</div>`;

    const linhasTxt = itens.map((i) => `${String(i.descricao || '').toUpperCase()}: ${brl(i.referente)} (${mes}) | ${brl(i.pendente)} pendente`);
    const texto = [
      `Olá, ${saudacao}! Tudo bem?`, '',
      `Segue abaixo o link do dashboard de fechamento PMG, já atualizado com os dados de ${mes}:`,
      link, '',
      'O link é fixo e fica sempre com a versão mais recente, então pode salvar nos favoritos.',
      ...(itens.length ? ['', `DÉBITOS (referente a ${mes})`, ...linhasTxt, `TOTAL: ${brl(totRef)} | ${brl(totPen)} pendente`] : []),
      ...(sl ? ['', `SELL-IN (referente a ${mes})`, ...notasSl.map((n) => `NF ${n.numero} · ${dataBR(n.emissao)} · ${brl(n.valor)}`),
        `TOTAL: ${brl(sl.total)}`, `PARTICIPAÇÃO: ${pct(sl.participacao)}`, `VERBA: ${brl(sl.verba)}`] : []),
    ].join('\n');

    return { para: f.emails_para || [], cc, assunto, html, texto, link, temDebito: itens.length > 0, temSellin: !!sl };
  }

  async function copiar(texto, html) {
    try {
      if (html && window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texto], { type: 'text/plain' }),
        })]);
        return true;
      }
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // fallback: seleção manual (navegador sem permissão de clipboard)
      const div = document.createElement('div');
      div.contentEditable = 'true';
      div.style.cssText = 'position:fixed;left:-9999px;top:0';
      if (html) div.innerHTML = html; else div.textContent = texto;
      document.body.appendChild(div);
      const r = document.createRange(); r.selectNodeContents(div);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      const ok = document.execCommand('copy');
      sel.removeAllRanges(); div.remove();
      return ok;
    }
  }

  async function abrirEmail(f) {
    const eu = await usuarioAtual();
    const m = montarEmail(f, eu);
    const s = statusFornecedor(f);
    const alertas = [];
    if (!s.dashOk) alertas.push(`O dashboard ainda não tem ${nomeMesCompetencia()}. Suba o relatório antes de mandar.`);
    if (!m.para.length) alertas.push('Esse fornecedor não tem e-mail cadastrado.');
    if (!m.temDebito) alertas.push('Nenhum débito lançado: o e-mail vai sem a tabela de débitos.');
    if (s.sellinPendente && !F.sellinOff) alertas.push(`Sell-in de ${nomeMesCompetencia()} não lançado: o e-mail vai sem a tabela de sell-in.`);
    el('fechModalTitulo').textContent = m.assunto;
    el('fechModalCorpo').innerHTML = `
      ${alertas.map((a) => `<div class="fech-alerta"><i data-lucide="triangle-alert"></i>${esc(a)}</div>`).join('')}
      <div class="fech-campo"><span>Para</span><div class="fech-campo-val">${m.para.map(esc).join('; ') || '—'}</div><button type="button" class="icon-btn subtle" data-fech-copiar="para" title="Copiar"><i data-lucide="copy"></i></button></div>
      <div class="fech-campo"><span>Cc</span><div class="fech-campo-val">${m.cc.map(esc).join('; ')}</div><button type="button" class="icon-btn subtle" data-fech-copiar="cc" title="Copiar"><i data-lucide="copy"></i></button></div>
      <div class="fech-campo"><span>Assunto</span><div class="fech-campo-val">${esc(m.assunto)}</div><button type="button" class="icon-btn subtle" data-fech-copiar="assunto" title="Copiar"><i data-lucide="copy"></i></button></div>
      <div class="fech-preview">${m.html}</div>
      <div class="fech-modal-acoes">
        <a class="btn secondary" href="mailto:${encodeURIComponent(m.para.join(';'))}?cc=${encodeURIComponent(m.cc.join(';'))}&subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.texto)}"><i data-lucide="send"></i><span>Abrir no Outlook (texto)</span></a>
        <button type="button" class="btn secondary" data-fech-copiar="corpo"><i data-lucide="clipboard-copy"></i><span>Copiar corpo formatado</span></button>
        <button type="button" class="btn primary" data-fech-acao="marcar-enviado" data-id="${f.id}"><i data-lucide="mail-check"></i><span>${s.enviado ? 'Marcar como não enviado' : 'Marcar como enviado'}</span></button>
      </div>`;
    el('fechModal').dataset.id = f.id;
    el('fechModal')._email = m;
    abrirModal('fechModal');
  }

  async function alternarEnviado(f) {
    const atual = F.debitos.get(f.id);
    const eu = await usuarioAtual();
    const enviado = !atual?.enviado_em;
    const linha = { fornecedor_id: f.id, competencia: competenciaData(), enviado_em: enviado ? new Date().toISOString() : null, enviado_por: enviado ? eu?.id || null : null };
    if (!atual) linha.itens = [];
    const res = await db.from('fechamento_debitos').upsert(linha, { onConflict: 'fornecedor_id,competencia' }).select().single();
    if (res.error || !res.data) { aviso('Não salvou: ' + (res.error?.message || 'sem permissão'), 'error'); return false; }
    F.debitos.set(f.id, res.data);
    aviso(enviado ? `${f.nome}: marcado como enviado.` : `${f.nome}: voltou pra "a enviar".`);
    return true;
  }

  /* ───────────── editor (débitos + contatos) ───────────── */
  function linhaDebitoHtml(i = {}) {
    const v = (n) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    return `<div class="fech-deb-linha">
      <input type="text" data-deb="descricao" placeholder="Ex.: PLANO" value="${esc(i.descricao || '')}">
      <input type="text" data-deb="referente" inputmode="decimal" placeholder="Valor do mês" value="${v(i.referente)}">
      <input type="text" data-deb="pendente" inputmode="decimal" placeholder="Total pendente" value="${v(i.pendente)}">
      <button type="button" class="icon-btn subtle" data-fech-acao="remover-deb" title="Remover"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function secaoSellinHtml(f, sl) {
    const v2 = (n) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const notas = sl?.notas || [];
    const p = sl ? Number(sl.participacao) : (f.sellin_participacao != null ? Number(f.sellin_participacao) : null);
    const pTxt = p === null ? '' : (p * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
    const visivel = f.tem_sellin || sl;
    return `<section class="fech-sec ${visivel ? '' : 'hidden'}" id="fechSecSellin">
        <h4>Sell-in de ${esc(nomeMesCompetencia())}</h4>
        <p class="fech-ajuda">NFs que o fornecedor emitiu pra PMG no mês. A verba é TOTAL × PARTICIPAÇÃO e vai na tabela SELL-IN do e-mail. Dá pra subir a planilha "Sell In" no upload ou digitar aqui.</p>
        <div class="fech-sellin-grid">
          <label class="fech-input"><span>Total das NFs (R$)${notas.length ? ` · ${notas.length} NF(s) da planilha` : ''}</span><input id="fechSlTotal" type="text" inputmode="decimal" value="${v2(sl?.total)}" placeholder="Ex.: 290.272,00" ${notas.length ? 'readonly title="Vem da planilha. Pra mudar, suba a planilha de novo ou remova o sell-in."' : ''}></label>
          <label class="fech-input"><span>Participação (%)</span><input id="fechSlPct" type="text" inputmode="decimal" value="${esc(pTxt)}" placeholder="Ex.: 1,5"></label>
          <label class="fech-input"><span>Verba (R$)</span><input id="fechSlVerba" type="text" value="${v2(sl?.verba)}" readonly></label>
        </div>
        ${notas.length ? `<details class="fech-sellin-notas"><summary>Ver as ${notas.length} NF(s)${sl.arquivo_nome ? ' · ' + esc(sl.arquivo_nome) : ''}</summary>
          <table><thead><tr><th>NF</th><th>Emissão</th><th>Valor</th></tr></thead><tbody>
          ${notas.map((n) => `<tr><td>${esc(n.numero)}</td><td>${esc(dataBR(n.emissao))}</td><td>${brl(n.valor)}</td></tr>`).join('')}
          </tbody></table></details>` : ''}
        ${sl ? '<button type="button" class="btn secondary" data-fech-acao="remover-sellin"><i data-lucide="trash-2"></i><span>Remover sell-in do mês</span></button>' : ''}
      </section>`;
  }

  function atualizarVerbaEditor() {
    const t = el('fechSlTotal'), p = el('fechSlPct'), v = el('fechSlVerba');
    if (!t || !p || !v) return;
    const total = parseNumero(t.value), pc = parsePct(p.value);
    v.value = !Number.isNaN(total) && pc !== null && !Number.isNaN(pc) && pc <= 1
      ? r2(total * pc).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  }

  function abrirEditor(f) {
    const novo = !f;
    f = f || { nome: '', emails_para: [], emails_cc: [], nomes_crm: [], arquivo_template: '', ativo: true, observacoes: '', tem_sellin: false };
    const deb = novo ? null : F.debitos.get(f.id);
    const sl = novo ? null : F.sellin.get(f.id);
    el('fechEditorTitulo').textContent = novo ? 'Novo fornecedor' : f.nome;
    el('fechEditorCorpo').innerHTML = `
      ${novo ? '' : `<section class="fech-sec">
        <h4>Débitos de ${esc(nomeMesCompetencia())}</h4>
        <p class="fech-ajuda">Vai na tabela DÉBITOS do e-mail. Deixe vazio se não tem débito nesse mês.</p>
        <div class="fech-deb-head"><span>Descrição</span><span>Valor do mês</span><span>Total pendente</span><span></span></div>
        <div id="fechDebLinhas">${(deb?.itens?.length ? deb.itens : [{}]).map(linhaDebitoHtml).join('')}</div>
        <button type="button" class="btn secondary" data-fech-acao="add-deb"><i data-lucide="plus"></i><span>Adicionar linha</span></button>
      </section>`}
      ${novo || F.sellinOff ? '' : secaoSellinHtml(f, sl)}
      <section class="fech-sec">
        <h4>Contatos</h4>
        <label class="fech-input"><span>Nome</span><input id="fechEdNome" type="text" value="${esc(f.nome)}" ${novo ? '' : 'readonly'}></label>
        <label class="fech-input"><span>Para (um por linha)</span><textarea id="fechEdPara" rows="4">${esc((f.emails_para || []).join('\n'))}</textarea></label>
        <label class="fech-input"><span>Cópia extra, além da equipe (opcional)</span><textarea id="fechEdCc" rows="2">${esc((f.emails_cc || []).join('\n'))}</textarea></label>
      </section>
      <section class="fech-sec">
        <h4>Reconhecimento automático</h4>
        <label class="fech-input"><span>Nomes e códigos do CRM (um por linha)</span><textarea id="fechEdCrm" rows="2" placeholder="LATICÍNIOS TIROLEZ LTDA.&#10;5339">${esc((f.nomes_crm || []).join('\n'))}</textarea></label>
        <label class="fech-input"><span>Planilha antiga (carga do histórico)</span><input id="fechEdTpl" type="text" value="${esc(f.arquivo_template || '')}" placeholder="Ex.: Tirolez.xlsx"></label>
        <label class="fech-input"><span>Observação interna</span><input id="fechEdObs" type="text" value="${esc(f.observacoes || '')}"></label>
        <label class="fech-check"><input id="fechEdAtivo" type="checkbox" ${f.ativo ? 'checked' : ''}><span>Fornecedor ativo no fechamento</span></label>
        ${F.sellinOff ? '' : `<label class="fech-check"><input id="fechEdSellin" type="checkbox" ${f.tem_sellin ? 'checked' : ''}><span>Tem acordo de sell-in (cobra verba sobre as NFs do mês)</span></label>`}
      </section>
      ${novo ? '' : `<section class="fech-sec">
        <h4>Link do dashboard</h4>
        <div class="fech-campo"><span>Link</span><div class="fech-campo-val">${esc(linkDashboard(f))}</div><button type="button" class="icon-btn subtle" data-fech-acao="link-ed" title="Copiar"><i data-lucide="copy"></i></button></div>
        <p class="fech-ajuda">Gerar um link novo derruba o antigo na hora. Use se o link vazou pra quem não devia.</p>
        <button type="button" class="btn secondary" data-fech-acao="novo-link"><i data-lucide="refresh-cw"></i><span>Gerar link novo</span></button>
      </section>`}`;
    el('fechEditor').dataset.id = novo ? '' : f.id;
    abrirModal('fechEditor');
    icones();
  }

  function lerDebitosDoEditor() {
    const itens = [];
    for (const linha of el('fechEditorCorpo').querySelectorAll('.fech-deb-linha')) {
      const g = (k) => linha.querySelector(`[data-deb="${k}"]`).value;
      const descricao = g('descricao').trim();
      const referente = parseNumero(g('referente'));
      const pendente = parseNumero(g('pendente'));
      if (!descricao && !referente && !pendente) continue;
      if (!descricao) throw new Error('Toda linha de débito precisa de descrição (ex.: PLANO).');
      if (Number.isNaN(referente) || Number.isNaN(pendente)) throw new Error(`Valor inválido na linha "${descricao}". Use o formato 39.131,09.`);
      itens.push({ descricao, referente, pendente });
    }
    return itens;
  }

  function lerSellinDoEditor(id) {
    const sec = el('fechSecSellin');
    if (!sec || sec.classList.contains('hidden')) return { acao: 'nada' };
    const atual = F.sellin.get(id) || null;
    const totalTxt = el('fechSlTotal').value.trim();
    const pctTxt = el('fechSlPct').value.trim();
    if (!totalTxt && !pctTxt) return { acao: 'nada' };
    if (!totalTxt && !atual?.notas?.length) {
      // só o % (sem total): guarda como padrão do fornecedor, sem lançar sell-in
      const so = parsePct(pctTxt);
      if (so === null || Number.isNaN(so) || so > 1 || so < 0) throw new Error('% de participação inválido (ex.: 1,5).');
      return { acao: 'nada', participacao: so };
    }
    const total = atual?.notas?.length ? Number(atual.total) : parseNumero(totalTxt);
    const p = parsePct(pctTxt);
    if (Number.isNaN(total) || total < 0) throw new Error('Total do sell-in inválido. Use o formato 290.272,00.');
    if (p === null || Number.isNaN(p) || p > 1 || p < 0) throw new Error('Informe o % de participação do sell-in (ex.: 1,5).');
    const verba = r2(total * p);
    if (atual && Number(atual.total) === r2(total) && Number(atual.participacao) === p) return { acao: 'nada', participacao: p };
    return { acao: 'salvar', linha: { fornecedor_id: id, competencia: competenciaData(), total: r2(total), participacao: p, verba, ...(atual ? {} : { notas: [], arquivo_nome: null }) }, participacao: p };
  }

  async function removerSellin(f) {
    if (!confirm(`Remover o sell-in de ${nomeMesCompetencia()} de ${f.nome}?`)) return;
    const res = await db.from('fechamento_sellin').delete().eq('fornecedor_id', f.id).eq('competencia', competenciaData()).select();
    if (res.error || !res.data?.length) { aviso('Não removeu: ' + (res.error?.message || 'sem permissão'), 'error'); return; }
    F.sellin.delete(f.id);
    aviso('Sell-in removido.');
    abrirEditor(f);
    render();
  }

  async function salvarEditor() {
    const id = Number(el('fechEditor').dataset.id) || null;
    const btn = el('fechEditorSalvar');
    btn.disabled = true;
    try {
      const para = listaEmails(el('fechEdPara').value);
      const cc = listaEmails(el('fechEdCc').value);
      const invalidos = [...para, ...cc].filter((e) => !emailValido(e));
      if (invalidos.length) throw new Error('E-mail inválido: ' + invalidos.join(', '));
      const dados = {
        emails_para: para,
        emails_cc: cc,
        nomes_crm: [...new Set(el('fechEdCrm').value.split('\n').map((s) => s.trim()).filter(Boolean))],
        arquivo_template: el('fechEdTpl').value.trim() || null,
        observacoes: el('fechEdObs').value.trim() || null,
        ativo: el('fechEdAtivo').checked,
      };
      if (el('fechEdSellin')) dados.tem_sellin = el('fechEdSellin').checked;
      if (!id) {
        const nome = el('fechEdNome').value.trim();
        if (!nome) throw new Error('Informe o nome do fornecedor.');
        const res = await db.from('fechamento_fornecedores').insert({ ...dados, nome, slug_publico: C().gerarSlug(nome) }).select().single();
        if (res.error || !res.data) throw new Error(res.error?.code === '23505' ? 'Já existe fornecedor com esse nome.' : (res.error?.message || 'sem permissão'));
        F.fornecedores.push(res.data);
        F.fornecedores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      } else {
        const itens = lerDebitosDoEditor();
        const sellin = lerSellinDoEditor(id);
        if (sellin.participacao !== undefined) dados.sellin_participacao = sellin.participacao;
        if (sellin.acao === 'salvar') dados.tem_sellin = true;
        const res = await db.from('fechamento_fornecedores').update(dados).eq('id', id).select().single();
        if (res.error || !res.data) throw new Error(res.error?.message || 'sem permissão');
        Object.assign(F.fornecedores.find((f) => f.id === id), res.data);
        const atual = F.debitos.get(id);
        const mudou = JSON.stringify(atual?.itens || []) !== JSON.stringify(itens);
        if (mudou) {
          const d = await db.from('fechamento_debitos').upsert({ fornecedor_id: id, competencia: competenciaData(), itens }, { onConflict: 'fornecedor_id,competencia' }).select().single();
          if (d.error || !d.data) throw new Error('Contatos salvos, mas os débitos não: ' + (d.error?.message || 'sem permissão'));
          F.debitos.set(id, d.data);
        }
        if (sellin.acao === 'salvar') {
          const sl = await db.from('fechamento_sellin').upsert(sellin.linha, { onConflict: 'fornecedor_id,competencia' }).select().single();
          if (sl.error || !sl.data) throw new Error('Contatos e débitos salvos, mas o sell-in não: ' + (sl.error?.message || 'sem permissão'));
          F.sellin.set(id, sl.data);
        }
      }
      fecharModal('fechEditor');
      aviso('Fechamento salvo.');
      render();
    } catch (e) {
      aviso(e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function gerarLinkNovo(f) {
    if (!confirm(`O link atual de ${f.nome} vai parar de funcionar. Gerar link novo?`)) return;
    const novo = C().gerarSlug(f.nome);
    if (f.dashboard_mes_final) {
      const mv = await db.storage.from(BUCKET).move(caminhoJson(f.slug_publico), caminhoJson(novo));
      if (mv.error) { aviso('Não deu pra mover o dashboard: ' + mv.error.message, 'error'); return; }
    }
    const res = await db.from('fechamento_fornecedores').update({ slug_publico: novo }).eq('id', f.id).select().single();
    if (res.error || !res.data) {
      // desfaz o move pra não deixar o cadastro apontando pro arquivo errado
      if (f.dashboard_mes_final) await db.storage.from(BUCKET).move(caminhoJson(novo), caminhoJson(f.slug_publico));
      aviso('Não salvou o link novo: ' + (res.error?.message || 'sem permissão'), 'error');
      return;
    }
    Object.assign(f, res.data);
    aviso('Link novo gerado. Mande o novo pro fornecedor.');
    abrirEditor(f);
    renderLista();
  }

  /* ───────────── modal genérico ───────────── */
  function abrirModal(id) { el(id).classList.remove('hidden'); document.body.classList.add('fech-modal-aberto'); icones(); }
  function fecharModal(id) { el(id).classList.add('hidden'); if (!document.querySelector('.fech-modal:not(.hidden)')) document.body.classList.remove('fech-modal-aberto'); }

  /* ───────────── eventos ───────────── */
  function ligarEventos() {
    el('fechUploadBtn').addEventListener('click', () => el('fechFileInput').click());
    el('fechFileInput').addEventListener('change', (e) => { adicionarArquivos(e.target.files); e.target.value = ''; });
    el('fechNovoFornBtn').addEventListener('click', () => abrirEditor(null));
    el('fechCompetencia').addEventListener('change', (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { F.competencia = e.target.value; carregar(); } });
    el('fechBusca').addEventListener('input', (e) => { F.busca = e.target.value; renderLista(); });
    el('fechFiltro').addEventListener('change', (e) => { F.filtro = e.target.value; renderLista(); });

    const drop = el('fechDrop');
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('ativo'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('ativo'); }));
    drop.addEventListener('drop', (e) => adicionarArquivos(e.dataTransfer.files));
    drop.addEventListener('click', () => el('fechFileInput').click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el('fechFileInput').click(); } });

    el('viewFechamento').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fech-acao]');
      if (!b) return;
      const acao = b.dataset.fechAcao;
      const row = b.closest('.fech-row');
      const f = row ? F.fornecedores.find((x) => x.id === Number(row.dataset.id)) : null;
      if (acao === 'abrir' && f) window.open(linkDashboard(f), '_blank', 'noopener');
      if (acao === 'link' && f) { if (await copiar(linkDashboard(f))) aviso('Link copiado.'); }
      if (acao === 'editar' && f) abrirEditor(f);
      if (acao === 'email' && f) abrirEmail(f);
      if (acao === 'limpar-fila') { F.fila = F.fila.filter((i) => !['ok'].includes(i.status)); renderFila(); }
      if (acao === 'descartar') { F.fila = F.fila.filter((i) => i.id !== b.dataset.item); renderFila(); }
      if (acao === 'publicar') {
        const item = F.fila.find((i) => i.id === b.dataset.item);
        if (item && item.fornecedorId) {
          if (item.forcarPendente) item.forcar = true;
          item.status = 'publicar'; processarFila();
        }
      }
      if (acao === 'publicar-todos') {
        const prontos = F.fila.filter((i) => i.status === 'confirmar' && i.fornecedorId && !i.forcarPendente && (i.tipo !== 'sellin' || i.participacao != null));
        if (!prontos.length) return;
        if (!confirm(`Publicar ${prontos.length} arquivo(s) conferido(s)? Cada mês dos arquivos substitui o mesmo mês no dashboard.`)) return;
        prontos.forEach((i) => { i.status = 'publicar'; });
        processarFila();
      }
    });
    el('viewFechamento').addEventListener('change', (e) => {
      const comp = e.target.closest('[data-fech-comp]');
      if (comp) {
        const item = F.fila.find((i) => i.id === comp.dataset.fechComp);
        if (item && /^\d{4}-\d{2}$/.test(comp.value)) { item.competencia = comp.value; item.forcar = false; item.forcarPendente = false; renderFila(); }
        return;
      }
      const pc = e.target.closest('[data-fech-pct]');
      if (pc) {
        const item = F.fila.find((i) => i.id === pc.dataset.fechPct);
        if (item) {
          const v = parsePct(pc.value);
          item.participacao = v === null || Number.isNaN(v) || v > 1 ? null : v;
          if (pc.value.trim() && item.participacao === null) aviso('% inválido. Use o formato 1,5 (pra 1,5%).', 'error');
          renderFila();
        }
        return;
      }
      const s = e.target.closest('[data-fech-forn]');
      if (!s) return;
      const item = F.fila.find((i) => i.id === s.dataset.fechForn);
      if (item) {
        item.fornecedorId = Number(s.value) || null; item.forcar = false; item.forcarPendente = false;
        if (item.tipo === 'sellin' && item.lido && item.lido.participacao === null) {
          const f = F.fornecedores.find((x) => x.id === item.fornecedorId);
          item.participacao = f?.sellin_participacao != null ? Number(f.sellin_participacao) : null;
        }
        renderFila();
      }
    });

    // modais
    document.querySelectorAll('[data-fech-fechar]').forEach((b) => b.addEventListener('click', () => fecharModal(b.dataset.fechFechar)));
    document.querySelectorAll('.fech-modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) fecharModal(m.id); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.fech-modal:not(.hidden)').forEach((m) => fecharModal(m.id)); });

    el('fechModal').addEventListener('click', async (e) => {
      const m = el('fechModal')._email;
      const c = e.target.closest('[data-fech-copiar]');
      if (c && m) {
        const tipo = c.dataset.fechCopiar;
        const ok = tipo === 'corpo' ? await copiar(m.texto, m.html)
          : await copiar(tipo === 'para' ? m.para.join('; ') : tipo === 'cc' ? m.cc.join('; ') : m.assunto);
        aviso(ok ? 'Copiado.' : 'O navegador não deixou copiar. Selecione e copie na mão.', ok ? 'success' : 'error');
      }
      const b = e.target.closest('[data-fech-acao="marcar-enviado"]');
      if (b) {
        const f = F.fornecedores.find((x) => x.id === Number(b.dataset.id));
        b.disabled = true;
        if (f && await alternarEnviado(f)) { fecharModal('fechModal'); render(); }
        b.disabled = false;
      }
    });

    el('fechEditor').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fech-acao]');
      if (!b) return;
      const id = Number(el('fechEditor').dataset.id);
      const f = F.fornecedores.find((x) => x.id === id);
      if (b.dataset.fechAcao === 'add-deb') { el('fechDebLinhas').insertAdjacentHTML('beforeend', linhaDebitoHtml()); icones(); }
      if (b.dataset.fechAcao === 'remover-deb') b.closest('.fech-deb-linha').remove();
      if (b.dataset.fechAcao === 'link-ed' && f) { if (await copiar(linkDashboard(f))) aviso('Link copiado.'); }
      if (b.dataset.fechAcao === 'novo-link' && f) gerarLinkNovo(f);
      if (b.dataset.fechAcao === 'remover-sellin' && f) removerSellin(f);
    });
    el('fechEditor').addEventListener('input', (e) => { if (e.target.id === 'fechSlTotal' || e.target.id === 'fechSlPct') atualizarVerbaEditor(); });
    el('fechEditor').addEventListener('change', (e) => {
      if (e.target.id === 'fechEdSellin' && el('fechSecSellin')) el('fechSecSellin').classList.toggle('hidden', !e.target.checked && !F.sellin.get(Number(el('fechEditor').dataset.id)));
    });
    el('fechEditorSalvar').addEventListener('click', salvarEditor);
  }

  /* ───────────── integração com o Demandas ───────────── */
  function instalar() {
    if (!el('viewFechamento') || typeof switchView !== 'function') return;
    try { VIEW_META.fechamento = ['Fornecedores parceiros', 'Fechamento']; } catch { /* VIEW_META indisponível: título fica o padrão */ }
    const anterior = switchView;
    // eslint-disable-next-line no-global-assign
    switchView = function (view) {
      const r = anterior.apply(this, arguments);
      if (view === 'fechamento') { if (!F.pronto) carregar(); else render(); }
      return r;
    };
    ligarEventos();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
})();
