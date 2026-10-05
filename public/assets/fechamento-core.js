/*
 * fechamento-core.js — leitura dos exports do CRM e resumo do dashboard do fornecedor.
 *
 * Sem DOM e sem Supabase: roda no navegador (window.FechamentoCore) e no Node
 * (module.exports), pra dar pra testar a conta fora da tela.
 *
 * Formatos aceitos (detectados pelo cabeçalho, nunca pelo nome do arquivo):
 *   consulta  → "Vendas por Produto" (aba Consulta): ID Pedido de Venda, ID Cliente,
 *               Bairro, Cidade, Segmento, Data, Sub-grupo, Produto, Qtde PC, Qtde Kg, Valor
 *   relvvp    → "Pedidos de Vendas por Vendedor e Produto": bloco de filtros no topo
 *               (Fornecedor:, Período:) + linha "Total:" no fim
 *   template  → planilha antiga do fechamento (aba Base / Tabela1), usada pra carga do histórico
 *
 * Regra de substituição: cada mês presente no arquivo SUBSTITUI aquele mês inteiro no
 * dashboard. Meses que não estão no arquivo ficam intactos.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FechamentoCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSAO_DASHBOARD = 1;

  /* ───────────── utilitários ───────────── */
  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const chave = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

  function numero(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Excel serial (1900) → Date local
  function deSerial(n) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }

  function data(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') return v > 20000 && v < 80000 ? deSerial(v) : null;
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  const mesDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  // "2899 - REQUEIJÃO TIROLEZ ... (CX 12 BIS)" e "REQUEIJÃO TIROLEZ ... (CX" viram o mesmo nome:
  // tira o código, corta em 50 caracteres (o relatório "Consulta" já vem cortado assim)
  // e remove parêntese que ficou aberto no corte.
  function nomeProduto(v) {
    let s = String(v ?? '').trim().replace(/^\d+\s*-\s*/, '');
    s = s.slice(0, 50).replace(/\s*\([^)]*$/, '').trim();
    return s || '—';
  }

  // "169274 - PETISCARIA NARA" → "169274"
  function idCliente(v) {
    if (typeof v === 'number') return String(Math.trunc(v));
    const s = String(v ?? '').trim();
    const m = s.match(/^(\d+)/);
    return m ? m[1] : (s || '—');
  }

  const texto = (v) => String(v ?? '').trim();

  /* ───────────── leitura de planilha (SheetJS) ───────────── */
  function matriz(ws, XLSX) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  function acharLinhaCabecalho(linhas, obrigatorias, limite = 40) {
    for (let i = 0; i < Math.min(linhas.length, limite); i++) {
      const cols = (linhas[i] || []).map((c) => norm(c));
      if (obrigatorias.every((o) => cols.includes(norm(o)))) return i;
    }
    return -1;
  }

  function indicePor(cabecalho) {
    const idx = {};
    cabecalho.forEach((c, i) => { const k = norm(c); if (k && !(k in idx)) idx[k] = i; });
    return (nome) => idx[norm(nome)];
  }

  function lerConsulta(linhas, h) {
    const col = indicePor(linhas[h]);
    const c = {
      pedido: col('ID Pedido de Venda'), cliente: col('ID Cliente'), bairro: col('Bairro'), cidade: col('Cidade'),
      segmento: col('Segmento'), data: col('Data'), subgrupo: col('Sub-grupo'), grupo: col('Grupo'),
      produto: col('Produto'), qtde: col('Qtde PC'), kg: col('Qtde Kg'), valor: col('Valor'),
    };
    const rows = [];
    const avisos = [];
    let semData = 0;
    for (let i = h + 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l || l[c.pedido] === null || l[c.pedido] === '') continue;
      const d = data(l[c.data]);
      if (!d) { semData++; continue; }
      rows.push({
        pedido: texto(l[c.pedido]), cliente: idCliente(l[c.cliente]), segmento: texto(l[c.segmento]) || 'Não informado',
        data: d, produto: nomeProduto(l[c.produto]),
        subgrupo: c.subgrupo !== undefined ? (texto(l[c.subgrupo]) || null) : null,
        grupo: c.grupo !== undefined ? (texto(l[c.grupo]) || null) : null,
        bairro: c.bairro !== undefined ? (texto(l[c.bairro]) || null) : null,
        cidade: c.cidade !== undefined ? (texto(l[c.cidade]) || null) : null,
        qtde: numero(l[c.qtde]), kg: numero(l[c.kg]), valor: numero(l[c.valor]),
      });
    }
    if (semData) avisos.push(`${semData} linha(s) sem data válida foram ignoradas.`);
    return { formato: 'consulta', rows, avisos, fornecedorCrm: null, totalRelatorio: null };
  }

  function lerRelvvp(linhas, h) {
    // filtros do topo: "Fornecedor:" e "Período:" ficam na mesma linha, com o valor na próxima célula preenchida
    const valorDepois = (rotulo) => {
      for (let i = 0; i < h; i++) {
        const l = linhas[i] || [];
        for (let j = 0; j < l.length; j++) {
          if (norm(l[j]) === norm(rotulo)) {
            for (let k = j + 1; k < l.length; k++) if (texto(l[k])) return texto(l[k]);
          }
        }
      }
      return null;
    };
    const fornecedorCrm = valorDepois('Fornecedor:');
    const periodo = valorDepois('Período:');
    const col = indicePor(linhas[h]);
    const c = {
      pedido: col('Pedido de Venda'), cliente: col('ID - Nome do Cliente'), segmento: col('Segmento'),
      data: col('Data de Emissão do Pedido'), produto: col('ID - Descricao Produto'), qtde: col('Qtde'),
      valor: col('Total de Venda R$'), kg: col('Peso Kg'),
    };
    const rows = [];
    let totalRelatorio = null;
    for (let i = h + 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l) continue;
      if (l.some((v) => norm(v) === 'total:')) { totalRelatorio = numero(l[c.valor]); continue; }
      if (l[c.pedido] === null || l[c.pedido] === '') continue;
      const d = data(l[c.data]);
      if (!d) continue;
      rows.push({
        pedido: texto(l[c.pedido]), cliente: idCliente(l[c.cliente]), segmento: texto(l[c.segmento]) || 'Não informado',
        data: d, produto: nomeProduto(l[c.produto]), subgrupo: null, grupo: null, bairro: null, cidade: null,
        qtde: numero(l[c.qtde]), kg: numero(l[c.kg]), valor: numero(l[c.valor]),
      });
    }
    const avisos = [];
    let periodoIni = null, periodoFim = null;
    const m = periodo && periodo.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/);
    if (m) { periodoIni = data(m[1]); periodoFim = data(m[2]); }
    if (periodoIni && periodoIni.getDate() !== 1) avisos.push('O período do relatório não começa no dia 1. O mês inicial vai ser substituído só com os dias que vieram no arquivo.');
    return { formato: 'relvvp', rows, avisos, fornecedorCrm, totalRelatorio, periodoIni, periodoFim };
  }

  function lerTemplate(linhas, h) {
    const col = indicePor(linhas[h]);
    const c = {
      pedido: col('Pedido de Venda'), cliente: col('ID - Nome do Cliente'), segmento: col('Segmento'),
      data: col('Data de Emissão do Pedido'), produto: col('ID - Descricao Produto'), qtde: col('Qtde'),
      valor: col('Venda R$'), kg: col('Venda Kg'),
    };
    const rows = [];
    for (let i = h + 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l || l[c.pedido] === null || l[c.pedido] === '') continue;
      const d = data(l[c.data]);
      if (!d) continue;
      rows.push({
        pedido: texto(l[c.pedido]), cliente: idCliente(l[c.cliente]), segmento: texto(l[c.segmento]) || 'Não informado',
        data: d, produto: nomeProduto(l[c.produto]), subgrupo: null, grupo: null, bairro: null, cidade: null,
        qtde: numero(l[c.qtde]), kg: numero(l[c.kg]), valor: numero(l[c.valor]),
      });
    }
    return { formato: 'template', rows, avisos: [], fornecedorCrm: null, totalRelatorio: null };
  }

  /**
   * Lê um workbook já aberto pelo SheetJS e devolve linhas normalizadas.
   * Lança Error com mensagem pronta pra tela quando o arquivo não é reconhecido.
   */
  function lerWorkbook(wb, XLSX, nomeArquivo = '') {
    // template antigo: aba "Base" (oculta) com a Tabela1
    const abaBase = wb.SheetNames.find((n) => norm(n) === 'base');
    const ordem = abaBase ? [abaBase, ...wb.SheetNames.filter((n) => n !== abaBase)] : wb.SheetNames;
    for (const nome of ordem) {
      const ws = wb.Sheets[nome];
      if (!ws || !ws['!ref']) continue;
      const linhas = matriz(ws, XLSX);
      let h = acharLinhaCabecalho(linhas, ['ID Pedido de Venda', 'ID Cliente', 'Data', 'Produto', 'Valor']);
      if (h >= 0) return finalizar(lerConsulta(linhas, h), nomeArquivo);
      h = acharLinhaCabecalho(linhas, ['Pedido de Venda', 'ID - Nome do Cliente', 'Data de Emissão do Pedido', 'Total de Venda R$']);
      if (h >= 0) return finalizar(lerRelvvp(linhas, h), nomeArquivo);
      h = acharLinhaCabecalho(linhas, ['Pedido de Venda', 'ID - Nome do Cliente', 'Data de Emissão do Pedido', 'Venda R$', 'Venda Kg'], 5);
      if (h >= 0) return finalizar(lerTemplate(linhas, h), nomeArquivo);
    }
    throw new Error('Formato não reconhecido. Use o relatório "Vendas por Produto" (Consulta), o "Pedidos de Vendas por Vendedor e Produto" ou a planilha antiga do fechamento (aba Base).');
  }

  function finalizar(res, nomeArquivo) {
    if (!res.rows.length) throw new Error('O arquivo não tem nenhuma linha de venda.');
    let min = res.rows[0].data, max = res.rows[0].data, total = 0;
    for (const r of res.rows) { if (r.data < min) min = r.data; if (r.data > max) max = r.data; total += r.valor; }
    res.dataMin = min; res.dataMax = max;
    res.totalVenda = r2(total);
    res.meses = [...new Set(res.rows.map((r) => mesDe(r.data)))].sort();
    // código numérico no nome do arquivo (ex.: "Vendas_por_Produto-5339 12.xlsx" → "5339")
    const cod = String(nomeArquivo).match(/-(\d{3,6})\b/);
    res.codigoArquivo = cod ? cod[1] : null;
    res.nomeArquivo = nomeArquivo;
    res.temBairro = res.rows.some((r) => r.bairro || r.cidade);
    res.temSubgrupo = res.rows.some((r) => r.subgrupo || r.grupo);
    if (res.totalRelatorio !== null && res.totalRelatorio !== undefined) {
      res.diferencaTotal = r2(res.totalVenda - res.totalRelatorio);
      res.totalConfere = Math.abs(res.diferencaTotal) <= 0.05;
    } else {
      res.diferencaTotal = null;
      res.totalConfere = null;
    }
    return res;
  }

  /* ───────────── qual fornecedor é esse arquivo ───────────── */
  /**
   * Ordem de confiança:
   *  1. nome do fornecedor que veio no próprio relatório (RELVVP) bate com nomes_crm
   *  2. código do nome do arquivo bate com nomes_crm (aprendido no 1º upload)
   *  3. nome do arquivo bate com arquivo_template (carga do histórico)
   *  4. palpite: nome do fornecedor aparece no nome dos produtos (ex.: "... ALFAMA 1 KG")
   * 1–3 publicam direto; 4 só sugere e pede confirmação.
   */
  function identificarFornecedor(lido, fornecedores) {
    const ativos = fornecedores.filter((f) => f.ativo !== false);
    if (lido.fornecedorCrm) {
      const k = chave(lido.fornecedorCrm);
      const f = ativos.find((x) => (x.nomes_crm || []).some((n) => chave(n) === k));
      if (f) return { fornecedor: f, certeza: true, motivo: `Relatório diz "${lido.fornecedorCrm}"` };
    }
    if (lido.codigoArquivo) {
      const f = ativos.find((x) => (x.nomes_crm || []).includes(lido.codigoArquivo));
      if (f) return { fornecedor: f, certeza: true, motivo: `Código ${lido.codigoArquivo} já vinculado` };
    }
    if (lido.formato === 'template' && lido.nomeArquivo) {
      const base = chave(String(lido.nomeArquivo).replace(/\.xlsx?$/i, ''));
      const f = ativos.find((x) => x.arquivo_template && chave(String(x.arquivo_template).replace(/\.xlsx?$/i, '')) === base)
        || ativos.find((x) => chave(x.nome) === base);
      if (f) return { fornecedor: f, certeza: true, motivo: `Planilha "${lido.nomeArquivo}"` };
    }
    // palpite pelo nome nos produtos / no fornecedor do relatório
    const textoBusca = ' ' + chave([lido.fornecedorCrm || '', ...new Set(lido.rows.slice(0, 3000).map((r) => r.produto))].join(' ')) + ' ';
    let melhor = null;
    for (const f of ativos) {
      const nome = chave(f.nome.replace(/\(.*\)/, ''));
      if (nome.length < 3) continue;
      const re = new RegExp(' ' + nome.replace(/ /g, '\\s') + ' ', 'g');
      const hits = (textoBusca.match(re) || []).length;
      if (hits && (!melhor || hits > melhor.hits)) melhor = { f, hits };
    }
    if (melhor) return { fornecedor: melhor.f, certeza: false, motivo: `"${melhor.f.nome}" aparece no nome dos produtos` };
    return { fornecedor: null, certeza: false, motivo: 'Não deu pra identificar sozinho' };
  }

  /* ───────────── resumo mensal ───────────── */
  // Estrutura "aberta" (com textos), usada só em memória:
  // { 'AAAA-MM': { t:{venda,kg,qtde,pedidos,clientes}, p:{produto:{...}}, s:{seg:{...}}, c:{cli:{venda,pedidos}},
  //               g:{subgrupo:{venda,kg,pedidos}}, b:{'BAIRRO|Cidade':{venda,kg,pedidos}}, w:[7], fonte } }
  function resumir(rows, fonte) {
    const meses = {};
    const sets = {};
    for (const r of rows) {
      const m = mesDe(r.data);
      let M = meses[m];
      if (!M) {
        M = meses[m] = { t: { venda: 0, kg: 0, qtde: 0, pedidos: 0, clientes: 0 }, p: {}, s: {}, c: {}, g: {}, b: {}, w: [0, 0, 0, 0, 0, 0, 0], ps: {}, fonte };
        sets[m] = { ped: new Set(), cli: new Set(), pp: {}, sp: {}, sc: {}, cp: {}, gp: {}, bp: {} };
      }
      const S = sets[m];
      M.t.venda += r.valor; M.t.kg += r.kg; M.t.qtde += r.qtde;
      S.ped.add(r.pedido); S.cli.add(r.cliente);
      M.w[r.data.getDay()] += r.valor;

      const P = M.p[r.produto] || (M.p[r.produto] = { venda: 0, kg: 0, qtde: 0, pedidos: 0 });
      P.venda += r.valor; P.kg += r.kg; P.qtde += r.qtde;
      (S.pp[r.produto] || (S.pp[r.produto] = new Set())).add(r.pedido);
      const sg = r.subgrupo || r.grupo;
      if (sg) M.ps[r.produto] = sg;

      const Sg = M.s[r.segmento] || (M.s[r.segmento] = { venda: 0, kg: 0, pedidos: 0, clientes: 0 });
      Sg.venda += r.valor; Sg.kg += r.kg;
      (S.sp[r.segmento] || (S.sp[r.segmento] = new Set())).add(r.pedido);
      (S.sc[r.segmento] || (S.sc[r.segmento] = new Set())).add(r.cliente);

      const C = M.c[r.cliente] || (M.c[r.cliente] = { venda: 0, pedidos: 0 });
      C.venda += r.valor;
      (S.cp[r.cliente] || (S.cp[r.cliente] = new Set())).add(r.pedido);

      if (sg) {
        const G = M.g[sg] || (M.g[sg] = { venda: 0, kg: 0, pedidos: 0 });
        G.venda += r.valor; G.kg += r.kg;
        (S.gp[sg] || (S.gp[sg] = new Set())).add(r.pedido);
      }
      if (r.bairro || r.cidade) {
        // capital: por bairro; resto: por cidade (mantém o arquivo leve e dá pra pôr no mapa)
        const capital = chave(r.cidade) === 'sao paulo';
        const kb = capital ? `${r.bairro || 'Não informado'}|São Paulo` : `|${r.cidade || ''}`;
        const B = M.b[kb] || (M.b[kb] = { venda: 0, kg: 0, pedidos: 0 });
        B.venda += r.valor; B.kg += r.kg;
        (S.bp[kb] || (S.bp[kb] = new Set())).add(r.pedido);
      }
    }
    for (const m of Object.keys(meses)) {
      const M = meses[m], S = sets[m];
      M.t.pedidos = S.ped.size; M.t.clientes = S.cli.size;
      for (const k in M.p) M.p[k].pedidos = S.pp[k].size;
      for (const k in M.s) { M.s[k].pedidos = S.sp[k].size; M.s[k].clientes = S.sc[k].size; }
      for (const k in M.c) M.c[k].pedidos = S.cp[k].size;
      for (const k in M.g) M.g[k].pedidos = S.gp[k].size;
      for (const k in M.b) M.b[k].pedidos = S.bp[k].size;
    }
    return meses;
  }

  /* ───────────── JSON publicado (compacto, com dicionários) ───────────── */
  /* ───────────── coordenadas (resolvidas na hora de publicar) ───────────── */
  // Bairros da capital: mesmo dicionário que o dashboard do fornecedor já usava.
  const BAIRROS_SP = {
    'vila mariana':[-23.5892,-46.6352],'moema':[-23.6031,-46.6683],'itaim bibi':[-23.5844,-46.6734],'pinheiros':[-23.5651,-46.6944],
    'jardins':[-23.5698,-46.6513],'brooklin':[-23.6166,-46.6957],'vila olimpia':[-23.5953,-46.6855],'perdizes':[-23.5391,-46.6667],
    'lapa':[-23.5263,-46.7058],'barra funda':[-23.5266,-46.6624],'santana':[-23.4996,-46.6259],'tatuape':[-23.5357,-46.5710],
    'mooca':[-23.5564,-46.5968],'ipiranga':[-23.5908,-46.6088],'saude':[-23.6020,-46.6296],'jabaquara':[-23.6485,-46.6528],
    'santo amaro':[-23.6516,-46.7118],'campo limpo':[-23.6372,-46.7603],'itaquera':[-23.5417,-46.4556],'penha':[-23.5257,-46.5338],
    'belem':[-23.5376,-46.5567],'liberdade':[-23.5622,-46.6369],'bela vista':[-23.5591,-46.6464],'consolacao':[-23.5524,-46.6579],
    'republica':[-23.5440,-46.6413],'se':[-23.5505,-46.6333],'centro':[-23.5505,-46.6333],'cambuci':[-23.5711,-46.6232],
    'bom retiro':[-23.5348,-46.6409],'santa cecilia':[-23.5445,-46.6556],'higienopolis':[-23.5479,-46.6619],'pompeia':[-23.5387,-46.6905],
    'agua branca':[-23.5173,-46.6985],'butanta':[-23.5724,-46.7212],'morumbi':[-23.6083,-46.7215],'campo belo':[-23.6242,-46.6839],
    'santo antonio':[-23.6353,-46.6742],'cursino':[-23.6148,-46.6117],'sacoma':[-23.6033,-46.5893],'vila prudente':[-23.5865,-46.5694],
    'aricanduva':[-23.5621,-46.5168],'sao miguel':[-23.4975,-46.4408],'ermelino matarazzo':[-23.5043,-46.4637],'vila matilde':[-23.5394,-46.5017],
    'agua rasa':[-23.5508,-46.5586],'carrao':[-23.5499,-46.5380],'vila formosa':[-23.5613,-46.5258],'bras':[-23.5442,-46.6132],
    'pari':[-23.5326,-46.6201],'tucuruvi':[-23.4748,-46.5987],'mandaqui':[-23.4888,-46.6259],'casa verde':[-23.5091,-46.6610],
    'limao':[-23.5048,-46.6771],'pirituba':[-23.4934,-46.7200],'jaragua':[-23.4601,-46.7436],'perus':[-23.4219,-46.7461],
    'vila guilherme':[-23.5108,-46.5999],'vila medeiros':[-23.5001,-46.5721],'tremembe':[-23.4720,-46.6262],'lajeado':[-23.5359,-46.4368],
    'guaianazes':[-23.5451,-46.4005],'guaianases':[-23.5451,-46.4005],'itaim paulista':[-23.5102,-46.4236],'sao mateus':[-23.5780,-46.4564],
    'sapopemba':[-23.5884,-46.4897],'cidade ademar':[-23.6605,-46.6329],'pedreira':[-23.6855,-46.6309],'parelheiros':[-23.8107,-46.7229],
    'grajau':[-23.7027,-46.6638],'cidade dutra':[-23.6902,-46.6633],'vila andrade':[-23.6387,-46.7252],'capao redondo':[-23.6678,-46.7580],
    'campo grande':[-23.6597,-46.7785],'raposo tavares':[-23.6258,-46.8012],'vila sonia':[-23.5975,-46.7453],'socorro':[-23.6565,-46.6999],
    'imirim':[-23.4870,-46.6464],'vila maria':[-23.5133,-46.5856],'jardim sao paulo':[-23.4925,-46.6185],'freguesia do o':[-23.4973,-46.6948],
    'vila carrao':[-23.5499,-46.5380],'cangaiba':[-23.5083,-46.5232],'jardim helena':[-23.4842,-46.4237],'cidade tiradentes':[-23.5826,-46.4040],
    'jose bonifacio':[-23.5560,-46.4325],'parque do carmo':[-23.5743,-46.4718],'vila jacui':[-23.4990,-46.4593],'jardim angela':[-23.7066,-46.7682],
    'jardim sao luis':[-23.6639,-46.7424],'vila leopoldina':[-23.5293,-46.7327],'jaguare':[-23.5462,-46.7486],'rio pequeno':[-23.5638,-46.7539],
    'vila guarani':[-23.6264,-46.6372],'vila clementino':[-23.5976,-46.6436],'aclimacao':[-23.5726,-46.6309],'paraiso':[-23.5744,-46.6457],
    'vila madalena':[-23.5564,-46.6907],'chacara santo antonio':[-23.6353,-46.7058],'interlagos':[-23.6824,-46.6896],'vila carrao':[-23.5499,-46.5380],
  };

  /**
   * Monta a função que dá [lat, lon] pra uma chave "bairro|cidade" do resumo.
   * geoBR = objeto GEO_BR do /geo-data.js ("Cidade|UF" → [lat, lon]).
   * Prioriza SP; se a cidade só existir em um estado, usa esse. Na dúvida, não plota.
   */
  function criarGeo(geoBR) {
    const ALIAS = { 'embu': 'embu das artes', 'mogi mirim': 'mogi mirim', 'sao luis do paraitinga': 'sao luiz do paraitinga' };
    const kc = (s) => { const c = chave(String(s ?? '').replace(/['’`]/g, '')); return ALIAS[c] || c; };
    const cidades = new Map(); // chave da cidade → [{uf, coord}]
    for (const [k, v] of Object.entries(geoBR || {})) {
      const [cid, uf] = k.split('|');
      const c = kc(cid);
      if (!cidades.has(c)) cidades.set(c, []);
      cidades.get(c).push({ uf, v });
    }
    const bairros = new Map(Object.entries(BAIRROS_SP).map(([k, v]) => [chave(k), v]));
    return function (rotulo) {
      const [bairro, cidade] = String(rotulo).split('|');
      if (bairro && chave(cidade) === 'sao paulo') {
        const b = chave(bairro).replace(/^(vila|vl|jardim|jd|parque|pq) /, (m) => ({ 'vl ': 'vila ', 'jd ': 'jardim ', 'pq ': 'parque ' }[m] || m));
        return bairros.get(b) || null;
      }
      const lista = cidades.get(kc(cidade));
      if (!lista) return null;
      const sp = lista.find((x) => x.uf === 'SP');
      if (sp) return sp.v;
      return lista.length === 1 ? lista[0].v : null;
    };
  }

  function codificar(meses, meta, opcoes = {}) {
    const dic = { p: [], s: [], c: [], g: [], b: [] };
    const pos = { p: new Map(), s: new Map(), c: new Map(), g: new Map(), b: new Map() };
    const id = (tipo, valor) => {
      let i = pos[tipo].get(valor);
      if (i === undefined) { i = dic[tipo].length; dic[tipo].push(valor); pos[tipo].set(valor, i); }
      return i;
    };
    const ps = {}; // produto → subgrupo (o mais recente vence)
    const out = {};
    for (const m of Object.keys(meses).sort()) {
      const M = meses[m];
      for (const [prod, sg] of Object.entries(M.ps || {})) ps[prod] = sg;
      out[m] = {
        f: M.fonte || null,
        t: [r2(M.t.venda), r3(M.t.kg), r3(M.t.qtde), M.t.pedidos, M.t.clientes],
        p: Object.entries(M.p).map(([k, v]) => [id('p', k), r2(v.venda), r3(v.kg), r3(v.qtde), v.pedidos]),
        s: Object.entries(M.s).map(([k, v]) => [id('s', k), r2(v.venda), r3(v.kg), v.pedidos, v.clientes]),
        c: Object.entries(M.c).map(([k, v]) => [id('c', k), r2(v.venda), v.pedidos]),
        g: Object.entries(M.g || {}).map(([k, v]) => [id('g', k), r2(v.venda), r3(v.kg), v.pedidos]),
        b: Object.entries(M.b || {}).map(([k, v]) => [id('b', k), r2(v.venda), r3(v.kg), v.pedidos]),
        w: (M.w || []).map(r2),
      };
    }
    const psOut = {};
    for (const [prod, sg] of Object.entries(ps)) if (pos.p.has(prod)) psOut[pos.p.get(prod)] = id('g', sg);
    const chavesMes = Object.keys(out).sort();
    const geo = {};
    if (typeof opcoes.geo === 'function') {
      dic.b.forEach((rotulo, i) => { const c = opcoes.geo(rotulo); if (c) geo[i] = [r3(c[0]) , r3(c[1])]; });
    }
    return {
      v: VERSAO_DASHBOARD,
      fornecedor: meta.fornecedor,
      atualizado_em: meta.atualizadoEm || new Date().toISOString(),
      mes_inicial: chavesMes[0] || null,
      mes_final: chavesMes[chavesMes.length - 1] || null,
      d: dic,
      ps: psOut,
      geo,
      m: out,
    };
  }

  function decodificar(json) {
    if (!json || json.v !== VERSAO_DASHBOARD || !json.m) return {};
    const d = json.d;
    const grupoDoProduto = {};
    for (const [pi, gi] of Object.entries(json.ps || {})) grupoDoProduto[d.p[pi]] = d.g[gi];
    const meses = {};
    for (const [m, M] of Object.entries(json.m)) {
      const o = { fonte: M.f || null, t: { venda: M.t[0], kg: M.t[1], qtde: M.t[2], pedidos: M.t[3], clientes: M.t[4] }, p: {}, s: {}, c: {}, g: {}, b: {}, w: M.w || [0, 0, 0, 0, 0, 0, 0], ps: {} };
      for (const [i, venda, kg, qtde, pedidos] of M.p) { o.p[d.p[i]] = { venda, kg, qtde, pedidos }; if (grupoDoProduto[d.p[i]]) o.ps[d.p[i]] = grupoDoProduto[d.p[i]]; }
      for (const [i, venda, kg, pedidos, clientes] of M.s) o.s[d.s[i]] = { venda, kg, pedidos, clientes };
      for (const [i, venda, pedidos] of M.c) o.c[d.c[i]] = { venda, pedidos };
      for (const [i, venda, kg, pedidos] of (M.g || [])) o.g[d.g[i]] = { venda, kg, pedidos };
      for (const [i, venda, kg, pedidos] of (M.b || [])) o.b[d.b[i]] = { venda, kg, pedidos };
      meses[m] = o;
    }
    return meses;
  }

  /** Junta o que já está publicado com o arquivo novo: mês do arquivo substitui mês publicado. */
  function mesclar(publicado, novo) {
    const out = { ...publicado };
    for (const m of Object.keys(novo)) out[m] = novo[m];
    return out;
  }

  /* ───────────── slug ───────────── */
  function gerarSlug(nome) {
    const base = semAcento(nome).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fornecedor';
    const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(8);
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
    return base + '-' + Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
  }

  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function nomeMes(chaveMes, curto = false) {
    const [a, m] = String(chaveMes).split('-').map(Number);
    const n = MESES_PT[m - 1] || '?';
    return curto ? `${n.slice(0, 3)}/${String(a).slice(2)}` : `${n} de ${a}`;
  }

  return { lerWorkbook, identificarFornecedor, resumir, criarGeo, codificar, decodificar, mesclar, gerarSlug, nomeMes, mesDe, chave, nomeProduto, idCliente, VERSAO_DASHBOARD };
});
