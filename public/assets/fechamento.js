/*
 * fechamento.js — aba "Fechamento" dentro de Demandas.
 *
 * Fluxo do mês:
 *   1. Sobe os relatórios do CRM (vários de uma vez). O navegador lê, identifica o
 *      fornecedor, resume e publica storage/fornecedor-dashboards/<slug>.json.
 *   2. Lança os débitos da competência (digitados à mão).
 *   3. Copia o e-mail pronto (Para, CC, assunto e corpo) e marca como enviado.
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
      const [forn, deb] = await Promise.all([
        db.from('fechamento_fornecedores').select('*').order('nome'),
        db.from('fechamento_debitos').select('*').eq('competencia', competenciaData()),
      ]);
      if (forn.error) throw forn.error;
      if (deb.error) throw deb.error;
      F.fornecedores = forn.data || [];
      F.debitos = new Map((deb.data || []).map((d) => [d.fornecedor_id, d]));
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
    return {
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
    const card = (rot, val, sub, cls = '') => `<div class="fech-kpi ${cls}"><span>${rot}</span><strong>${val}</strong><small>${sub}</small></div>`;
    el('fechResumo').innerHTML =
      card('Dashboards atualizados', `${dash}/${ativos.length}`, `com ${nomeMesCompetencia()}`, dash === ativos.length && ativos.length ? 'ok' : '') +
      card('Débitos lançados', `${deb}/${ativos.length}`, brl(total) + ' pendente') +
      card('E-mails enviados', `${env}/${ativos.length}`, `fechamento de ${nomeMesCompetencia()}`, env === ativos.length && ativos.length ? 'ok' : '');
  }

  function renderLista(carregando = false) {
    const box = el('fechLista');
    if (!box) return;
    if (carregando && !F.pronto) { box.innerHTML = '<div class="empty-state">Carregando fornecedores…</div>'; return; }
    const busca = C() ? C().chave(F.busca) : F.busca.toLowerCase();
    let lista = F.fornecedores.filter((f) => (F.filtro === 'inativos' ? !f.ativo : f.ativo));
    if (busca) lista = lista.filter((f) => C().chave(f.nome).includes(busca) || (f.emails_para || []).some((e) => e.includes(F.busca.toLowerCase())));
    if (F.filtro === 'pendentes') lista = lista.filter((f) => { const s = statusFornecedor(f); return !s.dashOk || !s.enviado; });
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
        <div class="fech-row-chips">${chipDash}${chipDeb}${chipEnv}</div>
        <div class="fech-row-actions">
          <button type="button" class="icon-btn subtle" data-fech-acao="abrir" title="Abrir dashboard" ${s.temDash ? '' : 'disabled'}><i data-lucide="external-link"></i></button>
          <button type="button" class="icon-btn subtle" data-fech-acao="link" title="Copiar link do dashboard"><i data-lucide="link"></i></button>
          <button type="button" class="btn secondary" data-fech-acao="editar"><i data-lucide="pencil"></i><span>Débitos e contatos</span></button>
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
    for (const file of xs) F.fila.push({ id: crypto.randomUUID(), file, status: 'lendo', msg: 'Lendo arquivo…' });
    renderFila();
    processarFila();
  }

  async function processarFila() {
    if (F.processando) return;
    F.processando = true;
    try {
      // 1) lê tudo que está pendente de leitura
      for (const item of F.fila.filter((i) => i.status === 'lendo')) {
        try {
          await lerItem(item);
        } catch (e) {
          item.status = 'erro'; item.msg = e.message || String(e);
        }
        renderFila();
      }
      // 2) publica, um por vez (dois arquivos do mesmo fornecedor não podem se atropelar)
      for (const item of F.fila.filter((i) => i.status === 'publicar')) {
        await publicarItem(item);
        renderFila();
      }
    } finally {
      F.processando = false;
      renderResumo(); renderLista();
    }
  }

  async function lerItem(item) {
    const buf = await item.file.arrayBuffer();
    // template antigo tem pivot/Power Pivot pesados: lê só a aba Base
    const nomes = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
    const opts = { type: 'array', cellDates: true, dense: true };
    if (nomes.some((n) => C().chave(n) === 'base')) opts.sheets = nomes.filter((n) => C().chave(n) === 'base');
    await new Promise((r) => setTimeout(r, 20)); // deixa a tela pintar "Lendo…"
    const wb = XLSX.read(buf, opts);
    const lido = C().lerWorkbook(wb, XLSX, item.file.name);
    const id = C().identificarFornecedor(lido, F.fornecedores);
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

  async function lerPublicado(slug) {
    const { data, error } = await db.storage.from(BUCKET).download(caminhoJson(slug));
    if (error) {
      const msg = String(error.message || error);
      if (/not.?found|404|does not exist/i.test(msg) || error.statusCode === '404' || error.status === 400 || error.status === 404) return null;
      throw new Error('Não deu pra ler o dashboard publicado: ' + msg);
    }
    try { return JSON.parse(await data.text()); } catch { throw new Error('O dashboard publicado está corrompido. Fale com quem cuida do Connect antes de publicar por cima.'); }
  }

  async function publicarItem(item) {
    const f = F.fornecedores.find((x) => x.id === item.fornecedorId);
    if (!f) { item.status = 'confirmar'; item.msg = 'Escolha o fornecedor'; return; }
    item.status = 'publicando'; item.msg = 'Publicando…'; renderFila();
    try {
      const lido = item.lido;
      const [publicado, geoBR] = await Promise.all([lerPublicado(f.slug_publico), carregarGeo()]);
      const meses = C().mesclar(C().decodificar(publicado), C().resumir(lido.rows, lido.formato));
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
        linhas: lido.rows.length, total_venda: lido.totalVenda, total_relatorio: lido.totalRelatorio ?? null,
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
    box.innerHTML = `<div class="fech-fila-head"><strong>Relatórios</strong><button type="button" class="btn secondary" data-fech-acao="limpar-fila"><i data-lucide="eraser"></i><span>Limpar concluídos</span></button></div>` +
      F.fila.map((i) => {
        const L = i.lido;
        const detalhes = L ? `${L.rows.length.toLocaleString('pt-BR')} linhas · ${L.dataMin.toLocaleDateString('pt-BR')} a ${L.dataMax.toLocaleDateString('pt-BR')} · ${brl(L.totalVenda)}${L.totalConfere ? ' · confere com o Total do relatório ✓' : ''}` : '';
        const select = i.status === 'confirmar'
          ? `<select data-fech-forn="${i.id}"><option value="">Qual fornecedor?</option>${ativos.map((f) => `<option value="${f.id}" ${f.id === i.fornecedorId ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>
             <button type="button" class="btn primary" data-fech-acao="publicar" data-item="${i.id}" ${i.fornecedorId ? '' : 'disabled'}><i data-lucide="upload-cloud"></i><span>Publicar</span></button>`
          : '';
        return `<div class="fech-item ${i.status}">
          <i data-lucide="${icone[i.status]}" class="${['lendo', 'publicar', 'publicando'].includes(i.status) ? 'spin' : ''}"></i>
          <div class="fech-item-txt">
            <strong>${esc(i.file.name)}</strong>
            <small>${esc(i.msg)}${i.motivo && i.status === 'confirmar' ? ' · ' + esc(i.motivo) : ''}</small>
            ${detalhes ? `<small class="fech-item-det">${esc(detalhes)}</small>` : ''}
            ${(i.avisos || []).map((a) => `<small class="fech-item-aviso">${esc(a)}</small>`).join('')}
          </div>
          <div class="fech-item-acao">${select}</div>
        </div>`;
      }).join('');
    icones();
  }

  /* ───────────── e-mail ───────────── */
  function montarEmail(f, eu) {
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

    const p = 'margin:0 0 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f1f1f;';
    const html = `<div>
<p style="${p}">Olá, ${saudacao}! Tudo bem?</p>
<p style="${p}">Segue abaixo o link do dashboard de fechamento PMG, já atualizado com os dados de ${esc(mes)}:</p>
<p style="${p}"><a href="${esc(link)}">${esc(link)}</a></p>
<p style="${p}">O link é fixo e fica sempre com a versão mais recente, então pode salvar nos favoritos.</p>
${tabela}
</div>`;

    const linhasTxt = itens.map((i) => `${String(i.descricao || '').toUpperCase()}: ${brl(i.referente)} (${mes}) | ${brl(i.pendente)} pendente`);
    const texto = [
      `Olá, ${saudacao}! Tudo bem?`, '',
      `Segue abaixo o link do dashboard de fechamento PMG, já atualizado com os dados de ${mes}:`,
      link, '',
      'O link é fixo e fica sempre com a versão mais recente, então pode salvar nos favoritos.',
      ...(itens.length ? ['', `DÉBITOS (referente a ${mes})`, ...linhasTxt, `TOTAL: ${brl(totRef)} | ${brl(totPen)} pendente`] : []),
    ].join('\n');

    return { para: f.emails_para || [], cc, assunto, html, texto, link, temDebito: itens.length > 0 };
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

  function abrirEditor(f) {
    const novo = !f;
    f = f || { nome: '', emails_para: [], emails_cc: [], nomes_crm: [], arquivo_template: '', ativo: true, observacoes: '' };
    const deb = novo ? null : F.debitos.get(f.id);
    el('fechEditorTitulo').textContent = novo ? 'Novo fornecedor' : f.nome;
    el('fechEditorCorpo').innerHTML = `
      ${novo ? '' : `<section class="fech-sec">
        <h4>Débitos de ${esc(nomeMesCompetencia())}</h4>
        <p class="fech-ajuda">Vai na tabela DÉBITOS do e-mail. Deixe vazio se não tem débito nesse mês.</p>
        <div class="fech-deb-head"><span>Descrição</span><span>Valor do mês</span><span>Total pendente</span><span></span></div>
        <div id="fechDebLinhas">${(deb?.itens?.length ? deb.itens : [{}]).map(linhaDebitoHtml).join('')}</div>
        <button type="button" class="btn secondary" data-fech-acao="add-deb"><i data-lucide="plus"></i><span>Adicionar linha</span></button>
      </section>`}
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
      if (!id) {
        const nome = el('fechEdNome').value.trim();
        if (!nome) throw new Error('Informe o nome do fornecedor.');
        const res = await db.from('fechamento_fornecedores').insert({ ...dados, nome, slug_publico: C().gerarSlug(nome) }).select().single();
        if (res.error || !res.data) throw new Error(res.error?.code === '23505' ? 'Já existe fornecedor com esse nome.' : (res.error?.message || 'sem permissão'));
        F.fornecedores.push(res.data);
        F.fornecedores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      } else {
        const itens = lerDebitosDoEditor();
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
      if (acao === 'publicar') {
        const item = F.fila.find((i) => i.id === b.dataset.item);
        if (item && item.fornecedorId) { item.status = 'publicar'; processarFila(); }
      }
    });
    el('viewFechamento').addEventListener('change', (e) => {
      const s = e.target.closest('[data-fech-forn]');
      if (!s) return;
      const item = F.fila.find((i) => i.id === s.dataset.fechForn);
      if (item) { item.fornecedorId = Number(s.value) || null; renderFila(); }
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
