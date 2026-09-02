(() => {
  'use strict';

  const SQL_BASE_KEY = 'pmg_campaigns_sql_base';
  const THEME_KEY = 'pmg_theme';
  const CONTEXT_ID = 'commercial-context-v6';
  const PAGE_IS_LOOPBACK = location.protocol === 'http:' && (location.port === '3001' || ['localhost', '127.0.0.1'].includes(location.hostname));
  const configuredSqlBase = localStorage.getItem(SQL_BASE_KEY) || window.PMG_SQL_API_BASE || 'http://localhost:3001/api';
  const SQL_BASE = String(
    PAGE_IS_LOOPBACK ? '/api' : configuredSqlBase
  ).replace(/\/$/, '');
  const SQL_ENDPOINT = `${SQL_BASE}/campanhas-data`;
  const VISUAL_ENDPOINT = '/api/produtos-supabase';
  const DB_NAME = 'pmg_campanhas_db';
  const DB_VERSION = 2;
  const STORES = ['campanhas', 'produtos', 'representantes', 'vendas', 'regras', 'regrasProduto', 'mapeamentos', 'apuracoes', 'config'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
  const money2 = (value) => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 });
  const number = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits:digits, minimumFractionDigits:digits });
  const pct = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${number(value, 1)}%`;
  const dateBR = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function sellerIdentity(rawName) {
    const raw = String(rawName || '').trim();
    const match = raw.match(/^(.*?)[\s-]+(\d+)$/);
    return match
      ? { raw, name:match[1].trim(), code:match[2].trim() }
      : { raw, name:raw, code:'' };
  }

  function tooltipAttr(lines) {
    const text = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
    return esc(text).replace(/\n/g, '&#10;');
  }

  function auditValue(valueHtml, lines, extraClass = '') {
    return `<span class="metric-audit ${extraClass}" tabindex="0" data-audit="${tooltipAttr(lines)}">${valueHtml}<i data-lucide="info"></i></span>`;
  }

  function auditHeader(label, lines) {
    return `<span class="metric-header-audit" tabindex="0" data-audit="${tooltipAttr(lines)}">${esc(label)}<i data-lucide="circle-help"></i></span>`;
  }

  const RANKING_METRICS = [
    { id:'points', label:'Pontos', icon:'sparkles', description:'Pontuação total gerada pelas regras da campanha' },
    { id:'revenue', label:'Faturamento', icon:'badge-dollar-sign', description:'Valor vendido no período da campanha' },
    { id:'kg', label:'Volume em KG', icon:'weight', description:'Quantidade total vendida em quilos' },
    { id:'pieces', label:'Quantidade de unidades', icon:'package', description:'Quantidade total vendida em unidades' },
    { id:'positivity', label:'Positivação', icon:'user-round-plus', description:'Clientes atuais menos clientes do período anterior' },
    { id:'mix', label:'Mix de categorias', icon:'boxes', description:'Percentual de categorias obrigatórias cumpridas' },
    { id:'revenueGrowth', label:'Crescimento de R$', icon:'trending-up', description:'Crescimento percentual do faturamento' },
    { id:'kgGrowth', label:'Crescimento de KG', icon:'chart-no-axes-combined', description:'Crescimento percentual do volume' },
    { id:'activationClients', label:'Benefícios utilizados', icon:'badge-check', description:'Clientes cuja primeira compra do ativador gerou desconto' },
    { id:'activationRate', label:'Aproveitamento da 1ª compra', icon:'percent', description:'Primeiras compras do ativador que também continham produtos beneficiados' },
  ];

  const BASE_METRICS = [
    ['positivity', 'Positivação líquida', 'clientes'],
    ['revenue', 'Faturamento', 'R$'],
    ['kg', 'Volume', 'KG'],
    ['pieces', 'Quantidade de unidades', 'unidades'],
    ['points', 'Pontos', 'pontos'],
    ['customers', 'Clientes únicos', 'clientes'],
    ['mix', 'Mix de categorias', '%'],
    ['orders', 'Pedidos', 'pedidos'],
    ['activationClients', 'Benefícios utilizados', 'clientes'],
    ['activationOrders', 'Pedidos com benefício', 'pedidos'],
    ['activationRate', 'Aproveitamento da 1ª compra', '%'],
  ];

  const GROWTH_METRICS = [
    ['revenue', 'Faturamento'], ['kg', 'Volume em KG'], ['pieces', 'Quantidade de unidades'], ['customers', 'Clientes únicos'], ['orders', 'Pedidos'],
  ];

  const POINT_SOURCES = [
    ['positivity', 'Positivação líquida'], ['revenue', 'Faturamento'], ['kg', 'Volume em KG'], ['pieces', 'Quantidade de unidades'],
    ['customers', 'Clientes únicos'], ['orders', 'Pedidos'], ['mixCategories', 'Categorias de mix cumpridas'], ['distinctProducts', 'Produtos distintos'],
    ['activationClients', 'Benefícios utilizados'], ['activationOrders', 'Pedidos com benefício'],
  ];

  const FORMULA_VARIABLES = [
    ['FARDOS', 'Fardos completos'],
    ['FARDOS_EQUIVALENTES', 'Fardos equivalentes, aceita fração'],
    ['UNIDADES', 'Quantidade de unidades'],
    ['KG', 'Volume em KG'],
    ['FATURAMENTO', 'Faturamento em R$'],
    ['CLIENTES', 'Clientes únicos no escopo da fórmula'],
    ['PEDIDOS', 'Pedidos do vendedor no período'],
    ['PRODUTOS_DISTINTOS', 'Produtos diferentes vendidos'],
    ['POSITIVACAO', 'Positivação líquida'],
    ['MIX', 'Percentual de mix'],
    ['CATEGORIAS_MIX', 'Categorias de mix cumpridas'],
  ];

  const FORMULA_FUNCTIONS = [
    ['INT', 'Inteiro para baixo'],
    ['ARRED', 'Arredondar'],
    ['MIN', 'Menor valor'],
    ['MAX', 'Maior valor'],
    ['ABS', 'Valor absoluto'],
    ['SE', 'Condição: SE(condição; valor_se_sim; valor_se_não)'],
  ];

  const TIE_OPTIONS = [
    ['positivity', 'Maior positivação'], ['revenue', 'Maior faturamento'], ['kg', 'Maior volume'], ['pieces', 'Mais unidades'],
    ['mix', 'Maior mix'], ['points', 'Maior pontuação'], ['orders', 'Mais pedidos'],
    ['revenueGrowth', 'Maior crescimento de faturamento'], ['kgGrowth', 'Maior crescimento de volume'],
    ['activationClients', 'Mais benefícios utilizados'], ['activationRate', 'Maior aproveitamento da 1ª compra'],
  ];

  const STEPS = [
    { title:'Informações gerais', subtitle:'Período, fornecedores e participantes' },
    { title:'Ranking e metas', subtitle:'Métricas, metas e elegibilidade' },
    { title:'Produtos e categorias', subtitle:'Escopo, mix e pontuação por produto' },
    { title:'Benefício de 1ª compra', subtitle:'Fortunata, produtos com desconto e elegibilidade' },
    { title:'Desempate e premiação', subtitle:'Prioridades, bônus e classificados' },
  ];

  let db;
  const DB = {
    async init() {
      if (db) return db;
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const instance = req.result;
          for (const name of STORES) if (!instance.objectStoreNames.contains(name)) instance.createObjectStore(name, { keyPath:'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return db;
    },
    async all(store) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); }); },
    async get(store, id) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).get(id); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); },
    async put(store, value) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store,'readwrite').objectStore(store).put(value); req.onsuccess=()=>resolve(value); req.onerror=()=>reject(req.error); }); },
    async remove(store, id) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store,'readwrite').objectStore(store).delete(id); req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error); }); },
  };

  const app = {
    view:'dashboard', campaigns:[], context:{ suppliers:[], products:[], representatives:[] }, contextReady:false, contextCached:false,
    contextStatus:null, contextPromise:null, useCachedAllowed:false, campaignSearch:'', productSearch:'', representativeSearch:'',
    wizard:null, performance:null, sellerAudit:null, benefitReport:null, imageCache:new Map(), imageAttempted:new Set(), imageInFlight:new Map(), apiInFlight:new Map(), apiCache:new Map(),
    savingCampaign:false, performanceInFlight:new Set(),
  };

  function icons(root = document) {
    const run = () => { try { window.lucide?.createIcons({ attrs:{ 'stroke-width':1.9 } }); } catch (_) {} };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:450 }); else setTimeout(run, 30);
  }

  function toast(message, type = '') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    $('#toastStack').append(node);
    setTimeout(() => node.remove(), 4500);
  }

  function setProgress(active) {
    const bar = $('#progressLine');
    bar.classList.toggle('is-loading', active);
    if (!active) { bar.classList.add('is-done'); setTimeout(() => bar.classList.remove('is-done'), 300); }
  }

  function setSideStatus(status, detail) {
    const box = $('#sideStatus');
    box.classList.remove('is-online', 'is-error');
    if (status === 'online') box.classList.add('is-online');
    if (status === 'error') box.classList.add('is-error');
    $('#sideStatusDetail').textContent = detail || '';
  }

  function apiKey(url, options = {}) { return `${String(options.method || 'GET').toUpperCase()}:${url}:${options.body || ''}`; }
  async function api(url, options = {}) {
    const {
      force = false,
      ttl = 60000,
      timeout = 20000,
      headers: suppliedHeaders = {},
      authRetry = false,
      ...fetchOptions
    } = options;

    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const key = apiKey(url, { ...fetchOptions, method });
    const cacheable = method === 'GET' && !force;
    const cached = app.apiCache.get(key);

    if (cacheable && cached && Date.now() - cached.at < ttl) return cached.data;
    if (cacheable && app.apiInFlight.has(key)) return app.apiInFlight.get(key);

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('Tempo limite da API local excedido.')), timeout);
      let headers = { ...suppliedHeaders };

      // A API SQL local é protegida pelo PMG Connect.
      // O token chega em #pmg_auth, é capturado pelo connect-auth.js e
      // enviado como Bearer somente para /api do localhost.
      const authBridge = window.PMGConnectAuth;
      if (authBridge?.isLocalApiUrl?.(url)) {
        headers = await authBridge.authorizationHeaders(headers);
      }

      // Com Authorization, chamadas cross-origin podem usar preflight CORS.
      // Isso evita um preflight desnecessário entre a página HTTPS da Vercel e o localhost.
      if (fetchOptions.body != null && !(fetchOptions.body instanceof FormData)) {
        const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
        if (!hasContentType) headers['Content-Type'] = 'application/json';
      }

      const resolvedUrl = (() => {
        try { return new URL(url, location.href); }
        catch { return null; }
      })();

      const isLoopbackRequest = resolvedUrl
        ? ['localhost', '127.0.0.1'].includes(resolvedUrl.hostname)
        : false;

      const isPrivateLanRequest = resolvedUrl
        ? /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(resolvedUrl.hostname)
        : false;

      const isSameOriginRequest = Boolean(resolvedUrl && resolvedUrl.origin === location.origin);

      // No localhost, usar caminho relativo elimina PNA/CORS desnecessário.
      const requestUrl = PAGE_IS_LOOPBACK && isSameOriginRequest
        ? `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash || ''}`
        : url;

      const doFetch = (target, minimalSameOrigin = false) => {
        if (minimalSameOrigin) {
          return fetch(target, {
            ...fetchOptions,
            method,
            headers,
            signal: controller.signal,
            cache:'no-store',
            credentials:'same-origin',
          });
        }

        return fetch(target, {
          ...fetchOptions,
          method,
          headers,
          signal: controller.signal,
          cache:'no-store',
          credentials:isSameOriginRequest ? 'same-origin' : 'omit',
          ...(!isSameOriginRequest ? { mode:'cors' } : {}),
          ...(!isSameOriginRequest && isLoopbackRequest ? { targetAddressSpace:'loopback' } : {}),
          ...(!isSameOriginRequest && isPrivateLanRequest ? { targetAddressSpace:'local' } : {}),
        });
      };

      let response;
      try {
        try {
          response = await doFetch(requestUrl, isSameOriginRequest);
        } catch (firstError) {
          if (PAGE_IS_LOOPBACK && isSameOriginRequest && resolvedUrl) {
            try {
              const relative = `${resolvedUrl.pathname}${resolvedUrl.search}`;
              response = await doFetch(relative, true);
            } catch (retryError) {
              retryError.firstSameOriginError = firstError?.message || String(firstError);
              throw retryError;
            }
          } else {
            throw firstError;
          }
        }
      } catch (error) {
        const aborted = controller.signal.aborted || error?.name === 'AbortError';
        let permissionState = '';

        if (!aborted && !PAGE_IS_LOOPBACK && navigator.permissions?.query) {
          try {
            const permission = await navigator.permissions.query({ name: 'loopback-network' });
            permissionState = permission?.state ? ` Permissão de loopback: ${permission.state}.` : '';
          } catch (_) {}
        }

        const browserDetail = [error?.message, error?.firstSameOriginError]
          .filter(Boolean)
          .filter((value, index, list) => list.indexOf(value) === index)
          .join(' | ');

        const networkError = new Error(
          aborted
            ? 'A API local demorou para responder.'
            : PAGE_IS_LOOPBACK
              ? `A página local não conseguiu acessar /api no próprio servidor.${browserDetail ? ` Navegador: ${browserDetail}` : ''}`
              : `O navegador não conseguiu acessar o localhost da PMG.${permissionState} Autorize o acesso ao computador local para este site.`
        );

        networkError.code = aborted
          ? 'LOCAL_API_TIMEOUT'
          : (PAGE_IS_LOOPBACK ? 'LOCAL_API_SAME_ORIGIN' : 'LOOPBACK_NETWORK_PERMISSION');
        networkError.cause = error;
        throw networkError;
      } finally {
        clearTimeout(timer);
      }

      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`A API respondeu HTTP ${response.status} sem JSON: ${raw.slice(0,180) || 'resposta vazia'}`); }

      if (!response.ok && response.status !== 202) {
        const authCode = String(data.codigo || '');

        if (
          response.status === 401
          && !authRetry
          && ['PMG_AUTH_REQUIRED', 'PMG_AUTH_INVALID', 'PMG_AUTH_EXPIRED'].includes(authCode)
          && window.PMGConnectAuth?.hasRefreshToken?.()
        ) {
          try {
            const refreshed = await window.PMGConnectAuth.refreshSession({ force:true });
            if (refreshed?.access_token) {
              return api(url, {
                ...options,
                force:true,
                authRetry:true,
              });
            }
          } catch (refreshError) {
            console.warn('[Campanhas] refresh após 401 falhou:', refreshError?.message || refreshError);
          }
        }

        const error = new Error(data.erro || data.message || `Falha HTTP ${response.status}`);
        error.code = data.codigo;
        error.hint = data.dica;
        error.sqlRecoveryAttempted = Boolean(data.recuperacaoSqlTentada);
        error.httpStatus = response.status;

        // Só limpa uma sessão sem possibilidade de refresh. Quando há refresh
        // token, a tentativa acima já decidiu se a sessão ainda é recuperável.
        if (
          response.status === 401
          && ['PMG_AUTH_INVALID', 'PMG_AUTH_EXPIRED'].includes(authCode)
          && !window.PMGConnectAuth?.hasRefreshToken?.()
        ) {
          window.PMGConnectAuth?.clear?.();
        }

        throw error;
      }

      if (cacheable && response.ok) app.apiCache.set(key, { at:Date.now(), data });
      return data;
    })().finally(() => app.apiInFlight.delete(key));

    if (cacheable) app.apiInFlight.set(key, promise);
    return promise;
  }

  async function loadCachedContext() {
    const row = await DB.get('config', CONTEXT_ID);
    if (!row?.context) return null;
    app.context = row.context;
    app.contextCached = true;
    app.useCachedAllowed = true;
    return row;
  }

  async function saveContext(context, updatedAt) {
    await DB.put('config', { id:CONTEXT_ID, context, updatedAt:updatedAt || new Date().toISOString() });
  }

  function updateContextOverlay(status = {}) {
    app.contextStatus = status;
    const pctValue = Math.max(0, Math.min(100, Number(status.progress) || 0));
    $('#contextProgressBar').style.width = `${pctValue}%`;
    $('#contextProgressPct').textContent = `${pctValue}%`;
    $('#contextProgressText').textContent = status.message || 'Preparando contexto…';
    const order = ['connect','query','organize','cache','ready'];
    const currentIndex = order.indexOf(status.phase);
    $$('#contextSteps [data-phase]').forEach((node) => {
      const index = order.indexOf(node.dataset.phase);
      node.classList.toggle('is-active', index === currentIndex);
      node.classList.toggle('is-done', currentIndex > index || status.phase === 'ready');
      const icon = node.querySelector('i');
      if (icon) icon.setAttribute('data-lucide', node.classList.contains('is-done') ? 'circle-check' : node.classList.contains('is-active') ? 'loader-circle' : 'circle');
    });
    const isError = status.status === 'error';
    const errorCode = status.error?.code || status.code || '';
    const isPermissionError = ['LOCAL_NETWORK_PERMISSION', 'LOOPBACK_NETWORK_PERMISSION'].includes(errorCode);

    $('#contextError').hidden = !isError;
    $('#contextError').textContent = isError
      ? `${status.error?.message || status.message || 'Falha ao preparar o contexto.'}${errorCode ? ` · ${errorCode}` : ''}`
      : '';

    $('#retryContext').hidden = !isError;
    $('#retryContext').innerHTML = isPermissionError
      ? '<i data-lucide="router"></i>Permitir acesso local'
      : '<i data-lucide="refresh-cw"></i>Tentar novamente';

    $('#useCachedContext').hidden = !(isError && app.useCachedAllowed);
    icons($('#contextOverlay'));
  }

  async function useContextPayload(payload, { blocking = true } = {}) {
    if (!payload?.context) throw new Error('A API informou que o contexto está pronto, mas não enviou os dados.');
    app.context = payload.context;
    app.contextReady = true;
    app.contextCached = true;
    app.useCachedAllowed = true;
    await saveContext(payload.context, payload.updatedAt);

    setSideStatus(
      'online',
      `${payload.context.suppliers.length} códigos · ${payload.context.products.length} produtos · ${payload.context.representatives.length} representantes ativos`
    );

    if (blocking) {
      updateContextOverlay({
        ...payload,
        ready: true,
        status: 'ready',
        phase: 'ready',
        progress: 100,
        message: 'Contexto comercial pronto.',
      });
      await sleep(120);
      $('#contextOverlay').hidden = true;
      document.body.style.overflow = '';
    }

    renderView();
    return payload.context;
  }

  const CONTEXT_PREPARE_MAX_MS = 12 * 60 * 1000;
  const CONTEXT_STATUS_TIMEOUT_MS = 90 * 1000;
  const CONTEXT_PAYLOAD_TIMEOUT_MS = 120 * 1000;
  const HEAVY_CALC_TIMEOUT_MS = 18 * 60 * 1000;

  async function pollContext({ force = false, blocking = true } = {}) {
    if (app.contextPromise) return app.contextPromise;

    app.contextPromise = (async () => {
      const overlay = $('#contextOverlay');
      if (blocking) {
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      if (force) app.apiCache.clear();

      const deadline = Date.now() + CONTEXT_PREPARE_MAX_MS;
      const waitingStatus = (message = 'Sincronizando os dados comerciais do dia…') => ({
        status: 'loading',
        phase: 'query',
        progress: 12,
        message,
      });

      const readStatus = async () => {
        try {
          return await api(`${SQL_ENDPOINT}?recurso=contexto-status&_=${Date.now()}`, {
            force: true,
            timeout: CONTEXT_STATUS_TIMEOUT_MS,
          });
        } catch (error) {
          if (error?.code === 'LOCAL_API_TIMEOUT' && Date.now() < deadline) return null;
          throw error;
        }
      };

      try {
        let status = await readStatus();
        if (!status) status = waitingStatus('Servidor local processando a carga diária…');
        if (blocking) updateContextOverlay(status);

        if (status.ready) {
          const payload = await api(`${SQL_ENDPOINT}?recurso=contexto&_=${Date.now()}`, {
            force: true,
            timeout: CONTEXT_PAYLOAD_TIMEOUT_MS,
          });
          return useContextPayload(payload, { blocking });
        }

        try {
          await api(`${SQL_ENDPOINT}?recurso=contexto-preparar&force=${force ? 'true' : 'false'}&_=${Date.now()}`, {
            method: 'GET',
            force: true,
            timeout: CONTEXT_STATUS_TIMEOUT_MS,
          });
        } catch (error) {
          if (error?.code !== 'LOCAL_API_TIMEOUT') throw error;
        }

        while (Date.now() < deadline) {
          status = await readStatus();

          if (!status) {
            const transient = waitingStatus('A carga diária ainda está sendo processada. A primeira abertura pode levar alguns minutos.');
            if (blocking) updateContextOverlay(transient);
            else setSideStatus('online', transient.message);
            await sleep(1000);
            continue;
          }

          const daily = status.dailySnapshot || {};
          if (!status.ready && (daily.syncing || daily.status === 'loading')) {
            const dailyPhase = String(daily.phase || 'query');
            const phaseMap = {
              start:'connect', connect:'connect', schema:'query', query:'query',
              transform:'organize', compress:'cache', done:'cache', load:'cache', ready:'ready',
            };
            status = {
              ...status,
              status: 'loading',
              phase: phaseMap[dailyPhase] || 'query',
              progress: Math.max(12, Number(daily.progress) || Number(status.progress) || 0),
              message: daily.message || 'Sincronizando o snapshot comercial diário com o Azure SQL…',
            };
          }

          if (blocking) updateContextOverlay(status);
          else setSideStatus(
            status.status === 'error' ? 'error' : 'online',
            status.message || 'Atualizando contexto em segundo plano…'
          );

          if (status.ready) {
            const payload = await api(`${SQL_ENDPOINT}?recurso=contexto&_=${Date.now()}`, {
              force: true,
              timeout: CONTEXT_PAYLOAD_TIMEOUT_MS,
            });
            return useContextPayload(payload, { blocking });
          }

          if (status.status === 'error') {
            throw Object.assign(
              new Error(status.error?.message || status.message || 'Falha ao preparar o contexto.'),
              { code: status.error?.code }
            );
          }

          await sleep(1000);
        }

        throw Object.assign(
          new Error('A primeira sincronização excedeu 12 minutos. Confira o terminal do npm start para ver em qual etapa o Azure SQL parou.'),
          { code: 'DAILY_SNAPSHOT_MAX_WAIT' }
        );
      } catch (error) {
        setSideStatus('error', error.message);
        if (blocking) {
          updateContextOverlay({
            status: 'error',
            phase: 'error',
            progress: 0,
            message: error.message,
            error: { message:error.message, code:error.code || '' },
          });
        }
        throw error;
      } finally {
        app.contextPromise = null;
      }
    })();

    return app.contextPromise;
  }

  async function initializeContext() {
    const cached = await loadCachedContext();

    if (cached) {
      app.contextReady = true;
      $('#contextOverlay').hidden = true;
      document.body.style.overflow = '';

      const updatedAt = cached.updatedAt
        ? new Date(cached.updatedAt).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })
        : 'data não informada';

      setSideStatus(
        'online',
        `Contexto salvo · ${app.context.suppliers.length} códigos · atualizado em ${updatedAt}`
      );

      renderView();

      // O contexto salvo deixa a interface abrir imediatamente, mas não pode
      // impedir a regra de "primeiro acesso do dia". Disparamos a preparação
      // em segundo plano mesmo com cache local. O backend garante uma única
      // sincronização diária e mantém o último snapshot válido em caso de falha.
      void api(`${SQL_ENDPOINT}?recurso=contexto-preparar&force=false&_=${Date.now()}`, {
        method:'GET',
        force:true,
        timeout:CONTEXT_STATUS_TIMEOUT_MS,
      }).catch((error) => {
        console.warn('[Campanhas] não foi possível iniciar a atualização diária em segundo plano:', error?.message || error);
      });
      return;
    }

    try {
      await pollContext({ force: false, blocking: true });
    } catch (_) {
      // A tela de preparação apresenta o erro e oferece nova tentativa.
    }
  }

  function campaignStatus(campaign) {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = campaign.start ? new Date(`${campaign.start}T12:00:00`) : null;
    const end = campaign.end ? new Date(`${campaign.end}T12:00:00`) : null;
    if (!start || !end) return { id:'draft', label:'Rascunho', class:'closed' };
    if (today < start) return { id:'scheduled', label:'Agendada', class:'scheduled' };
    if (today > end) return { id:'closed', label:'Encerrada', class:'closed' };
    return { id:'active', label:'Ativa', class:'active' };
  }

  function daysUntil(value) {
    if (!value) return null;
    const target = new Date(`${value}T12:00:00`);
    const today = new Date(); today.setHours(12,0,0,0);
    return Math.ceil((target - today) / 86400000);
  }

  async function loadCampaigns() {
    app.campaigns = (await DB.all('campanhas')).map(normalizeCampaign).sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    $('#navCampaignCount').textContent = app.campaigns.length;
  }

  function selectedSupplierLabel(campaign) {
    const suppliers = campaign.suppliers || [];
    if (!suppliers.length) return 'Fornecedores não definidos';
    if (suppliers.length === 1) return `${suppliers[0].name} · cód. ${suppliers[0].id}`;
    return `${suppliers[0].name} + ${suppliers.length - 1} código(s)`;
  }

  function campaignCard(campaign) {
    const status = campaignStatus(campaign);
    const productCount = (campaign.categories || []).reduce((sum, category) => sum + (category.products || []).length, 0);
    const rulesCount = (campaign.rules || []).length + (campaign.collectiveGoals || []).length + (campaign.individualGoals || []).length + (campaign.pointRules || []).length;
    return `<article class="campaign-card">
      <div class="campaign-card-top">
        <span class="badge ${status.class}">${status.label}</span>
        <h3>${esc(campaign.name || 'Campanha sem nome')}</h3>
        <p>${esc(selectedSupplierLabel(campaign))}</p>
      </div>
      <div class="campaign-card-body">
        <div class="campaign-meta">
          <div><span>Período</span><strong>${dateBR(campaign.start)} – ${dateBR(campaign.end)}</strong></div>
          <div><span>Produtos</span><strong>${number(productCount)}</strong></div>
          <div><span>Regras</span><strong>${number(rulesCount)}</strong></div>
        </div>
        <div class="campaign-actions">
          <button class="secondary-btn" type="button" data-action="edit-campaign" data-id="${esc(campaign.id)}"><i data-lucide="pencil"></i>Editar</button>
          ${campaign.orderActivationRule?.enabled ? `<button class="secondary-btn benefit-action-btn" type="button" data-action="benefit-report" data-id="${esc(campaign.id)}"><i data-lucide="badge-percent"></i>Benefícios</button>` : ''}
          <button class="primary-btn" type="button" data-action="performance" data-id="${esc(campaign.id)}"><i data-lucide="chart-no-axes-combined"></i>Performance</button>
        </div>
      </div>
    </article>`;
  }

  function emptyState(title, text, action = '') {
    return `<div class="empty-state"><div class="empty-icon"><i data-lucide="megaphone"></i></div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  function renderDashboard() {
    const active = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'active');
    const scheduled = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'scheduled');
    const closed = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'closed');
    const next = [...active, ...scheduled].sort((a,b) => String(a.end).localeCompare(String(b.end))).slice(0,5);
    $('#pageRoot').innerHTML = `
      <div class="hero-grid">
        <section class="hero"><div class="hero-content"><span class="eyebrow">Motor de campanhas PMG</span><h2>Construa, acompanhe e apure campanhas sem sair do fluxo.</h2><p>Fornecedores, produtos, mix, metas coletivas e individuais, crescimento percentual e ranking por vendedor em um único espaço.</p><div class="hero-actions"><button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button><button class="secondary-btn" data-view="campaigns"><i data-lucide="list-filter"></i>Ver campanhas</button></div></div></section>
        <aside class="quick-panel"><span class="eyebrow">Acesso rápido</span><h3>Comece por aqui</h3><div class="quick-list">
          <button class="quick-item" data-action="new-campaign"><span class="quick-icon"><i data-lucide="wand-sparkles"></i></span><span><strong>Criar estrutura</strong><small>Configure período, fornecedores e regras.</small></span></button>
          <button class="quick-item" data-view="products"><span class="quick-icon"><i data-lucide="package-search"></i></span><span><strong>Explorar catálogo</strong><small>Consulte produtos do contexto preparado.</small></span></button>
          <button class="quick-item" data-view="representatives"><span class="quick-icon"><i data-lucide="users"></i></span><span><strong>Ver representantes</strong><small>Somente vendedores ativos.</small></span></button>
        </div></aside>
      </div>
      <div class="kpi-grid">
        ${kpi('Campanhas ativas', active.length, `${app.campaigns.length} total`, 'activity')}
        ${kpi('Produtos carregados', app.context.products.length, 'Contexto local', 'package-check')}
        ${kpi('Representantes ativos', app.context.representatives.length, 'dbo.Clientes', 'users-round')}
        ${kpi('Campanhas agendadas', scheduled.length, 'Próximas', 'calendar-clock')}
      </div>
      <div class="dashboard-grid">
        <section class="section-card"><div class="section-head"><div><span class="eyebrow">Em andamento</span><h3>Campanhas que pedem atenção</h3></div><button class="secondary-btn" data-view="campaigns">Ver todas</button></div>
          ${active.length ? `<div class="campaign-grid">${active.slice(0,4).map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha ativa', 'Crie uma campanha ou aguarde o início das campanhas agendadas.', '<button class="primary-btn" data-action="new-campaign">Nova campanha</button>')}
        </section>
        <aside><section class="section-card"><span class="eyebrow">Agenda</span><h3>Próximos fechamentos</h3><div class="agenda-list">${next.length ? next.map((campaign) => `<div class="agenda-item"><span class="agenda-dot"><i data-lucide="calendar-days"></i></span><span><strong>${esc(campaign.name)}</strong><small>${esc(selectedSupplierLabel(campaign))} · ${dateBR(campaign.end)}</small></span><b>${Math.max(0, daysUntil(campaign.end) || 0)}d</b></div>`).join('') : '<p class="hint">Nenhum fechamento próximo.</p>'}</div></section></aside>
      </div>`;
    icons($('#pageRoot'));
  }

  function kpi(label, value, detail, icon) {
    return `<div class="kpi-card"><span class="kpi-icon"><i data-lucide="${icon}"></i></span><div><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></div></div>`;
  }

  function renderCampaigns() {
    const search = norm(app.campaignSearch);
    const list = search ? app.campaigns.filter((campaign) => norm(`${campaign.name} ${selectedSupplierLabel(campaign)}`).includes(search)) : app.campaigns;
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Gestão</span><h2>Campanhas</h2><p>Crie, edite e acompanhe as campanhas de incentivo.</p></div><button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="campaignSearch" placeholder="Buscar campanha ou fornecedor" value="${esc(app.campaignSearch)}"></div></div>
      ${list.length ? `<div class="campaign-grid">${list.map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha encontrada', search ? 'A busca não encontrou resultados.' : 'Crie a primeira campanha para começar.', !search ? '<button class="primary-btn" data-action="new-campaign">Nova campanha</button>' : '')}`;
    icons($('#pageRoot'));
  }

  function renderRepresentatives() {
    const search = norm(app.representativeSearch);
    const list = app.context.representatives.filter((representative) => !search || norm(representative.name).includes(search));
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Base ativa</span><h2>Representantes</h2><p>Somente vendedores com pelo menos um cliente ativo.</p></div><button class="secondary-btn" data-action="refresh-context"><i data-lucide="refresh-cw"></i>Atualizar contexto</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="representativeSearch" placeholder="Buscar representante" value="${esc(app.representativeSearch)}"></div><span class="hint">${number(list.length)} representante(s)</span></div>
      <div class="table-wrap"><table><thead><tr><th>Representante</th><th>Status</th><th>Clientes ativos</th><th>Carteira total</th><th>Último pedido</th></tr></thead><tbody>${list.map((representative) => `<tr><td><strong>${esc(representative.name)}</strong></td><td><span class="badge active">Ativo</span></td><td>${number(representative.activeClients)}</td><td>${number(representative.portfolioClients)}</td><td>${representative.lastOrderDate ? new Date(representative.lastOrderDate).toLocaleDateString('pt-BR') : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    icons($('#pageRoot'));
  }

  function renderProducts() {
    const search = norm(app.productSearch);
    const list = app.context.products.filter((product) => !search || norm(`${product.id} ${product.name} ${product.supplierName} ${product.group} ${product.subgroup}`).includes(search));
    const visible = list.slice(0, 200);
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Contexto comercial</span><h2>Produtos</h2><p>Consulta instantânea sobre o contexto preparado no início da sessão.</p></div><button class="secondary-btn" data-action="refresh-context"><i data-lucide="refresh-cw"></i>Atualizar contexto</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="productPageSearch" placeholder="Buscar ID, produto, fornecedor, grupo ou subgrupo" value="${esc(app.productSearch)}"></div><span class="hint">Mostrando ${number(visible.length)} de ${number(list.length)}</span></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Produto</th><th>Fornecedor</th><th>Grupo</th><th>Subgrupo</th><th>Status</th></tr></thead><tbody>${visible.map((product) => `<tr><td>${number(product.id)}</td><td><strong>${esc(product.name)}</strong></td><td>${esc(product.supplierName)} · ${number(product.supplierId)}</td><td>${esc(product.group || '—')}</td><td>${esc(product.subgroup || '—')}</td><td>${esc(product.status || '—')}</td></tr>`).join('')}</tbody></table></div>`;
    icons($('#pageRoot'));
  }

  function renderView() {
    $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === app.view));
    const titles = { dashboard:'Visão geral', campaigns:'Campanhas', products:'Produtos', representatives:'Representantes' };
    $('#pageTitle').textContent = titles[app.view] || 'Campanhas';
    if (app.view === 'dashboard') renderDashboard();
    if (app.view === 'campaigns') renderCampaigns();
    if (app.view === 'products') renderProducts();
    if (app.view === 'representatives') renderRepresentatives();
  }

  function nextMonday() {
    const date = new Date(); date.setHours(12,0,0,0);
    const days = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + days);
    return date;
  }
  function inputDate(date) { return date.toISOString().slice(0,10); }

  function defaultGoal(scope = 'individual') {
    return { id:uid('goal'), scope, mode:'absolute', metric:'positivity', operator:'>=', value:scope === 'collective' ? 100 : 4 };
  }

  function defaultCampaign() {
    const start = nextMonday();
    const end = new Date(start); end.setDate(end.getDate() + 35);
    return {
      id:uid('campaign'), name:'', description:'', start:inputDate(start), end:inputDate(end),
      periodMode:'six_mondays',
      suppliers:[], participantMode:'all', representatives:[], rankingMetrics:['points','positivity'], rankingMode:'TOP_N_ELIGIBLE', topN:5,
      salesScopeMode:'supplier_all',
      goalMode:'both', collectiveGoals:[defaultGoal('collective')], individualGoals:[defaultGoal('individual')],
      rules:[], pointRules:[], categories:[],
      orderActivationRule:{
        enabled:false,
        name:'Benefício de primeira compra',
        baseCategoryId:'',
        baseMeasure:'distinct_products',
        baseMin:1,
        triggerCategoryId:'',
        triggerMeasure:'distinct_products',
        triggerMin:1,
        countMode:'first_per_client',
        firstPurchaseMode:'historical_trigger',
        discountType:'pending',
        discountValue:0,
      },
      tieBreaks:[{ metric:'positivity', direction:'desc' }, { metric:'revenue', direction:'desc' }], prizes:[],
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    };
  }

  function sixthMondayFrom(startRaw) {
    const start = startRaw ? new Date(`${startRaw}T12:00:00`) : null;
    if (!start || Number.isNaN(start.getTime())) return '';
    const end = new Date(start);
    end.setDate(end.getDate() + 35);
    return inputDate(end);
  }

  function normalizeCampaign(raw = {}) {
    const base = defaultCampaign();
    const legacySuppliers = raw.suppliers || (raw.supplier ? [raw.supplier] : raw.fornecedor ? [{ id:raw.fornecedorId || null, name:raw.fornecedor }] : []);
    const legacyCollective = raw.collectiveGoals || (raw.collectiveMeta ? [{ id:uid('goal'), scope:'collective', mode:['revenueGrowth','kgGrowth'].includes(raw.collectiveMeta.metric) ? 'growth_percent' : 'absolute', metric:String(raw.collectiveMeta.metric || 'positivity').replace('Growth',''), operator:'>=', value:Number(raw.collectiveMeta.value)||0 }] : []);
    const legacyIndividual = raw.individualGoals || (raw.individualMeta ? [{ id:uid('goal'), scope:'individual', mode:['revenueGrowth','kgGrowth'].includes(raw.individualMeta.metric) ? 'growth_percent' : 'absolute', metric:String(raw.individualMeta.metric || 'positivity').replace('Growth',''), operator:'>=', value:Number(raw.individualMeta.value)||0 }] : []);
    const normalizedStart = raw.start || raw.dataInicio || base.start;
    const periodMode = raw.periodMode === 'custom' ? 'custom' : 'six_mondays';
    const normalizedEnd = periodMode === 'custom'
      ? (raw.end || raw.dataFim || normalizedStart)
      : (sixthMondayFrom(normalizedStart) || base.end);
    return {
      ...base, ...raw,
      name:raw.name || raw.nome || '', description:raw.description || raw.descricao || '',
      periodMode,
      start:normalizedStart, end:normalizedEnd,
      suppliers:Array.isArray(legacySuppliers) ? legacySuppliers.map((supplier) => ({ id:Number(supplier.id ?? supplier.code ?? supplier.fornecedorId) || null, name:supplier.name || supplier.nome || supplier.fornecedor || 'Fornecedor', totalProducts:Number(supplier.totalProducts || supplier.totalProdutos)||0 })) : [],
      salesScopeMode:['supplier_all','selected_products'].includes(raw.salesScopeMode)
        ? raw.salesScopeMode
        : (Array.isArray(legacySuppliers) && legacySuppliers.length ? 'supplier_all' : 'selected_products'),
      rankingMetrics:Array.isArray(raw.rankingMetrics) ? raw.rankingMetrics : Array.isArray(raw.metricasRanking) ? raw.metricasRanking : [raw.metricaRanking || 'points'],
      collectiveGoals:Array.isArray(legacyCollective) ? legacyCollective : [], individualGoals:Array.isArray(legacyIndividual) ? legacyIndividual : [],
      rules:Array.isArray(raw.rules) ? raw.rules : [], pointRules:Array.isArray(raw.pointRules) ? raw.pointRules : [], categories:Array.isArray(raw.categories) ? raw.categories : [],
      orderActivationRule:{
        ...base.orderActivationRule,
        ...(raw.orderActivationRule || {}),
        // Campanhas antigas mantêm a semântica que já existia: primeira ativação dentro da campanha.
        firstPurchaseMode:raw.orderActivationRule?.firstPurchaseMode || (raw.orderActivationRule ? 'campaign_trigger' : base.orderActivationRule.firstPurchaseMode),
      },
      tieBreaks:Array.isArray(raw.tieBreaks) ? raw.tieBreaks : base.tieBreaks, prizes:Array.isArray(raw.prizes) ? raw.prizes : [],
    };
  }

  function calculatePeriods(campaignOrStart, endRaw = null, modeRaw = null) {
    const campaign = typeof campaignOrStart === 'object' && campaignOrStart
      ? campaignOrStart
      : { start:campaignOrStart, end:endRaw, periodMode:modeRaw || 'six_mondays' };

    const mode = campaign.periodMode === 'custom' ? 'custom' : 'six_mondays';
    const startRaw = campaign.start;
    const start = startRaw ? new Date(`${startRaw}T12:00:00`) : null;

    if (!start || Number.isNaN(start.getTime())) return { valid:false, error:'Informe a data inicial da campanha.' };

    if (mode === 'six_mondays') {
      if (start.getDay() !== 1) return { valid:false, error:'No modelo PMG, o início precisa ser uma segunda-feira.' };

      const currentLast = new Date(start); currentLast.setDate(currentLast.getDate() + 35);
      const currentEndExclusive = new Date(currentLast); currentEndExclusive.setDate(currentEndExclusive.getDate() + 1);
      const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 42);
      const previousLast = new Date(start); previousLast.setDate(previousLast.getDate() - 7);
      const previousEndExclusive = new Date(previousLast); previousEndExclusive.setDate(previousEndExclusive.getDate() + 1);

      return {
        valid:true, mode, days:36, weeks:6, mondays:6,
        currentStart:inputDate(start), currentEnd:inputDate(currentEndExclusive), currentLast:inputDate(currentLast),
        previousStart:inputDate(previousStart), previousEnd:inputDate(previousEndExclusive), previousLast:inputDate(previousLast),
        label:'Modelo PMG · 6 segundas-feiras',
        previousLabel:'Referência anterior · 6 segundas-feiras',
      };
    }

    const finish = campaign.end ? new Date(`${campaign.end}T12:00:00`) : null;
    if (!finish || Number.isNaN(finish.getTime())) return { valid:false, error:'Informe a data final da campanha.' };
    if (finish < start) return { valid:false, error:'A data final não pode ser anterior à data inicial.' };

    const days = Math.floor((finish - start) / 86400000) + 1;
    const currentEndExclusive = new Date(finish); currentEndExclusive.setDate(currentEndExclusive.getDate() + 1);
    const previousLast = new Date(start); previousLast.setDate(previousLast.getDate() - 1);
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - days);
    const previousEndExclusive = new Date(start);

    return {
      valid:true, mode, days,
      currentStart:inputDate(start), currentEnd:inputDate(currentEndExclusive), currentLast:inputDate(finish),
      previousStart:inputDate(previousStart), previousEnd:inputDate(previousEndExclusive), previousLast:inputDate(previousLast),
      label:`Período livre · ${days} dia${days === 1 ? '' : 's'}`,
      previousLabel:`Referência anterior · mesma duração (${days} dia${days === 1 ? '' : 's'})`,
    };
  }

  async function openWizard(id = null) {
    const modal = $('#modalBackdrop');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    app.wizard = {
      open:true, step:0, campaign:defaultCampaign(), supplierQuery:'', selectedCategoryId:null, selectedProducts:new Set(),
      productFilters:{ search:'', group:'', subgroup:'', status:'ATIVO' }, productVisibleLimit:100,
    };
    if (id) {
      const found = await DB.get('campanhas', id);
      if (found) app.wizard.campaign = normalizeCampaign(found);
      $('#modalTitle').textContent = 'Editar campanha';
    } else $('#modalTitle').textContent = 'Nova campanha';
    renderWizard();
    requestAnimationFrame(() => $('#campaignModal').focus?.());
  }

  function closeWizard() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    app.wizard = null;
  }

  function renderWizard() {
    if (!app.wizard) return;
    $('#wizardNav').innerHTML = STEPS.map((step, index) => `<button type="button" data-action="wizard-step" data-step="${index}" class="${app.wizard.step === index ? 'is-active' : ''} ${index < app.wizard.step ? 'is-done' : ''}"><span class="step-number">${index + 1}</span><span><strong>${step.title}</strong><small>${step.subtitle}</small></span></button>`).join('');
    $('#wizardProgress').style.width = `${((app.wizard.step + 1) / STEPS.length) * 100}%`;
    $('[data-action="previous-step"]').style.visibility = app.wizard.step === 0 ? 'hidden' : 'visible';
    $('[data-action="next-step"]').style.display = app.wizard.step === STEPS.length - 1 ? 'none' : 'inline-flex';
    $('[data-action="save-campaign"]').style.display = app.wizard.step === STEPS.length - 1 ? 'inline-flex' : 'none';
    const renderers = [renderGeneralStep, renderRulesStep, renderProductsStep, renderBenefitStep, renderFinalStep];
    $('#wizardStep').innerHTML = renderers[app.wizard.step]();
    const suppliers = app.wizard.campaign.suppliers || [];
    $('#modalFootStatus').textContent = suppliers.length ? `${suppliers.length} código(s) de fornecedor selecionado(s)` : 'Selecione ao menos um código de fornecedor.';
    icons($('#campaignModal'));
    if (app.wizard.step === 2) void loadVisibleImages();
  }

  function periodPreview(periods) {
    if (!periods.valid) return `<div class="hint" style="grid-column:1/-1;color:var(--danger)">${esc(periods.error)}</div>`;
    return `<div class="period-box"><span>${esc(periods.label || 'Campanha')}</span><strong>${dateBR(periods.currentStart)} a ${dateBR(periods.currentLast)}</strong></div><div class="period-arrow"><i data-lucide="arrow-left-right"></i></div><div class="period-box"><span>${esc(periods.previousLabel || 'Referência anterior')}</span><strong>${dateBR(periods.previousStart)} a ${dateBR(periods.previousLast)}</strong></div>`;
  }

  function renderGeneralStep() {
    const campaign = app.wizard.campaign;
    const periods = calculatePeriods(campaign);
    const customPeriod = campaign.periodMode === 'custom';
    return `<div class="step-head"><div><h3>Informações gerais</h3><p>Defina o período, selecione um ou mais códigos de fornecedor e determine os participantes.</p></div></div>
      <div class="form-grid">
        <div class="field"><label>Nome da campanha *</label><input id="campaignName" value="${esc(campaign.name)}" placeholder="Ex.: Campanha Camil Q3"></div>
        <div class="field"><label>Status calculado</label><input value="${campaignStatus(campaign).label}" disabled></div>
        <div class="field full"><label>Descrição ou regulamento</label><textarea id="campaignDescription" placeholder="Objetivo, observações e regras gerais…">${esc(campaign.description)}</textarea></div>
        <div class="field full"><label>Códigos de fornecedor participantes *</label>${supplierSelector()}</div>
        <div class="field full">
          <label>Modelo de período</label>
          <div class="period-mode-grid">
            ${choiceCard('period-mode','six_mondays','calendar-range','Modelo PMG · 6 segundas','Mantém o preenchimento automático atual: começa em uma segunda e termina na 6ª segunda-feira.',campaign.periodMode !== 'custom')}
            ${choiceCard('period-mode','custom','calendar-days','Período livre','Escolha qualquer data inicial e final. A referência anterior terá exatamente a mesma duração.',campaign.periodMode === 'custom')}
          </div>
        </div>
        <div class="field">
          <label>${customPeriod ? 'Data inicial da campanha *' : '1ª segunda-feira da campanha *'}</label>
          <div class="date-picker-control">
            <input id="campaignStart" type="date" value="${esc(campaign.start)}" aria-label="Escolher data inicial da campanha">
            <button type="button" class="date-picker-button" data-action="open-date-picker" data-target="campaignStart" title="Abrir calendário"><i data-lucide="calendar-days"></i></button>
          </div>
          <small class="hint">${customPeriod ? 'Pode ser qualquer dia da semana.' : 'No modelo PMG, a data inicial precisa ser uma segunda-feira.'}</small>
        </div>
        <div class="field">
          <label>${customPeriod ? 'Data final da campanha *' : '6ª segunda-feira · calculada automaticamente'}</label>
          <div class="date-picker-control ${customPeriod ? '' : 'is-readonly'}">
            <input id="campaignEnd" type="date" value="${esc(campaign.end)}" ${customPeriod ? '' : 'disabled'} aria-label="Escolher data final da campanha">
            ${customPeriod
              ? `<button type="button" class="date-picker-button" data-action="open-date-picker" data-target="campaignEnd" title="Abrir calendário"><i data-lucide="calendar-days"></i></button>`
              : `<span class="date-picker-button is-static"><i data-lucide="calendar-check-2"></i></span>`}
          </div>
          <small class="hint">${customPeriod ? 'A referência anterior é calculada automaticamente com a mesma quantidade de dias, imediatamente antes da campanha.' : 'Fechamento calculado automaticamente a partir da primeira segunda-feira.'}</small>
        </div>
        <div class="period-preview" id="periodPreview">${periodPreview(periods)}</div>
        <div class="field full"><label>Participantes</label><div class="choice-grid">
          ${choiceCard('participant-mode','all','users-round','Todos os representantes ativos','Usa automaticamente todos os vendedores ativos do contexto.',campaign.participantMode === 'all')}
          ${choiceCard('participant-mode','specific','user-round-check','Representantes específicos','Escolha manualmente quem participa.',campaign.participantMode === 'specific')}
        </div></div>
        ${campaign.participantMode === 'specific' ? representativeSelector() : ''}
      </div>`;
  }

  function supplierSelector() {
    const selected = app.wizard.campaign.suppliers || [];
    const selectedIds = new Set(selected.map((supplier) => String(supplier.id)));
    const query = norm(app.wizard.supplierQuery);
    const matches = app.context.suppliers.filter((supplier) => !query || norm(`${supplier.name} ${supplier.id}`).includes(query)).slice(0, 40);
    return `<div class="supplier-selection">
      <div class="supplier-selected">${selected.length ? selected.map((supplier) => `<span class="supplier-chip">${esc(supplier.name)} · cód. ${esc(supplier.id)}<button type="button" data-action="remove-supplier" data-id="${esc(supplier.id)}"><i data-lucide="x"></i></button></span>`).join('') : '<span class="hint">Nenhum código selecionado.</span>'}</div>
      <div class="supplier-search-row"><div class="search-field"><i data-lucide="search"></i><input id="supplierSearch" autocomplete="off" placeholder="Buscar nome ou código" value="${esc(app.wizard.supplierQuery)}"></div><span class="hint">${number(app.context.suppliers.length)} códigos no contexto</span></div>
      <div class="supplier-results">${matches.map((supplier) => `<button class="supplier-option ${selectedIds.has(String(supplier.id)) ? 'is-selected' : ''}" type="button" data-action="toggle-supplier" data-id="${esc(supplier.id)}"><span class="supplier-code">${esc(supplier.id)}</span><span><strong>${esc(supplier.name)}</strong><small>${number(supplier.activeProducts)} ativos · ${number(supplier.totalProducts)} produtos · ${number(supplier.groups.length)} grupos</small></span><span class="check"><i data-lucide="${selectedIds.has(String(supplier.id)) ? 'circle-check' : 'circle-plus'}"></i></span></button>`).join('') || '<div class="hint" style="padding:12px">Nenhum código encontrado.</div>'}</div>
    </div>`;
  }

  function choiceCard(action, value, icon, title, description, selected, order = null) {
    return `<button type="button" class="choice-card ${selected ? 'is-selected' : ''}" data-action="${action}" data-value="${value}"><span class="choice-icon"><i data-lucide="${icon}"></i></span><span><strong>${title}</strong><p>${description}</p></span>${order ? `<span class="choice-order">${order}</span>` : ''}</button>`;
  }

  function representativeSelector() {
    const selected = new Set(app.wizard.campaign.representatives || []);
    return `<div class="field full"><label>Representantes selecionados (${selected.size})</label><div class="search-field"><i data-lucide="search"></i><input id="wizardRepSearch" placeholder="Buscar nome ou ID"></div><div class="table-wrap" id="wizardRepList" style="max-height:280px;margin-top:8px"><table><tbody>${app.context.representatives.map((representative) => {
      const identity = sellerIdentity(representative.name);
      return `<tr data-rep-row="${esc(norm(`${identity.name} ${identity.code} ${representative.name}`))}"><td><input type="checkbox" data-representative="${esc(representative.name)}" ${selected.has(representative.name) ? 'checked' : ''}></td><td><strong>${esc(identity.name)}</strong>${identity.code ? `<small class="rep-code">ID ${esc(identity.code)}</small>` : ''}</td><td>${number(representative.activeClients)} clientes ativos</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }

  function renderRulesStep() {
    const campaign = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Ranking, metas e elegibilidade</h3><p>Selecione várias métricas de ranking por prioridade. Metas coletivas e individuais aceitam valores absolutos ou crescimento percentual.</p></div></div>
      <div class="subsection"><div class="subsection-head"><div><h4>Como o ranking principal será definido?</h4><p>Clique nas métricas na ordem de prioridade. A segunda e as próximas também funcionam como desempate inicial.</p></div></div>
        <div class="choice-grid">${RANKING_METRICS.map((metric) => { const index = campaign.rankingMetrics.indexOf(metric.id); return choiceCard('toggle-ranking',metric.id,metric.icon,metric.label,metric.description,index >= 0,index >= 0 ? index + 1 : null); }).join('')}</div>
        <div class="form-grid" style="margin-top:12px"><div class="field"><label>Modelo de classificação</label><select id="rankingMode"><option value="TOP_N_ELIGIBLE" ${campaign.rankingMode === 'TOP_N_ELIGIBLE' ? 'selected' : ''}>Top N entre os elegíveis</option><option value="TOP_N" ${campaign.rankingMode === 'TOP_N' ? 'selected' : ''}>Top N geral</option><option value="ALL_ELIGIBLE" ${campaign.rankingMode === 'ALL_ELIGIBLE' ? 'selected' : ''}>Todos que atingirem</option></select></div><div class="field"><label>Quantidade de classificados</label><input id="topN" type="number" min="1" value="${number(campaign.topN)}"></div></div>
      </div>

      <div class="subsection"><div class="subsection-head"><div><h4>Quais metas a campanha utiliza?</h4><p>É possível usar meta coletiva, individual, ambas ou nenhuma.</p></div></div><div class="choice-grid">
        ${choiceCard('goal-mode','none','circle-slash-2','Sem meta','O ranking é definido apenas pelas métricas e regras.',campaign.goalMode === 'none')}
        ${choiceCard('goal-mode','collective','users-round','Meta coletiva','Avalia o resultado agregado de todos os representantes.',campaign.goalMode === 'collective')}
        ${choiceCard('goal-mode','individual','user-round-check','Meta individual','Avalia cada representante separadamente.',campaign.goalMode === 'individual')}
        ${choiceCard('goal-mode','both','git-merge','Coletiva + individual','As duas condições são avaliadas.',campaign.goalMode === 'both')}
      </div></div>

      ${['collective','both'].includes(campaign.goalMode) ? goalBlock('collective', 'Metas coletivas', 'O total do grupo precisa atingir todas as condições configuradas.', campaign.collectiveGoals) : ''}
      ${['individual','both'].includes(campaign.goalMode) ? goalBlock('individual', 'Metas individuais', 'Cada vendedor precisa atingir todas as condições para ficar elegível.', campaign.individualGoals) : ''}

      <div class="subsection">
        <div class="subsection-head">
          <div>
            <h4>Pontos por desempenho</h4>
            <p>Use regras simples ou monte uma fórmula personalizada no estilo Excel, inclusive pontos por fardo, faixas e bônus condicionais.</p>
          </div>
          <div class="point-rule-actions">
            <button class="secondary-btn" type="button" data-action="add-point-rule"><i data-lucide="plus"></i>Regra simples</button>
            <button class="primary-btn" type="button" data-action="add-formula-point-rule"><i data-lucide="function-square"></i>Fórmula personalizada</button>
          </div>
        </div>
        ${campaign.pointRules.length ? `<div class="point-rule-list">${campaign.pointRules.map((rule) => pointRuleRow(rule, campaign)).join('')}</div>` : '<div class="hint">Nenhuma regra adicional de pontos. Exemplo de fórmula: <code>=FARDOS * 5</code>.</div>'}
      </div>

      <div class="subsection"><div class="subsection-head"><div><h4>Critérios de elegibilidade adicionais</h4><p>Essas regras eliminam ou habilitam representantes independentemente da ordem do ranking.</p></div><div class="template-bar">${[['positivity','Positivação mínima',4],['revenue','Faturamento mínimo',10000],['kg','Volume mínimo',100],['mix','Mix mínimo',100],['points','Pontos mínimos',400],['orders','Pedidos mínimos',5]].map(([metric,label,value]) => `<button type="button" data-action="add-rule-template" data-metric="${metric}" data-label="${label}" data-value="${value}">+ ${label}</button>`).join('')}</div></div>
        ${campaign.rules.length ? `<div class="rule-list">${campaign.rules.map(ruleRow).join('')}</div>` : '<div class="hint">Nenhum critério adicional configurado.</div>'}
      </div>`;
  }

  function goalBlock(scope, title, description, goals) {
    return `<div class="meta-block"><div class="meta-block-head"><div><h5>${title}</h5><span class="hint">${description}</span></div><button class="secondary-btn" type="button" data-action="add-goal" data-scope="${scope}"><i data-lucide="plus"></i>Adicionar condição</button></div>
      <div class="goal-list">${goals.map(goalRow).join('')}</div></div>`;
  }

  function goalRow(goal) {
    const metrics = goal.mode === 'growth_percent' ? GROWTH_METRICS : BASE_METRICS;
    return `<div class="goal-row" data-goal-id="${esc(goal.id)}" data-scope="${esc(goal.scope)}">
      <label>Forma de avaliação<select data-goal-field="mode"><option value="absolute" ${goal.mode === 'absolute' ? 'selected' : ''}>Valor absoluto</option><option value="growth_percent" ${goal.mode === 'growth_percent' ? 'selected' : ''}>Crescimento percentual</option></select></label>
      <label>Métrica<select data-goal-field="metric">${metrics.map(([id,label]) => `<option value="${id}" ${goal.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Condição<select data-goal-field="operator"><option value=">=" ${goal.operator === '>=' ? 'selected' : ''}>Maior ou igual</option><option value=">" ${goal.operator === '>' ? 'selected' : ''}>Maior que</option><option value="<=" ${goal.operator === '<=' ? 'selected' : ''}>Menor ou igual</option></select></label>
      <label>Valor<input data-goal-field="value" type="number" step="0.01" value="${Number(goal.value) || 0}"></label>
      <button class="row-remove" type="button" data-action="remove-goal" data-scope="${esc(goal.scope)}" data-id="${esc(goal.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function pointRuleRow(rule, campaign = app.wizard.campaign) {
    if (rule.mode === 'formula') {
      const categoryOptions = (campaign.categories || []).map((category) =>
        `<option value="${esc(category.id)}" ${rule.formulaCategoryId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`
      ).join('');

      const formula = rule.formula || '=FARDOS * 5';
      const packMode = rule.packMode || 'manual';

      return `<div class="point-rule-row formula-rule-row" data-point-rule-id="${esc(rule.id)}">
        <div class="formula-rule-header">
          <span class="formula-badge"><i data-lucide="function-square"></i>ƒx</span>
          <label>Nome da regra
            <input data-point-field="name" value="${esc(rule.name || 'Pontos por fardo')}" placeholder="Ex.: 5 pontos por fardo">
          </label>
          <button class="row-remove" type="button" data-action="remove-point-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
        </div>

        <div class="formula-rule-grid">
          <label>Escopo dos produtos
            <select data-point-field="formulaCategoryId">
              <option value="" ${!rule.formulaCategoryId ? 'selected' : ''}>Todos os produtos da campanha</option>
              ${categoryOptions}
            </select>
          </label>

          <label>Conversão para fardo
            <select data-point-field="packMode">
              <option value="manual" ${packMode === 'manual' ? 'selected' : ''}>Quantidade manual de unidades</option>
              <option value="master" ${packMode === 'master' ? 'selected' : ''}>Campo Master de cada produto</option>
              <option value="factor" ${packMode === 'factor' ? 'selected' : ''}>Fator Unidade de cada produto</option>
            </select>
          </label>

          ${packMode === 'manual' ? `<label>Unidades por fardo
            <input data-point-field="unitsPerPack" type="number" min="0.0001" step="0.01" value="${Number(rule.unitsPerPack) || 1}">
          </label>` : `<div class="formula-pack-note">
            <i data-lucide="database"></i>
            <span>O divisor será lido de <strong>dbo.Produtos.${packMode === 'master' ? '[Master]' : '[Fator Unidade]'}</strong> para cada SKU.</span>
          </div>`}
        </div>

        <label class="formula-expression-label">
          <span>Fórmula de pontos</span>
          <div class="formula-expression">
            <span class="formula-fx">ƒx</span>
            <input data-point-field="formula" value="${esc(formula)}" spellcheck="false" placeholder="=FARDOS * 5">
          </div>
        </label>

        <div class="formula-token-box">
          <span>Variáveis disponíveis</span>
          <div class="formula-token-list">
            ${FORMULA_VARIABLES.map(([token,label]) => `<button type="button" data-action="insert-formula-token" data-rule-id="${esc(rule.id)}" data-token="${token}" title="${esc(label)}">${token}</button>`).join('')}
          </div>
        </div>

        <div class="formula-token-box functions">
          <span>Funções</span>
          <div class="formula-token-list">
            ${FORMULA_FUNCTIONS.map(([token,label]) => `<button type="button" data-action="insert-formula-token" data-rule-id="${esc(rule.id)}" data-token="${token}(" title="${esc(label)}">${token}</button>`).join('')}
          </div>
        </div>

        <div class="formula-examples">
          <span><strong>5 pontos por fardo:</strong> <code>=FARDOS * 5</code></span>
          <span><strong>1 fardo = 6 unidades:</strong> <code>=INT(UNIDADES / 6) * 5</code></span>
          <span><strong>Bônus após 10 fardos:</strong> <code>=SE(FARDOS &gt;= 10; 100 + (FARDOS - 10) * 5; FARDOS * 3)</code></span>
        </div>
      </div>`;
    }

    return `<div class="point-rule-row" data-point-rule-id="${esc(rule.id)}">
      <label>Origem<select data-point-field="source">${POINT_SOURCES.map(([id,label]) => `<option value="${id}" ${rule.source === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Forma<select data-point-field="mode"><option value="per_unit" ${rule.mode === 'per_unit' ? 'selected' : ''}>Pontos a cada quantidade</option><option value="fixed_if_target" ${rule.mode === 'fixed_if_target' ? 'selected' : ''}>Pontos fixos ao atingir</option><option value="formula">Fórmula personalizada</option></select></label>
      <label>${rule.mode === 'fixed_if_target' ? 'Meta' : 'A cada'}<input data-point-field="basis" type="number" step="0.01" min="0.01" value="${Number(rule.basis) || 1}"></label>
      <label>Pontos<input data-point-field="points" type="number" step="0.01" value="${Number(rule.points) || 100}"></label>
      <button class="row-remove" type="button" data-action="remove-point-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function ruleRow(rule) {
    return `<div class="rule-row" data-rule-id="${esc(rule.id)}">
      <label>Nome<input data-rule-field="name" value="${esc(rule.name)}"></label>
      <label>Métrica<select data-rule-field="metric">${BASE_METRICS.map(([id,label]) => `<option value="${id}" ${rule.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Condição<select data-rule-field="operator"><option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>&gt;=</option><option value=">" ${rule.operator === '>' ? 'selected' : ''}>&gt;</option><option value="<=" ${rule.operator === '<=' ? 'selected' : ''}>&lt;=</option></select></label>
      <label>Valor<input data-rule-field="value" type="number" step="0.01" value="${Number(rule.value) || 0}"></label>
      <button class="row-remove" type="button" data-action="remove-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function selectedSupplierIds() {
    return new Set((app.wizard?.campaign.suppliers || []).map((supplier) => Number(supplier.id)).filter(Number.isFinite));
  }

  function productsForCampaign() {
    const supplierIds = selectedSupplierIds();
    if (!supplierIds.size) return [];
    return app.context.products.filter((product) => supplierIds.has(Number(product.supplierId)));
  }

  function filteredCampaignProducts() {
    const filters = app.wizard.productFilters;
    const search = norm(filters.search);
    const group = norm(filters.group);
    const subgroup = norm(filters.subgroup);
    const status = norm(filters.status);
    return productsForCampaign().filter((product) => {
      if (group && norm(product.group) !== group) return false;
      if (subgroup && norm(product.subgroup) !== subgroup) return false;
      if (status && !norm(product.status).includes(status)) return false;
      if (search && !norm(`${product.id} ${product.name} ${product.supplierName} ${product.manufacturer} ${product.group} ${product.subgroup}`).includes(search)) return false;
      return true;
    });
  }

  function productFilterOptions(products) {
    const groups = [...new Set(products.map((product) => product.group).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const subgroups = [...new Set(products.filter((product) => !app.wizard.productFilters.group || norm(product.group) === norm(app.wizard.productFilters.group)).map((product) => product.subgroup).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    return { groups, subgroups };
  }

  function renderProductsStep() {
    const campaign = app.wizard.campaign;
    if (!campaign.suppliers.length) return `<div class="step-head"><div><h3>Produtos e categorias</h3><p>Selecione pelo menos um código de fornecedor na primeira etapa.</p></div></div><div class="empty-state"><h3>Fornecedor não definido</h3><p>Volte para Informações gerais e escolha os códigos participantes.</p></div>`;
    const baseProducts = productsForCampaign();
    const filtered = filteredCampaignProducts();
    const visible = filtered.slice(0, app.wizard.productVisibleLimit);
    const options = productFilterOptions(baseProducts);
    const selectedCount = app.wizard.selectedProducts.size;
    return `<div class="step-head"><div><h3>Produtos, categorias e mix</h3><p>O catálogo já está no navegador. Filtrar, pesquisar e adicionar produtos não dispara novas consultas ao SQL.</p></div><span class="badge active">${number(baseProducts.length)} produtos disponíveis</span></div>
      <div class="sales-scope-card">
        <div class="sales-scope-head"><span class="eyebrow">Escopo da apuração</span><h4>O que entra em faturamento, KG e clientes?</h4><p>As categorias podem servir para mix/pontos sem necessariamente limitar toda a venda. Escolha explicitamente.</p></div>
        <div class="sales-scope-options">
          <button type="button" class="scope-choice ${campaign.salesScopeMode === 'supplier_all' ? 'selected' : ''}" data-action="sales-scope" data-value="supplier_all"><i data-lucide="boxes"></i><span><strong>Todos os produtos dos fornecedores</strong><small>Usa todos os produtos ligados aos códigos de fornecedor selecionados.</small></span></button>
          <button type="button" class="scope-choice ${campaign.salesScopeMode === 'selected_products' ? 'selected' : ''}" data-action="sales-scope" data-value="selected_products"><i data-lucide="list-checks"></i><span><strong>Somente produtos das categorias</strong><small>Somente IDs arrastados para as categorias entram nos números.</small></span></button>
        </div>
      </div>
      <div class="product-layout">
        <section class="catalog-panel">
          <div class="panel-head"><h4>Catálogo dos códigos selecionados</h4><p>${esc(campaign.suppliers.map((supplier) => `${supplier.name} (${supplier.id})`).join(' · '))}</p></div>
          <div class="product-filters">
            <input id="productSearch" placeholder="Buscar ID, produto, fabricante ou grupo" value="${esc(app.wizard.productFilters.search)}">
            <select id="productGroup"><option value="">Todos os grupos</option>${options.groups.map((value) => `<option value="${esc(value)}" ${app.wizard.productFilters.group === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
            <select id="productSubgroup"><option value="">Todos os subgrupos</option>${options.subgroups.map((value) => `<option value="${esc(value)}" ${app.wizard.productFilters.subgroup === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
          </div>
          <div class="catalog-actions"><span>Mostrando ${number(visible.length)} de ${number(filtered.length)} · ${selectedCount} selecionado(s)</span><span style="display:flex;gap:6px;align-items:center"><select id="targetCategorySelect" style="min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--surface);padding:6px;font-size:9.5px"><option value="">Categoria de destino</option>${campaign.categories.map((category) => `<option value="${esc(category.id)}" ${app.wizard.selectedCategoryId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select><button class="secondary-btn" type="button" data-action="add-selected-products">Adicionar selecionados</button><button class="secondary-btn" type="button" data-action="add-all-filtered">Adicionar todos filtrados</button></span></div>
          <div class="product-grid">${visible.map(productCard).join('') || '<div class="hint">Nenhum produto encontrado.</div>'}</div>
        </section>
        <section class="categories-panel">
          <div class="panel-head"><h4>Categorias da campanha</h4><p>Crie grupos como Pescados, Azeites, Cafés e Massas. O mix verifica o mínimo definido em cada categoria.</p></div>
          <div class="category-toolbar"><input id="newCategoryName" placeholder="Nome da nova categoria"><button class="primary-btn" type="button" data-action="add-category"><i data-lucide="plus"></i>Nova categoria</button></div>
          ${campaign.categories.length ? `<div class="category-list">${campaign.categories.map(categoryCard).join('')}</div>` : '<div class="empty-state" style="margin:10px"><h3>Nenhuma categoria</h3><p>Crie uma categoria e arraste produtos para ela.</p></div>'}
        </section>
      </div>`;
  }


  function benefitCategorySummary(category, emptyText = 'Nenhuma categoria selecionada') {
    if (!category) return `<div class="benefit-category-empty">${esc(emptyText)}</div>`;
    const products = category.products || [];
    return `<div class="benefit-category-summary">
      <div><strong>${esc(category.name)}</strong><span>${number(products.length)} produto(s)</span></div>
      <div class="benefit-product-mini-list">${products.slice(0, 8).map((product) => `<span>${esc(product.name)}</span>`).join('')}${products.length > 8 ? `<small>+${number(products.length - 8)} outros</small>` : ''}</div>
    </div>`;
  }

  function haraldFortunataPresetInfo() {
    const products = productsForCampaign();
    const supplierHasHarald = (app.wizard?.campaign?.suppliers || []).some((supplier) => Number(supplier.id) === 48 || norm(supplier.name).includes('harald'));
    if (!supplierHasHarald) return { available:false, trigger:[], benefit:[] };
    const trigger = products.filter((product) => norm(product.name).includes('fortunata'));
    const benefit = products.filter((product) => norm(product.name).includes('forneavel') && !norm(product.name).includes('fortunata'));
    return { available:trigger.length > 0 && benefit.length > 0, trigger, benefit };
  }

  function applyHaraldFortunataPreset() {
    if (!app.wizard) return;
    const preset = haraldFortunataPresetInfo();
    if (!preset.available) return toast('Não encontrei Fortunata e forneáveis Harald no catálogo carregado.', 'warning');

    const campaign = app.wizard.campaign;
    const findOrCreate = (name, products) => {
      let category = campaign.categories.find((item) => norm(item.name) === norm(name));
      if (!category) {
        category = { id:uid('category'), name, requiredMix:false, minDistinct:1, pointUnit:'none', pointValue:0, products:[] };
        campaign.categories.push(category);
      }
      category.products = products.map((product) => ({ ...product }));
      category.requiredMix = false;
      return category;
    };

    const triggerCategory = findOrCreate('Fortunata · produto ativador', preset.trigger);
    const benefitCategory = findOrCreate('Forneáveis Harald · recebem desconto', preset.benefit);

    campaign.salesScopeMode = 'supplier_all';
    campaign.orderActivationRule = {
      ...campaign.orderActivationRule,
      enabled:true,
      name:'Harald + Fortunata · benefício de primeira compra',
      baseCategoryId:benefitCategory.id,
      baseMeasure:'distinct_products',
      baseMin:1,
      triggerCategoryId:triggerCategory.id,
      triggerMeasure:'distinct_products',
      triggerMin:1,
      countMode:'first_per_client',
      firstPurchaseMode:'historical_trigger',
      discountType:'pending',
      discountValue:0,
    };

    renderWizard();
    toast(`${preset.trigger.length} Fortunata e ${preset.benefit.length} forneáveis configurados.`);
  }

  function renderBenefitStep() {
    const campaign = app.wizard.campaign;
    const rule = campaign.orderActivationRule || {};
    const preset = haraldFortunataPresetInfo();

    return `<div class="step-head">
      <div>
        <h3>Benefício de primeira compra</h3>
        <p>Configure uma linha que libera desconto e os produtos que recebem o benefício. A apuração identifica cliente por cliente e pode ser exportada.</p>
      </div>
      ${preset.available ? `<button type="button" class="secondary-btn preset-benefit-btn" data-action="apply-harald-fortunata"><i data-lucide="wand-sparkles"></i>Preset Harald + Fortunata</button>` : ''}
    </div>
    ${preset.available ? `<div class="fortunata-detected">
      <i data-lucide="scan-search"></i>
      <div><strong>Catálogo Harald reconhecido</strong><span>Encontrei ${number(preset.trigger.length)} produto(s) Fortunata e ${number(preset.benefit.length)} forneável(is) elegível(is). O preset cria as duas categorias sem limitar o faturamento geral da campanha.</span></div>
    </div>` : ''}
    ${activationRulePanel(campaign)}`;
  }

  function activationRulePanel(campaign) {
    const rule = campaign.orderActivationRule || {};
    const optionHtml = (selected) => (campaign.categories || []).map((category) =>
      `<option value="${esc(category.id)}" ${category.id === selected ? 'selected' : ''}>${esc(category.name)} · ${(category.products || []).length} produto(s)</option>`
    ).join('');

    const benefitCategory = campaign.categories.find((category) => category.id === rule.baseCategoryId);
    const triggerCategory = campaign.categories.find((category) => category.id === rule.triggerCategoryId);

    const discountText = rule.discountType === 'percent'
      ? `${number(rule.discountValue, 2)}% sobre os produtos beneficiados`
      : rule.discountType === 'fixed_per_piece'
        ? `${money2(rule.discountValue)} por peça beneficiada`
        : rule.discountType === 'fixed'
          ? `${money2(rule.discountValue)} por pedido`
          : 'Valor ainda a definir';

    return `<section class="activation-rule-card first-purchase-rule ${rule.enabled ? 'is-enabled' : ''}">
      <div class="activation-rule-head">
        <div>
          <span class="eyebrow">Regra especial</span>
          <h4>Primeira compra com produto ativador</h4>
          <p>O cliente recebe desconto nos produtos beneficiados quando inclui o produto ativador no primeiro pedido elegível.</p>
        </div>
        <button type="button" class="${rule.enabled ? 'primary-btn' : 'secondary-btn'}" data-action="toggle-activation-rule">
          <i data-lucide="${rule.enabled ? 'toggle-right' : 'toggle-left'}"></i>${rule.enabled ? 'Benefício ativo' : 'Ativar benefício'}
        </button>
      </div>

      ${rule.enabled ? `<div class="activation-rule-body">
        <div class="activation-flow benefit-flow">
          <div class="activation-flow-card trigger">
            <span>1 · Produto ativador</span>
            <strong>${esc(triggerCategory?.name || 'Selecione a categoria Fortunata')}</strong>
            <small>Precisa aparecer no primeiro pedido considerado.</small>
          </div>
          <i data-lucide="plus"></i>
          <div class="activation-flow-card base">
            <span>2 · Produtos com benefício</span>
            <strong>${esc(benefitCategory?.name || 'Selecione os forneáveis')}</strong>
            <small>São os itens que recebem o desconto no mesmo pedido.</small>
          </div>
          <i data-lucide="arrow-right"></i>
          <div class="activation-flow-card success">
            <span>3 · Benefício</span>
            <strong>${esc(discountText)}</strong>
            <small>A utilização é registrada por cliente e pedido.</small>
          </div>
        </div>

        <div class="activation-config-grid benefit-config-grid">
          <label class="wide-field">Nome da mecânica
            <input data-activation-field="name" value="${esc(rule.name || 'Benefício de primeira compra')}" placeholder="Ex.: Harald + Fortunata">
          </label>

          <label>Produto/linha que libera o benefício
            <select data-activation-field="triggerCategoryId"><option value="">Selecione</option>${optionHtml(rule.triggerCategoryId)}</select>
          </label>

          <label>Mínimo do ativador
            <input data-activation-field="triggerMin" type="number" min="1" step="1" value="${Number(rule.triggerMin) || 1}">
          </label>

          <label>Produtos que recebem desconto
            <select data-activation-field="baseCategoryId"><option value="">Selecione</option>${optionHtml(rule.baseCategoryId)}</select>
          </label>

          <label>Mínimo de produtos beneficiados
            <input data-activation-field="baseMin" type="number" min="1" step="1" value="${Number(rule.baseMin) || 1}">
          </label>

          <label>O que significa “primeira compra”
            <select data-activation-field="firstPurchaseMode">
              <option value="historical_trigger" ${rule.firstPurchaseMode === 'historical_trigger' ? 'selected' : ''}>Cliente nunca comprou o ativador antes da campanha</option>
              <option value="campaign_trigger" ${rule.firstPurchaseMode === 'campaign_trigger' ? 'selected' : ''}>Primeira compra do ativador dentro da campanha</option>
            </select>
          </label>

          <label>Tipo de desconto
            <select data-activation-field="discountType">
              <option value="pending" ${rule.discountType === 'pending' ? 'selected' : ''}>Valor ainda a definir</option>
              <option value="percent" ${rule.discountType === 'percent' ? 'selected' : ''}>Percentual sobre itens beneficiados</option>
              <option value="fixed_per_piece" ${rule.discountType === 'fixed_per_piece' ? 'selected' : ''}>R$ por peça beneficiada</option>
              <option value="fixed" ${rule.discountType === 'fixed' ? 'selected' : ''}>R$ fixo no pedido</option>
            </select>
          </label>

          <label>Valor do desconto
            <input data-activation-field="discountValue" type="number" min="0" step="0.01" value="${Number(rule.discountValue) || 0}" ${rule.discountType === 'pending' ? 'disabled' : ''}>
          </label>
        </div>

        <div class="benefit-rule-columns">
          <div>
            <span class="eyebrow">Ativador</span>
            ${benefitCategorySummary(triggerCategory, 'Escolha a categoria com Fortunata')}
          </div>
          <div>
            <span class="eyebrow">Recebem desconto</span>
            ${benefitCategorySummary(benefitCategory, 'Escolha a categoria com os forneáveis')}
          </div>
        </div>

        <div class="activation-explainer">
          <i data-lucide="badge-percent"></i>
          <div>
            <strong>Regra operacional</strong>
            <p>O sistema olha a primeira compra do produto ativador por cliente. Se esse pedido também contiver produtos beneficiados, registra o benefício como utilizado e calcula o desconto quando o valor estiver configurado.</p>
            <small>Se a primeira compra do ativador ocorrer sem nenhum produto beneficiado, o relatório marca isso separadamente. O PMG Connect apura e exporta; ele não altera preço no ERP.</small>
          </div>
        </div>
      </div>` : `<div class="activation-rule-preview">
        <i data-lucide="badge-percent"></i>
        <span><strong>Exemplo Harald + Fortunata</strong><small>1 Fortunata no primeiro pedido + forneáveis elegíveis = desconto nos forneáveis daquele pedido. Depois disso, o benefício fica consumido para o cliente.</small></span>
      </div>`}
    </section>`;
  }
  function productCard(product) {
    const selected = app.wizard.selectedProducts.has(Number(product.id));
    const visual = app.imageCache.get(String(product.id));
    return `<label class="product-card ${selected ? 'is-selected' : ''}" draggable="true" data-product-id="${product.id}"><input class="product-check" type="checkbox" data-product-select="${product.id}" ${selected ? 'checked' : ''}><span class="product-image">${visual?.image ? `<img loading="lazy" src="${esc(imageUrl(visual.image))}" alt="">` : '<i data-lucide="package"></i>'}</span><span class="product-info"><strong>${esc(product.name)}</strong><small>${product.id} · ${esc(product.supplierName)} · ${esc(product.group || 'Sem grupo')}</small></span></label>`;
  }

  function categoryCard(category) {
    return `<article class="category-card" data-category-id="${esc(category.id)}"><div class="category-head"><i data-lucide="grip-vertical"></i><input type="text" data-category-field="name" value="${esc(category.name)}"><span class="badge active">${number((category.products || []).length)} produto(s)</span><button class="icon-btn" type="button" data-action="remove-category" data-id="${esc(category.id)}"><i data-lucide="trash-2"></i></button></div>
      <div class="category-options">
        <label>Participa do mix<select data-category-field="requiredMix"><option value="true" ${category.requiredMix !== false ? 'selected' : ''}>Obrigatória</option><option value="false" ${category.requiredMix === false ? 'selected' : ''}>Não obrigatória</option></select></label>
        <label>Mín. produtos distintos<input data-category-field="minDistinct" type="number" min="1" value="${Number(category.minDistinct) || 1}"></label>
        <label>Pontuação por<select data-category-field="pointUnit"><option value="none" ${category.pointUnit === 'none' ? 'selected' : ''}>Sem pontos</option><option value="pieces" ${category.pointUnit === 'pieces' ? 'selected' : ''}>Peça</option><option value="kg" ${category.pointUnit === 'kg' ? 'selected' : ''}>KG</option><option value="revenue" ${category.pointUnit === 'revenue' ? 'selected' : ''}>R$ vendido</option><option value="item" ${category.pointUnit === 'item' ? 'selected' : ''}>Produto distinto</option></select></label>
        <label>Pontos<input data-category-field="pointValue" type="number" step="0.01" value="${Number(category.pointValue) || 0}"></label>
      </div>
      <div class="category-products" data-category-drop="${esc(category.id)}">${(category.products || []).length ? category.products.map((product) => productChip(product, category.id)).join('') : '<span class="drop-hint">Arraste produtos para esta categoria</span>'}</div></article>`;
  }

  function productChip(product, categoryId) {
    const visual = app.imageCache.get(String(product.id));
    return `<span class="product-chip">${visual?.image || product.image ? `<img loading="lazy" src="${esc(imageUrl(visual?.image || product.image))}" alt="">` : ''}<span>${esc(product.name)}</span><button type="button" data-action="remove-product-category" data-category-id="${esc(categoryId)}" data-product-id="${product.id}"><i data-lucide="x"></i></button></span>`;
  }

  function imageUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return `/img-proxy?url=${encodeURIComponent(url)}`;
    return url.startsWith('/') ? url : `/${url}`;
  }

  async function loadVisibleImages() {
    if (!app.wizard || app.wizard.step !== 2) return;
    const ids = new Set(filteredCampaignProducts().slice(0, app.wizard.productVisibleLimit).map((product) => String(product.id)));
    for (const category of app.wizard.campaign.categories) for (const product of category.products || []) ids.add(String(product.id));
    const missing = [...ids].filter((id) => !app.imageCache.has(id) && !app.imageAttempted.has(id));
    if (!missing.length) return;
    let changed = false;
    for (let index = 0; index < missing.length; index += 60) {
      const batch = missing.slice(index, index + 60);
      batch.forEach((id) => app.imageAttempted.add(id));
      const key = batch.join(',');
      if (app.imageInFlight.has(key)) continue;
      const promise = fetch(`${VISUAL_ENDPOINT}?ids=${encodeURIComponent(key)}&limite=60`).then((response) => response.ok ? response.json() : []).then((items) => {
        for (const item of Array.isArray(items) ? items : []) { app.imageCache.set(String(item.id), item); changed = true; }
      }).catch(() => {}).finally(() => app.imageInFlight.delete(key));
      app.imageInFlight.set(key, promise);
      await promise;
    }
    if (changed && app.wizard?.step === 2) { syncCurrentStep(); renderWizard(); }
  }

  function renderFinalStep() {
    const campaign = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Desempate e premiação</h3><p>Defina a ordem final dos critérios e registre a premiação de cada posição.</p></div></div>
      <div class="subsection"><div class="subsection-head"><div><h4>Ordem de desempate</h4><p>Os critérios são aplicados de cima para baixo depois das métricas principais.</p></div><button class="secondary-btn" type="button" data-action="add-tie"><i data-lucide="plus"></i>Adicionar critério</button></div>
        <div class="tie-list">${campaign.tieBreaks.map((item, index) => `<div class="tie-row"><span class="tie-order">${index + 1}</span><select data-tie-field="metric" data-index="${index}">${TIE_OPTIONS.map(([id,label]) => `<option value="${id}" ${item.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-tie-field="direction" data-index="${index}"><option value="desc" ${item.direction === 'desc' ? 'selected' : ''}>Maior primeiro</option><option value="asc" ${item.direction === 'asc' ? 'selected' : ''}>Menor primeiro</option></select><button class="icon-btn" type="button" data-action="move-tie-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button><button class="icon-btn" type="button" data-action="remove-tie" data-index="${index}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<div class="hint">Nenhum critério adicional.</div>'}</div>
      </div>
      <div class="subsection"><div class="subsection-head"><div><h4>Premiação</h4><p>Registre valores, produtos, vouchers ou descrições livres.</p></div><button class="secondary-btn" type="button" data-action="add-prize"><i data-lucide="plus"></i>Adicionar prêmio</button></div>
        <div class="prize-list">${campaign.prizes.map((prize, index) => `<div class="prize-row"><input data-prize-field="position" data-index="${index}" type="number" min="1" value="${Number(prize.position) || index + 1}"><select data-prize-field="type" data-index="${index}"><option value="money" ${prize.type === 'money' ? 'selected' : ''}>Dinheiro</option><option value="voucher" ${prize.type === 'voucher' ? 'selected' : ''}>Vale/Voucher</option><option value="product" ${prize.type === 'product' ? 'selected' : ''}>Produto</option><option value="other" ${prize.type === 'other' ? 'selected' : ''}>Descrição livre</option></select><input data-prize-field="description" data-index="${index}" value="${esc(prize.description || '')}" placeholder="Ex.: R$ 1.000 ou Smart TV"><button class="icon-btn" type="button" data-action="remove-prize" data-index="${index}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<div class="hint">Nenhuma premiação registrada.</div>'}</div>
      </div>
      <div class="meta-block"><div class="meta-block-head"><div><h5>Resumo da campanha</h5><span class="hint">Revise antes de salvar.</span></div></div><div class="campaign-meta" style="margin-top:10px"><div><span>Fornecedores</span><strong>${number(campaign.suppliers.length)}</strong></div><div><span>Categorias</span><strong>${number(campaign.categories.length)}</strong></div><div><span>Métricas de ranking</span><strong>${number(campaign.rankingMetrics.length)}</strong></div></div></div>`;
  }

  function syncCurrentStep() {
    if (!app.wizard) return;
    const campaign = app.wizard.campaign;
    if (app.wizard.step === 0) {
      campaign.name = $('#campaignName')?.value.trim() || campaign.name;
      campaign.description = $('#campaignDescription')?.value.trim() || '';
      campaign.start = $('#campaignStart')?.value || campaign.start;
      campaign.end = campaign.periodMode === 'custom'
        ? ($('#campaignEnd')?.value || campaign.end || campaign.start)
        : (sixthMondayFrom(campaign.start) || campaign.end);
      campaign.representatives = $$('[data-representative]:checked').map((input) => input.dataset.representative);
    }
    if (app.wizard.step === 1) {
      campaign.rankingMode = $('#rankingMode')?.value || campaign.rankingMode;
      campaign.topN = Math.max(1, Number($('#topN')?.value) || 1);
      syncGoals(); syncPointRules(); syncEligibilityRules();
    }
    if (app.wizard.step === 2) syncCategories();
    if (app.wizard.step === 3) syncActivationRule();
    if (app.wizard.step === 4) syncFinalStep();
  }

  function syncGoals() {
    for (const row of $$('.goal-row')) {
      const list = row.dataset.scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals;
      const goal = list.find((item) => item.id === row.dataset.goalId);
      if (!goal) continue;
      for (const field of $$('[data-goal-field]', row)) goal[field.dataset.goalField] = field.dataset.goalField === 'value' ? Number(field.value) || 0 : field.value;
    }
  }
  function syncPointRules() {
    for (const row of $$('.point-rule-row')) {
      const rule = app.wizard.campaign.pointRules.find((item) => item.id === row.dataset.pointRuleId);
      if (!rule) continue;
      for (const field of $$('[data-point-field]', row)) {
        const name = field.dataset.pointField;
        rule[name] = ['basis','points','unitsPerPack'].includes(name) ? Number(field.value) || 0 : field.value;
      }
    }
  }
  function syncEligibilityRules() {
    for (const row of $$('.rule-row')) {
      const rule = app.wizard.campaign.rules.find((item) => item.id === row.dataset.ruleId);
      if (!rule) continue;
      for (const field of $$('[data-rule-field]', row)) rule[field.dataset.ruleField] = field.dataset.ruleField === 'value' ? Number(field.value) || 0 : field.value;
    }
  }
  function syncCategories() {
    for (const card of $$('.category-card')) {
      const category = app.wizard.campaign.categories.find((item) => item.id === card.dataset.categoryId);
      if (!category) continue;
      for (const field of $$('[data-category-field]', card)) {
        const name = field.dataset.categoryField;
        if (name === 'requiredMix') category[name] = field.value === 'true';
        else if (['minDistinct','pointValue'].includes(name)) category[name] = Number(field.value) || 0;
        else category[name] = field.value;
      }
    }
  }
  function syncActivationRule() {
    if (!app.wizard?.campaign?.orderActivationRule) return;
    const rule = app.wizard.campaign.orderActivationRule;
    for (const field of $$('[data-activation-field]')) {
      const name = field.dataset.activationField;
      rule[name] = ['baseMin','triggerMin','discountValue'].includes(name) ? Number(field.value) || 0 : field.value;
      rule.countMode = 'first_per_client';
      rule.baseMeasure = rule.baseMeasure || 'distinct_products';
      rule.triggerMeasure = rule.triggerMeasure || 'distinct_products';
    }
  }
  function syncFinalStep() {
    for (const field of $$('[data-tie-field]')) {
      const item = app.wizard.campaign.tieBreaks[Number(field.dataset.index)];
      if (item) item[field.dataset.tieField] = field.value;
    }
    for (const field of $$('[data-prize-field]')) {
      const item = app.wizard.campaign.prizes[Number(field.dataset.index)];
      if (item) item[field.dataset.prizeField] = field.dataset.prizeField === 'position' ? Number(field.value) || 1 : field.value;
    }
  }

  function validateStep(step = app.wizard.step) {
    syncCurrentStep();
    const campaign = app.wizard.campaign;
    if (step === 0) {
      if (!campaign.name) return 'Informe o nome da campanha.';
      if (!campaign.suppliers.length) return 'Selecione pelo menos um código de fornecedor.';
      const periods = calculatePeriods(campaign);
      if (!periods.valid) return periods.error;
      if (campaign.participantMode === 'specific' && !campaign.representatives.length) return 'Selecione os representantes participantes.';
    }
    if (step === 1 && !campaign.rankingMetrics.length) return 'Selecione pelo menos uma métrica de ranking.';
    if (step === 1) {
      for (const rule of campaign.pointRules || []) {
        if (rule.mode !== 'formula') continue;
        if (!String(rule.formula || '').trim()) return `Informe a fórmula da regra "${rule.name || 'Fórmula personalizada'}".`;
        if (rule.formulaCategoryId && !(campaign.categories || []).some((category) => category.id === rule.formulaCategoryId)) {
          return `A categoria usada pela fórmula "${rule.name || 'Fórmula personalizada'}" não existe mais.`;
        }
        if ((rule.packMode || 'manual') === 'manual' && /FARDOS(?:_EQUIVALENTES)?/i.test(rule.formula) && !(Number(rule.unitsPerPack) > 0)) {
          return `Informe quantas unidades formam um fardo na regra "${rule.name || 'Fórmula personalizada'}".`;
        }
        try {
          evaluatePointFormula(rule.formula, Object.fromEntries(FORMULA_VARIABLES.map(([key]) => [key, 10])));
        } catch (error) {
          return `Erro na fórmula "${rule.name || 'Fórmula personalizada'}": ${error.message}`;
        }
      }
    }
    if (step === 2 && campaign.salesScopeMode === 'selected_products') {
      const scopedProducts = [...new Set((campaign.categories || []).flatMap((category) => (category.products || []).map((product) => Number(product.id))).filter(Number.isFinite))];
      if (!scopedProducts.length) return 'No escopo “Somente produtos das categorias”, adicione pelo menos um produto.';
    }
    if (step === 3 && campaign.orderActivationRule?.enabled) {
      const rule = campaign.orderActivationRule;
      const benefit = campaign.categories.find((category) => category.id === rule.baseCategoryId);
      const trigger = campaign.categories.find((category) => category.id === rule.triggerCategoryId);
      if (!trigger) return 'No benefício de primeira compra, selecione o produto/linha que libera o benefício.';
      if (!benefit) return 'No benefício de primeira compra, selecione os produtos que recebem desconto.';
      if (benefit.id === trigger.id) return 'A categoria ativadora e a categoria beneficiada precisam ser diferentes.';
      if (!(trigger.products || []).length) return 'A categoria ativadora precisa ter pelo menos um produto.';
      if (!(benefit.products || []).length) return 'A categoria beneficiada precisa ter pelo menos um produto.';
      const triggerIds = new Set((trigger.products || []).map((product) => Number(product.id)));
      const overlap = (benefit.products || []).filter((product) => triggerIds.has(Number(product.id)));
      if (overlap.length) return 'O mesmo produto não pode ser ativador e beneficiado ao mesmo tempo.';
      if (Number(rule.baseMin) <= 0 || Number(rule.triggerMin) <= 0) return 'Os mínimos da regra precisam ser maiores que zero.';
      if (!['historical_trigger','campaign_trigger'].includes(rule.firstPurchaseMode)) return 'Defina como o sistema deve interpretar a primeira compra.';
    }
    return '';
  }

  async function saveCampaign() {
    if (app.savingCampaign) return;
    for (let step = 0; step < STEPS.length; step += 1) {
      const error = validateStep(step);
      if (error) { app.wizard.step = step; renderWizard(); return toast(error, 'error'); }
    }

    const saveButton = $('[data-action="save-campaign"]');
    app.savingCampaign = true;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.setAttribute('aria-busy', 'true');
    }
    try {
      syncCurrentStep();
      const campaign = app.wizard.campaign;
      campaign.updatedAt = new Date().toISOString();
      await DB.put('campanhas', campaign);
      await loadCampaigns();
      closeWizard();
      renderView();
      toast('Campanha salva com sucesso.');
    } catch (error) {
      console.error('[campanhas] falha ao salvar campanha', error);
      toast(`Não foi possível salvar a campanha: ${error.message || 'erro inesperado'}`, 'error');
    } finally {
      app.savingCampaign = false;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.removeAttribute('aria-busy');
      }
    }
  }

  function compareOp(value, operator, target) {
    if (operator === '>=') return value >= target;
    if (operator === '>') return value > target;
    if (operator === '<=') return value <= target;
    if (operator === '<') return value < target;
    return value === target;
  }

  function growth(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function periodBucket() {
    return { revenue:0, kg:0, pieces:0, orders:0, customers:new Set(), products:new Set(), rows:[], orderLines:[] };
  }

  function categoryStats(categories, rows) {
    const soldIds = new Set(rows.map((row) => Number(row.productId)));
    let fulfilled = 0;
    const required = (categories || []).filter((category) => category.requiredMix !== false);
    const missing = [];
    for (const category of required) {
      const count = (category.products || []).filter((product) => soldIds.has(Number(product.id))).length;
      if (count >= (Number(category.minDistinct) || 1)) fulfilled += 1;
      else missing.push(category.name);
    }
    return {
      fulfilled,
      total: required.length,
      percent: required.length ? (fulfilled / required.length) * 100 : 100,
      missing,
    };
  }

  function categoryPoints(categories, rows) {
    let total = 0;
    for (const category of categories || []) {
      const ids = new Set((category.products || []).map((product) => Number(product.id)));
      const relevant = rows.filter((row) => ids.has(Number(row.productId)));
      const value = Number(category.pointValue) || 0;
      if (!value || category.pointUnit === 'none') continue;
      if (category.pointUnit === 'pieces') total += relevant.reduce((sum, row) => sum + Number(row.pieces || 0), 0) * value;
      if (category.pointUnit === 'kg') total += relevant.reduce((sum, row) => sum + Number(row.kg || 0), 0) * value;
      if (category.pointUnit === 'revenue') total += relevant.reduce((sum, row) => sum + Number(row.revenue || 0), 0) * value;
      if (category.pointUnit === 'item') total += new Set(relevant.map((row) => Number(row.productId))).size * value;
    }
    return total;
  }

  function metricFromBucket(bucket, metric, mixStats = null, positivity = 0, points = 0) {
    const values = {
      revenue:bucket.revenue,
      kg:bucket.kg,
      pieces:bucket.pieces,
      customers:bucket.customers.size,
      orders:bucket.orders,
      distinctProducts:bucket.products.size,
      positivity,
      mix:mixStats?.percent || 0,
      mixCategories:mixStats?.fulfilled || 0,
      points,
    };
    return Number(values[metric] || 0);
  }

  function formulaTokens(expression) {
    const raw = String(expression || '').trim().replace(/^=/, '');
    const tokens = [];
    let index = 0;

    while (index < raw.length) {
      const char = raw[index];
      if (/\s/.test(char)) { index += 1; continue; }

      const numberMatch = raw.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type:'number', value:Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }

      const nameMatch = raw.slice(index).match(/^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]*/);
      if (nameMatch) {
        const normalized = nameMatch[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        tokens.push({ type:'name', value:normalized });
        index += nameMatch[0].length;
        continue;
      }

      const two = raw.slice(index, index + 2);
      if (['>=','<=','==','!=','<>'].includes(two)) {
        tokens.push({ type:'op', value:two === '<>' ? '!=' : two });
        index += 2;
        continue;
      }

      if ('+-*/%()><=;,'.includes(char)) {
        const type = '()+-*/%><='.includes(char) ? 'op' : 'separator';
        tokens.push({ type, value:char });
        index += 1;
        continue;
      }

      throw new Error(`Caractere não permitido na fórmula: "${char}"`);
    }

    return tokens;
  }

  function evaluatePointFormula(expression, variables = {}) {
    const tokens = formulaTokens(expression);
    let position = 0;

    const peek = () => tokens[position];
    const take = () => tokens[position++];

    const expect = (value) => {
      const token = take();
      if (!token || token.value !== value) throw new Error(`Esperado "${value}".`);
    };

    const callFunction = (name, args) => {
      if (name === 'INT') return Math.floor(Number(args[0] || 0));
      if (name === 'ARRED' || name === 'ROUND') {
        const value = Number(args[0] || 0);
        const decimals = Math.max(0, Math.min(8, Math.trunc(Number(args[1] || 0))));
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
      }
      if (name === 'MIN') return Math.min(...args.map(Number));
      if (name === 'MAX') return Math.max(...args.map(Number));
      if (name === 'ABS') return Math.abs(Number(args[0] || 0));
      if (name === 'SE' || name === 'IF') return Number(args[0]) ? Number(args[1] || 0) : Number(args[2] || 0);
      throw new Error(`Função não reconhecida: ${name}`);
    };

    const primary = () => {
      const token = take();
      if (!token) throw new Error('Fórmula incompleta.');

      if (token.type === 'number') return token.value;

      if (token.type === 'name') {
        if (peek()?.value === '(') {
          take();
          const args = [];
          if (peek()?.value !== ')') {
            while (true) {
              args.push(comparison());
              if (peek()?.value === ')' ) break;
              if (![';', ','].includes(peek()?.value)) throw new Error(`Esperado ";" ou ")" em ${token.value}.`);
              take();
            }
          }
          expect(')');
          return callFunction(token.value, args);
        }

        if (!Object.prototype.hasOwnProperty.call(variables, token.value)) {
          throw new Error(`Variável não reconhecida: ${token.value}`);
        }
        return Number(variables[token.value]) || 0;
      }

      if (token.value === '(') {
        const value = comparison();
        expect(')');
        return value;
      }

      throw new Error(`Valor inesperado: ${token.value}`);
    };

    const unary = () => {
      if (peek()?.value === '+') { take(); return unary(); }
      if (peek()?.value === '-') { take(); return -unary(); }
      return primary();
    };

    const multiply = () => {
      let value = unary();
      while (['*','/','%'].includes(peek()?.value)) {
        const op = take().value;
        const right = unary();
        if ((op === '/' || op === '%') && Math.abs(right) < 1e-12) throw new Error('Divisão por zero.');
        if (op === '*') value *= right;
        if (op === '/') value /= right;
        if (op === '%') value %= right;
      }
      return value;
    };

    const addition = () => {
      let value = multiply();
      while (['+','-'].includes(peek()?.value)) {
        const op = take().value;
        const right = multiply();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    };

    const comparison = () => {
      let value = addition();
      while (['>','<','>=','<=','=','==','!='].includes(peek()?.value)) {
        const op = take().value;
        const right = addition();
        if (op === '>') value = value > right ? 1 : 0;
        if (op === '<') value = value < right ? 1 : 0;
        if (op === '>=') value = value >= right ? 1 : 0;
        if (op === '<=') value = value <= right ? 1 : 0;
        if (op === '=' || op === '==') value = Math.abs(value - right) < 1e-9 ? 1 : 0;
        if (op === '!=') value = Math.abs(value - right) >= 1e-9 ? 1 : 0;
      }
      return value;
    };

    if (!tokens.length) throw new Error('Informe uma fórmula.');
    const result = comparison();
    if (position < tokens.length) throw new Error(`Trecho inesperado próximo de "${tokens[position].value}".`);
    if (!Number.isFinite(result)) throw new Error('A fórmula não gerou um número válido.');
    return result;
  }

  function formulaScopeRows(campaign, rule, rows) {
    if (!rule.formulaCategoryId) return rows || [];
    const category = (campaign.categories || []).find((item) => item.id === rule.formulaCategoryId);
    if (!category) return [];
    const ids = new Set((category.products || []).map((product) => Number(product.id)));
    return (rows || []).filter((row) => ids.has(Number(row.productId)));
  }

  function formulaProductMap(campaign) {
    const map = new Map();
    for (const product of app.context?.products || []) map.set(Number(product.id), product);
    for (const category of campaign.categories || []) {
      for (const product of category.products || []) map.set(Number(product.id), { ...(map.get(Number(product.id)) || {}), ...product });
    }
    return map;
  }

  function formulaPackingStats(campaign, rule, rows) {
    const productMap = formulaProductMap(campaign);
    const piecesByProduct = new Map();

    for (const row of rows || []) {
      const id = Number(row.productId);
      piecesByProduct.set(id, (piecesByProduct.get(id) || 0) + Number(row.pieces || 0));
    }

    let complete = 0;
    let equivalent = 0;
    const missing = [];

    for (const [productId, pieces] of piecesByProduct.entries()) {
      const product = productMap.get(productId) || {};
      let divisor = 0;

      if (rule.packMode === 'master') divisor = Number(product.master) || 0;
      else if (rule.packMode === 'factor') divisor = Number(product.factor) || 0;
      else divisor = Number(rule.unitsPerPack) || 0;

      if (!(divisor > 0)) {
        missing.push({ id:productId, name:product.name || `Produto ${productId}` });
        continue;
      }

      const packs = Math.max(0, pieces) / divisor;
      equivalent += packs;
      complete += Math.floor(packs + 1e-9);
    }

    return { complete, equivalent, missing };
  }

  function formulaVariables(campaign, rule, metrics, rows) {
    const scopedRows = formulaScopeRows(campaign, rule, rows);
    const packing = formulaPackingStats(campaign, rule, scopedRows);

    const units = scopedRows.reduce((sum,row) => sum + Number(row.pieces || 0), 0);
    const kg = scopedRows.reduce((sum,row) => sum + Number(row.kg || 0), 0);
    const revenue = scopedRows.reduce((sum,row) => sum + Number(row.revenue || 0), 0);
    const clients = new Set(scopedRows.map((row) => String(row.clientId)).filter(Boolean)).size;
    const products = new Set(scopedRows.map((row) => Number(row.productId)).filter(Number.isFinite)).size;

    return {
      values:{
        FARDOS:packing.complete,
        FARDOS_EQUIVALENTES:packing.equivalent,
        UNIDADES:units,
        KG:kg,
        FATURAMENTO:revenue,
        CLIENTES:clients,
        PEDIDOS:Number(metrics.orders) || 0,
        PRODUTOS_DISTINTOS:products,
        POSITIVACAO:Number(metrics.positivity) || 0,
        MIX:Number(metrics.mix) || 0,
        CATEGORIAS_MIX:Number(metrics.mixCategories) || 0,
      },
      scopedRows,
      packing,
    };
  }

  function performanceRulePointsDetailed(campaign, pointRules, metrics, rows) {
    let total = 0;
    const details = [];

    for (const rule of pointRules || []) {
      if (rule.mode === 'formula') {
        const context = formulaVariables(campaign, rule, metrics, rows);
        let result = 0;
        let error = '';

        try {
          result = evaluatePointFormula(rule.formula || '', context.values);
        } catch (formulaError) {
          error = formulaError.message;
          result = 0;
        }

        total += result;
        details.push({
          id:rule.id,
          mode:'formula',
          name:rule.name || 'Fórmula personalizada',
          formula:rule.formula || '',
          result,
          error,
          categoryId:rule.formulaCategoryId || '',
          variables:context.values,
          missingPackProducts:context.packing.missing,
        });
        continue;
      }

      const value = Number(metrics[rule.source] || 0);
      const basis = Math.max(0.000001, Number(rule.basis) || 1);
      const points = Number(rule.points) || 0;
      let result = 0;

      if (rule.mode === 'fixed_if_target') {
        if (value >= basis) result = points;
      } else {
        result = Math.floor(Math.max(0, value) / basis) * points;
      }

      total += result;
      details.push({ id:rule.id, mode:rule.mode, source:rule.source, result, value, basis, points });
    }

    return { total, details };
  }

  function performanceRulePoints(campaign, pointRules, metrics, rows) {
    return performanceRulePointsDetailed(campaign, pointRules, metrics, rows).total;
  }

  function goalValue(goal, currentMetrics, previousMetrics) {
    if (goal.mode === 'growth_percent') return growth(Number(currentMetrics[goal.metric] || 0), Number(previousMetrics[goal.metric] || 0));
    return Number(currentMetrics[goal.metric] || 0);
  }

  function metricLabel(metric, growthMode = false) {
    const source = growthMode ? GROWTH_METRICS : BASE_METRICS;
    return source.find(([id]) => id === metric)?.[1] || metric;
  }

  function metricDisplay(metric, value) {
    if (metric === 'revenue') return money(value);
    if (metric === 'kg') return `${number(value, 1)} KG`;
    if (metric === 'pieces') return `${number(value, 0)} un.`;
    if (metric === 'customers') return `${number(value, 0)} clientes`;
    if (metric === 'orders') return `${number(value, 0)} pedidos`;
    if (metric === 'positivity') return `${Number(value || 0) >= 0 ? '+' : ''}${number(value, 0)} clientes`;
    if (metric === 'mix') return `${number(value, 1)}%`;
    if (metric === 'points') return `${number(value, 1)} pts`;
    if (metric === 'activationClients') return `${number(value, 0)} ativações`;
    if (metric === 'activationOrders') return `${number(value, 0)} pedidos`;
    if (metric === 'activationRate') return `${number(value, 1)}%`;
    return number(value, 1);
  }

  function goalDescription(goal, value) {
    const label = goal.mode === 'growth_percent'
      ? `Crescimento de ${metricLabel(goal.metric, true)}`
      : metricLabel(goal.metric, false);
    const suffix = goal.mode === 'growth_percent' || goal.metric === 'mix' ? '%' : '';
    return `${label}: ${number(value, 1)}${suffix} ${goal.operator} ${number(goal.value, 1)}${suffix}`;
  }

  function goalAudit(goal, currentMetrics, previousMetrics) {
    const current = Number(currentMetrics?.[goal.metric] || 0);
    const previous = Number(previousMetrics?.[goal.metric] || 0);
    const value = goalValue(goal, currentMetrics || {}, previousMetrics || {});
    const targetSuffix = goal.mode === 'growth_percent' || goal.metric === 'mix' ? '%' : '';

    return {
      current,
      previous,
      value,
      label: metricLabel(goal.metric, goal.mode === 'growth_percent'),
      target: `${goal.operator} ${number(goal.value, 1)}${targetSuffix}`,
      currentText: metricDisplay(goal.metric, current),
      previousText: metricDisplay(goal.metric, previous),
      deltaText: metricDisplay(goal.metric, current - previous),
      valueText: goal.mode === 'growth_percent' ? pct(value) : metricDisplay(goal.metric, value),
    };
  }

  function goalComparisonHtml(goal) {
    const audit = goal.audit;
    if (!audit) return `<small>${esc(goalDescription(goal, goal.value))}</small>`;

    if (goal.mode === 'growth_percent') {
      return `<div class="goal-audit">
        <div><span>Atual</span><strong>${esc(audit.currentText)}</strong></div>
        <div><span>Referência anterior</span><strong>${esc(audit.previousText)}</strong></div>
        <div><span>Diferença</span><strong>${esc(audit.deltaText)}</strong></div>
        <div><span>Crescimento</span><strong>${esc(audit.valueText)}</strong></div>
      </div>
      <small class="goal-target">Meta configurada: ${esc(audit.target)}</small>`;
    }

    return `<div class="goal-audit compact">
      <div><span>Resultado atual</span><strong>${esc(audit.currentText)}</strong></div>
      <div><span>Referência anterior</span><strong>${esc(audit.previousText)}</strong></div>
    </div>
    <small class="goal-target">Meta configurada: ${esc(audit.target)}</small>`;
  }

  function individualGoalsHtml(item) {
    if (!item.individualGoals?.length) return '';
    return `<div class="individual-goal-audit">${item.individualGoals.map((goal) => {
      const audit = goal.audit;
      if (!audit) return '';
      const line = goal.mode === 'growth_percent'
        ? `${audit.currentText} vs ${audit.previousText} = ${audit.valueText}`
        : `${audit.currentText}`;
      return `<small class="${goal.hit ? 'hit' : 'miss'}">${esc(audit.label)}: ${esc(line)} · meta ${esc(audit.target)}</small>`;
    }).join('')}</div>`;
  }


  function activationMeasure(order, productIds, measure) {
    const relevant = order.lines.filter((line) => productIds.has(Number(line.productId)));
    if (measure === 'pieces') return relevant.reduce((sum, line) => sum + Number(line.pieces || 0), 0);
    return new Set(relevant.map((line) => Number(line.productId))).size;
  }

  function activationRuleStats(campaign, orderLines = [], historicalTriggerClients = new Set()) {
    const rule = campaign.orderActivationRule || {};
    if (!rule.enabled) return { enabled:false, clients:0, orders:0, opportunities:0, qualifyingOrders:0, withoutTrigger:0, withoutBenefit:0, rate:0, clientIds:[], examples:[] };

    const benefitCategory = (campaign.categories || []).find((category) => category.id === rule.baseCategoryId);
    const triggerCategory = (campaign.categories || []).find((category) => category.id === rule.triggerCategoryId);
    const benefitIds = new Set((benefitCategory?.products || []).map((product) => Number(product.id)));
    const triggerIds = new Set((triggerCategory?.products || []).map((product) => Number(product.id)));

    if (!benefitIds.size || !triggerIds.size) return { enabled:true, clients:0, orders:0, opportunities:0, qualifyingOrders:0, withoutTrigger:0, withoutBenefit:0, rate:0, clientIds:[], examples:[] };

    const orders = new Map();
    for (const line of orderLines || []) {
      const id = String(line.orderId);
      if (!orders.has(id)) orders.set(id, { orderId:id, clientId:String(line.clientId), orderDate:String(line.orderDate || ''), lines:[] });
      orders.get(id).lines.push(line);
    }

    const sorted = [...orders.values()].sort((a,b) => String(a.orderDate).localeCompare(String(b.orderDate)) || String(a.orderId).localeCompare(String(b.orderId)));
    const processedClients = new Set();
    const activatedClients = new Set();
    const examples = [];
    let opportunities = 0, activationOrders = 0, withoutBenefit = 0;

    for (const order of sorted) {
      if (processedClients.has(order.clientId)) continue;
      if (rule.firstPurchaseMode === 'historical_trigger' && historicalTriggerClients.has(String(order.clientId))) {
        processedClients.add(order.clientId);
        continue;
      }

      const triggerValue = activationMeasure(order, triggerIds, rule.triggerMeasure || 'distinct_products');
      if (triggerValue < Math.max(1, Number(rule.triggerMin) || 1)) continue;

      // A primeira compra do ativador consome a oportunidade deste cliente.
      processedClients.add(order.clientId);
      opportunities += 1;

      const benefitValue = activationMeasure(order, benefitIds, rule.baseMeasure || 'distinct_products');
      if (benefitValue < Math.max(1, Number(rule.baseMin) || 1)) {
        withoutBenefit += 1;
        continue;
      }

      activationOrders += 1;
      activatedClients.add(order.clientId);
      if (examples.length < 8) examples.push({ orderId:order.orderId, clientId:order.clientId, orderDate:order.orderDate, baseValue:benefitValue, triggerValue });
    }

    return {
      enabled:true,
      clients:activatedClients.size,
      orders:activationOrders,
      opportunities,
      qualifyingOrders:activationOrders,
      withoutTrigger:0,
      withoutBenefit,
      rate:opportunities ? (activationOrders / opportunities) * 100 : 0,
      clientIds:[...activatedClients],
      examples,
      baseCategoryName:benefitCategory?.name || 'Produtos com desconto',
      triggerCategoryName:triggerCategory?.name || 'Produto ativador',
      baseMeasure:rule.baseMeasure || 'distinct_products',
      triggerMeasure:rule.triggerMeasure || 'distinct_products',
      baseMin:Number(rule.baseMin) || 1,
      triggerMin:Number(rule.triggerMin) || 1,
      countMode:'first_per_client',
    };
  }

  function sellerMetrics(campaign, seller, historicalTriggerClients = new Set()) {
    const currentMix = categoryStats(campaign.categories, seller.current.rows);
    const previousMix = categoryStats(campaign.categories, seller.previous.rows);

    const currentCustomerIds = seller.current.customers;
    const previousCustomerIds = seller.previous.customers;
    const retainedCustomers = [...currentCustomerIds].filter((id) => previousCustomerIds.has(id)).length;
    const newCustomers = [...currentCustomerIds].filter((id) => !previousCustomerIds.has(id)).length;
    const lostCustomers = [...previousCustomerIds].filter((id) => !currentCustomerIds.has(id)).length;

    // Regra PMG: positivação líquida = clientes únicos atuais - clientes únicos anteriores.
    // Equivalentemente: clientes novos - clientes que estavam no anterior e não aparecem no atual.
    const positivity = currentCustomerIds.size - previousCustomerIds.size;
    const previousPositivity = 0;

    const currentActivation = activationRuleStats(campaign, seller.current.orderLines, historicalTriggerClients);
    const previousActivation = activationRuleStats(campaign, seller.previous.orderLines, historicalTriggerClients);
    const currentBasePoints = categoryPoints(campaign.categories, seller.current.rows);
    const previousBasePoints = categoryPoints(campaign.categories, seller.previous.rows);
    const currentRaw = {
      revenue:seller.current.revenue, kg:seller.current.kg, pieces:seller.current.pieces, customers:seller.current.customers.size,
      orders:seller.current.orders, distinctProducts:seller.current.products.size, positivity, mix:currentMix.percent, mixCategories:currentMix.fulfilled,
      activationClients:currentActivation.clients, activationOrders:currentActivation.orders, activationRate:currentActivation.rate,
    };
    const previousRaw = {
      revenue:seller.previous.revenue, kg:seller.previous.kg, pieces:seller.previous.pieces, customers:seller.previous.customers.size,
      orders:seller.previous.orders, distinctProducts:seller.previous.products.size, positivity:previousPositivity, mix:previousMix.percent, mixCategories:previousMix.fulfilled,
      activationClients:previousActivation.clients, activationOrders:previousActivation.orders, activationRate:previousActivation.rate,
    };
    const currentRulePoints = performanceRulePointsDetailed(campaign, campaign.pointRules, currentRaw, seller.current.rows);
    const previousRulePoints = performanceRulePointsDetailed(campaign, campaign.pointRules, previousRaw, seller.previous.rows);
    const currentPoints = currentBasePoints + currentRulePoints.total;
    const previousPoints = previousBasePoints + previousRulePoints.total;

    const current = { ...currentRaw, points:currentPoints };
    const previous = { ...previousRaw, points:previousPoints };
    return {
      name:seller.name,
      current, previous,
      revenue:current.revenue, previousRevenue:previous.revenue, revenueGrowth:growth(current.revenue, previous.revenue),
      kg:current.kg, previousKg:previous.kg, kgGrowth:growth(current.kg, previous.kg),
      pieces:current.pieces, previousPieces:previous.pieces, piecesGrowth:growth(current.pieces, previous.pieces),
      customers:current.customers, previousCustomers:previous.customers, customersGrowth:growth(current.customers, previous.customers),
      orders:current.orders, previousOrders:previous.orders, ordersGrowth:growth(current.orders, previous.orders),
      positivity, mix:current.mix, mixDone:currentMix.fulfilled, mixTotal:currentMix.total, mixMissing:currentMix.missing,
      points:current.points, previousPoints:previous.points, pointsGrowth:growth(current.points, previous.points),
      pointRuleAudit:currentRulePoints.details,
      previousPointRuleAudit:previousRulePoints.details,
      distinctProducts:current.distinctProducts,
      activationClients:currentActivation.clients, activationOrders:currentActivation.orders, activationRate:currentActivation.rate,
      activationAudit:currentActivation, previousActivationAudit:previousActivation,
      customerAudit:{
        current:currentCustomerIds.size,
        previous:previousCustomerIds.size,
        retained:retainedCustomers,
        new:newCustomers,
        lost:lostCustomers,
        positivity,
      },
      eligible:true, reasons:[], individualGoals:[],
    };
  }

  function teamMetrics(campaign, sellers, results, period = 'current') {
    const rows = [...sellers.values()].flatMap((seller) => seller[period].rows);
    const clients = new Set(rows.map((row) => String(row.clientId)));
    const products = new Set(rows.map((row) => Number(row.productId)));
    const mix = categoryStats(campaign.categories, rows);
    return {
      revenue:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].revenue || 0), 0),
      kg:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].kg || 0), 0),
      pieces:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].pieces || 0), 0),
      customers:clients.size,
      orders:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].orders || 0), 0),
      distinctProducts:products.size,
      mix:mix.percent,
      mixCategories:mix.fulfilled,
      points:results.reduce((sum, item) => sum + Number(item[period].points || 0), 0),
      activationClients:(() => {
        const ids = new Set();
        for (const item of results) for (const id of ((period === 'current' ? item.activationAudit : item.previousActivationAudit)?.clientIds || [])) ids.add(String(id));
        return ids.size;
      })(),
      activationOrders:results.reduce((sum, item) => sum + Number((period === 'current' ? item.activationAudit : item.previousActivationAudit)?.orders || 0), 0),
      activationRate:(() => {
        const opportunities = results.reduce((sum, item) => sum + Number((period === 'current' ? item.activationAudit : item.previousActivationAudit)?.opportunities || 0), 0);
        const activations = results.reduce((sum, item) => sum + Number((period === 'current' ? item.activationAudit : item.previousActivationAudit)?.orders || 0), 0);
        return opportunities ? (activations / opportunities) * 100 : 0;
      })(),
      positivity:0,
    };
  }

  function rankMetric(item, metric) {
    return Number(item[metric] ?? item.current?.[metric] ?? 0);
  }

  function compareRank(a, b, campaign) {
    for (const metric of campaign.rankingMetrics || []) {
      const diff = rankMetric(b, metric) - rankMetric(a, metric);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    for (const tie of campaign.tieBreaks || []) {
      const diff = rankMetric(b, tie.metric) - rankMetric(a, tie.metric);
      if (Math.abs(diff) > 1e-9) return tie.direction === 'asc' ? -diff : diff;
    }
    return a.name.localeCompare(b.name, 'pt-BR');
  }

  function calculatePerformance(campaign, data, periods) {
    const sellers = new Map();
    const orderMap = new Map((data.ordersBySeller || []).map((row) => [`${row.period}|${row.seller}`, Number(row.orders) || 0]));
    for (const row of data.lines || []) {
      if (!sellers.has(row.seller)) sellers.set(row.seller, { name:row.seller, current:periodBucket(), previous:periodBucket() });
      const seller = sellers.get(row.seller);
      const bucket = row.period === 'current' ? seller.current : seller.previous;
      bucket.revenue += Number(row.revenue) || 0;
      bucket.kg += Number(row.kg) || 0;
      bucket.pieces += Number(row.pieces) || 0;
      bucket.customers.add(String(row.clientId));
      bucket.products.add(Number(row.productId));
      bucket.rows.push(row);
    }
    for (const row of data.orderLines || []) {
      if (!sellers.has(row.seller)) sellers.set(row.seller, { name:row.seller, current:periodBucket(), previous:periodBucket() });
      const seller = sellers.get(row.seller);
      (row.period === 'current' ? seller.current : seller.previous).orderLines.push(row);
    }
    for (const seller of sellers.values()) {
      seller.current.orders = orderMap.get(`current|${seller.name}`) || 0;
      seller.previous.orders = orderMap.get(`previous|${seller.name}`) || 0;
    }

    const historicalTriggerClients = new Set((data.historicalTriggerClientIds || []).map((id) => String(id)));
    const results = [...sellers.values()].map((seller) => sellerMetrics(campaign, seller, historicalTriggerClients));
    for (const item of results) {
      for (const rule of campaign.rules || []) {
        const value = rankMetric(item, rule.metric);
        if (!compareOp(value, rule.operator, Number(rule.value) || 0)) {
          item.eligible = false;
          item.reasons.push(`${rule.name}: ${number(value, 1)} ${rule.operator} ${number(rule.value, 1)}`);
        }
      }
      if (['individual','both'].includes(campaign.goalMode)) {
        for (const goal of campaign.individualGoals || []) {
          const value = goalValue(goal, item.current, item.previous);
          const hit = compareOp(value, goal.operator, Number(goal.value) || 0);
          item.individualGoals.push({ ...goal, value, hit, audit:goalAudit(goal, item.current, item.previous) });
          if (!hit) {
            item.eligible = false;
            item.reasons.push(goalDescription(goal, value));
          }
        }
      }
    }

    const collectiveCurrent = teamMetrics(campaign, sellers, results, 'current');
    const collectivePrevious = teamMetrics(campaign, sellers, results, 'previous');

    const sqlCollective = new Map((data.collectiveSummary || []).map((row) => [row.period, row]));
    const sqlCurrent = sqlCollective.get('current');
    const sqlPrevious = sqlCollective.get('previous');

    if (sqlCurrent) {
      collectiveCurrent.revenue = Number(sqlCurrent.revenue) || 0;
      collectiveCurrent.kg = Number(sqlCurrent.kg) || 0;
      collectiveCurrent.pieces = Number(sqlCurrent.pieces) || 0;
      collectiveCurrent.customers = Number(sqlCurrent.customers) || 0;
      collectiveCurrent.orders = Number(sqlCurrent.orders) || 0;
      collectiveCurrent.distinctProducts = Number(sqlCurrent.products) || 0;
    }

    if (sqlPrevious) {
      collectivePrevious.revenue = Number(sqlPrevious.revenue) || 0;
      collectivePrevious.kg = Number(sqlPrevious.kg) || 0;
      collectivePrevious.pieces = Number(sqlPrevious.pieces) || 0;
      collectivePrevious.customers = Number(sqlPrevious.customers) || 0;
      collectivePrevious.orders = Number(sqlPrevious.orders) || 0;
      collectivePrevious.distinctProducts = Number(sqlPrevious.products) || 0;
    }

    collectiveCurrent.positivity = collectiveCurrent.customers - collectivePrevious.customers;
    // Positivação anterior exigiria um terceiro período-base; não é usada como crescimento percentual.
    collectivePrevious.positivity = 0;
    const collectiveGoals = ['collective','both'].includes(campaign.goalMode)
      ? (campaign.collectiveGoals || []).map((goal) => {
          const value = goalValue(goal, collectiveCurrent, collectivePrevious);
          return {
            ...goal,
            value,
            hit:compareOp(value, goal.operator, Number(goal.value) || 0),
            audit:goalAudit(goal, collectiveCurrent, collectivePrevious),
          };
        })
      : [];
    const collectiveHit = collectiveGoals.every((goal) => goal.hit);

    const ordered = [...results].sort((a,b) => compareRank(a,b,campaign));
    const eligible = ordered.filter((item) => item.eligible);
    let classified;
    if (campaign.rankingMode === 'ALL_ELIGIBLE') classified = eligible;
    else if (campaign.rankingMode === 'TOP_N') classified = ordered.slice(0, Number(campaign.topN) || 5);
    else classified = eligible.slice(0, Number(campaign.topN) || 5);
    if (!collectiveHit) classified = [];
    const classifiedSet = new Set(classified.map((item) => item.name));
    ordered.forEach((item, index) => { item.position = index + 1; item.classified = classifiedSet.has(item.name); });

    return {
      periods,
      results:ordered,
      collectiveGoals,
      collectiveHit,
      summary:{
        revenue:collectiveCurrent.revenue, previousRevenue:collectivePrevious.revenue,
        kg:collectiveCurrent.kg, previousKg:collectivePrevious.kg,
        pieces:collectiveCurrent.pieces, previousPieces:collectivePrevious.pieces,
        customers:collectiveCurrent.customers, previousCustomers:collectivePrevious.customers,
        orders:collectiveCurrent.orders, previousOrders:collectivePrevious.orders,
        positivity:collectiveCurrent.positivity,
        points:collectiveCurrent.points,
        activationClients:collectiveCurrent.activationClients,
        activationOrders:collectiveCurrent.activationOrders,
        activationRate:collectiveCurrent.activationRate,
        eligible:eligible.length, classified:classified.length,
      },
    };
  }

  function effectiveSalesScope(campaign) {
    const categoryProductIds = [...new Set(
      (campaign.categories || []).flatMap((category) => (category.products || []).map((product) => Number(product.id))).filter(Number.isFinite)
    )];
    const supplierIds = (campaign.suppliers || []).map((supplier) => Number(supplier.id)).filter(Number.isFinite);
    const mode = campaign.salesScopeMode || (supplierIds.length ? 'supplier_all' : 'selected_products');
    if (mode === 'selected_products') return { mode, productIds:categoryProductIds, supplierIds };
    return { mode:'supplier_all', productIds:[], supplierIds };
  }

  async function openPerformance(id, { force = false } = {}) {
    const inFlightKey = String(id || '');
    if (app.performanceInFlight.has(inFlightKey)) {
      toast('A apuração desta campanha já está em andamento.');
      return;
    }
    app.performanceInFlight.add(inFlightKey);
    try {
      const campaign = normalizeCampaign(await DB.get('campanhas', id));
      if (!campaign?.id) return;

      $('#drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#performanceTitle').textContent = campaign.name;
    requestAnimationFrame(() => $('#performanceDrawer')?.focus?.());

    const periods = calculatePeriods(campaign);
    if (!periods.valid) {
      $('#performanceBody').innerHTML = `<div class="context-error">${esc(periods.error)}</div>`;
      return;
    }

    const cacheId = `performance:${campaign.id}`;
    const saved = await DB.get('apuracoes', cacheId);

    if (saved?.result && !force) {
      const fallbackData = saved.data || {
        source:'Última apuração salva',
        durationMs:0,
        partial:true,
        asOfDate:saved.generatedAt?.slice(0,10),
        periodsUsed:{
          currentStart:saved.result.periods?.currentStart,
          currentLastInclusive:saved.result.periods?.currentLast,
          previousStart:saved.result.periods?.previousStart,
          previousLastInclusive:saved.result.periods?.previousLast,
        },
      };
      $('#performanceBody').innerHTML =
        `<div class="saved-performance-banner"><span><i data-lucide="database-zap"></i><strong>Mostrando a última apuração salva</strong><small>${saved.generatedAt ? `Gerada em ${new Date(saved.generatedAt).toLocaleString('pt-BR')}. ` : ''}Atualizando os dados em segundo plano…</small></span><span class="mini-spinner"></span></div>`
        + performanceHtml(campaign, saved.result, { ...fallbackData, browserCache:true });
      icons($('#performanceBody'));
    } else {
      $('#performanceBody').innerHTML = `<div class="loading-stage"><div><div class="spinner"></div><h3>Consultando vendas reais</h3><p>Primeiro acesso pode levar alguns segundos. As próximas aberturas usam cache local e cache da API.</p></div></div>`;
    }

    const salesScope = effectiveSalesScope(campaign);
    const productIds = salesScope.productIds;
    const supplierIds = salesScope.supplierIds;

    const activationRule = campaign.orderActivationRule || {};
    const activationCategoryIds = new Set([activationRule.baseCategoryId, activationRule.triggerCategoryId].filter(Boolean));
    const activationProductIds = [...new Set(
      (campaign.categories || []).filter((category) => activationCategoryIds.has(category.id))
        .flatMap((category) => (category.products || []).map((product) => Number(product.id))).filter(Number.isFinite)
    )];
    const activationTriggerProductIds = [...new Set(
      (campaign.categories || []).find((category) => category.id === activationRule.triggerCategoryId)?.products
        ?.map((product) => Number(product.id)).filter(Number.isFinite) || []
    )];

    try {
      const data = await api(`${SQL_ENDPOINT}?recurso=apuracao`, {
        method:'POST',
        timeout:HEAVY_CALC_TIMEOUT_MS,
        force,
        body:JSON.stringify({
          campaignStart:periods.currentStart,
          campaignEnd:periods.currentLast,
          periodMode:campaign.periodMode || 'six_mondays',
          asOfDate:inputDate(new Date()),
          currentStart:periods.currentStart,
          currentEnd:periods.currentEnd,
          previousStart:periods.previousStart,
          previousEnd:periods.previousEnd,
          supplierIds,
          productIds,
          salesScopeMode:salesScope.mode,
          sellers:campaign.participantMode === 'specific' ? campaign.representatives : [],
          orderActivationEnabled:Boolean(activationRule.enabled),
          activationProductIds,
          activationTriggerProductIds,
          activationFirstPurchaseMode:activationRule.firstPurchaseMode || 'campaign_trigger',
          forceRefresh:force,
        }),
      });

      const result = calculatePerformance(campaign, data, periods);

      await DB.put('apuracoes', {
        id:cacheId,
        campaignId:campaign.id,
        generatedAt:new Date().toISOString(),
        result,
        data:{
          source:data.source,
          dateReference:data.dateReference,
          comparisonPolicy:data.comparisonPolicy,
          provenance:data.provenance || null,
          collectiveSummary:data.collectiveSummary || [],
          durationMs:data.durationMs,
          partial:data.partial,
          asOfDate:data.asOfDate,
          elapsedDays:data.elapsedDays,
          totalDays:data.totalDays,
          remainingDays:data.remainingDays,
          periodMode:data.periodMode,
          previousEquivalentEndExclusive:data.previousEquivalentEndExclusive,
          equivalentPreviousSummary:data.equivalentPreviousSummary || null,
          periodsUsed:data.periodsUsed,
          nominalPeriods:data.nominalPeriods,
          cache:data.cache || null,
        },
      });

      $('#performanceBody').innerHTML = performanceHtml(campaign, result, data);
      icons($('#performanceBody'));
    } catch (error) {
      if (saved?.result && !force) {
        const warning = document.createElement('div');
        warning.className = 'saved-performance-warning';
        warning.innerHTML = `<i data-lucide="triangle-alert"></i><span>Não foi possível atualizar agora. A apuração salva continua visível.<small>${esc(error.message)}</small></span><button class="secondary-btn" data-action="retry-performance" data-id="${esc(id)}">Tentar novamente</button>`;
        $('#performanceBody').prepend(warning);
        icons(warning);
        return;
      }

      const sessionExpired = error.code === 'SQL_SESSION_EXPIRED' || /sess[aã]o.*(?:inv[aá]lida|expirad)/i.test(error.message || '');
      const authRequired = ['PMG_AUTH_REQUIRED', 'PMG_AUTH_INVALID', 'PMG_AUTH_EXPIRED'].includes(String(error.code || ''));

      $('#performanceBody').innerHTML = `<div class="context-error sql-recovery-error">
        <strong>${
          authRequired
            ? 'A sessão do PMG Connect não chegou até a API local.'
            : sessionExpired
              ? 'A conexão com o SQL expirou e não conseguiu se recuperar.'
              : error.code === 'LOCAL_API_TIMEOUT'
                ? 'A apuração local ainda não terminou.'
                : 'Não foi possível calcular a campanha.'
        }</strong>
        <br>${esc(error.message)}
        ${authRequired ? `<br><span class="context-error-hint">${
          window.PMGConnectAuth?.hasRefreshToken?.()
            ? 'A página possui refresh token, mas a renovação automática da sessão falhou. Reabra Campanhas pelo PMG Connect para receber uma sessão nova.'
            : 'Esta aba não possui refresh token. Depois de instalar esta versão, abra Campanhas uma vez pelo PMG Connect autenticado para registrar a sessão completa.'
        }</span>` : ''}
        ${error.code === 'LOCAL_API_TIMEOUT' ? `<br><span class="context-error-hint">A apuração roda fora da thread da API. No primeiro acesso ela também pode aguardar a sincronização diária; se o limite de 18 minutos for atingido, confira o terminal para identificar a etapa excessiva.</span>` : ''}
        ${error.code === 'LOCAL_API_SAME_ORIGIN' ? `<br><span class="context-error-hint">A página já está no localhost:3001 e agora tenta <code>/api/campanhas-data</code> diretamente, sem CORS/PNA. Se ainda falhar, a mensagem “Navegador:” abaixo identifica o erro real do fetch.</span>` : ''}
        ${error.hint ? `<br><span class="context-error-hint">${esc(error.hint)}</span>` : ''}
        ${error.code ? `<small class="context-error-code">Código: ${esc(error.code)}</small>` : ''}
        <br><button class="secondary-btn" data-action="retry-performance" data-id="${esc(id)}" style="margin-top:10px">
          <i data-lucide="refresh-cw"></i>${authRequired ? 'Tentar com a sessão atual' : sessionExpired ? 'Reconectar e tentar novamente' : 'Tentar novamente'}
        </button>
      </div>`;
      icons($('#performanceBody'));
    }
    } finally {
      app.performanceInFlight.delete(inFlightKey);
    }
  }

  function performanceAuditContext(campaign, data, result) {
    const used = data.periodsUsed || {};
    const currentStart = used.currentStart || result.periods.currentStart;
    const currentLast = used.currentLastInclusive || result.periods.currentLast;
    const previousStart = used.previousStart || result.periods.previousStart;
    const previousLast = used.previousLastInclusive || result.periods.previousLast;

    return {
      currentStart,
      currentLast,
      previousStart,
      previousLast,
      scopeSuppliers:(campaign.suppliers || []).map((s) => `${s.name} (${s.id})`).join(', '),
      scopeProducts:[...new Set((campaign.categories || []).flatMap((category) => (category.products || []).map((product) => Number(product.id))).filter(Number.isFinite))].length,
    };
  }

  function metricCellAudit(metric, period, item, audit) {
    const isCurrent = period === 'current';
    const periodLabel = isCurrent ? 'Campanha' : 'Referência anterior';
    const start = isCurrent ? audit.currentStart : audit.previousStart;
    const last = isCurrent ? audit.currentLast : audit.previousLast;

    const common = [
      `${periodLabel}: ${dateBR(start)} a ${dateBR(last)}`,
      `Vendedor: dbo.Vendas.[Vendedor]`,
      `Data: dbo.Vendas.[Data]`,
      `Escopo: produtos/fornecedores configurados nesta campanha`,
    ];

    if (metric === 'revenue') {
      return [
        `Faturamento = soma de dbo.VendasProdutos.[Valor]`,
        ...common,
        `Resultado: ${money(isCurrent ? item.revenue : item.previousRevenue)}`,
      ];
    }
    if (metric === 'kg') {
      return [
        `Volume = soma de dbo.VendasProdutos.[Qtde Kg]`,
        ...common,
        `Resultado: ${number(isCurrent ? item.kg : item.previousKg, 1)} KG`,
      ];
    }
    if (metric === 'customers') {
      const value = isCurrent ? item.customers : item.previousCustomers;
      return [
        `Clientes = quantidade de IDs de cliente únicos com venda no escopo`,
        `Cálculo: COUNT DISTINCT dbo.Vendas.[ID Cliente]`,
        ...common,
        `Resultado: ${number(value)} clientes únicos`,
      ];
    }
    if (metric === 'orders') {
      const value = isCurrent ? item.orders : item.previousOrders;
      return [
        `Pedidos = quantidade de pedidos únicos com produto do escopo`,
        `Cálculo: COUNT DISTINCT dbo.Vendas.[ID Pedido de Venda]`,
        ...common,
        `Resultado: ${number(value)} pedidos`,
      ];
    }
    return common;
  }

  function growthCellAudit(metric, item, audit) {
    const current = metric === 'revenue' ? item.revenue : item.kg;
    const previous = metric === 'revenue' ? item.previousRevenue : item.previousKg;
    const label = metric === 'revenue' ? 'faturamento' : 'volume';
    const formattedCurrent = metric === 'revenue' ? money(current) : `${number(current,1)} KG`;
    const formattedPrevious = metric === 'revenue' ? money(previous) : `${number(previous,1)} KG`;
    return [
      `Crescimento de ${label}`,
      `Atual: ${formattedCurrent}`,
      `Referência anterior: ${formattedPrevious}`,
      previous
        ? `Fórmula: (Atual − Anterior) ÷ |Anterior| × 100`
        : `Sem base anterior: quando o anterior é zero, a regra operacional atual considera 100% se houver venda e 0% se também não houver venda.`,
      `Resultado: ${pct(metric === 'revenue' ? item.revenueGrowth : item.kgGrowth)}`,
      `Períodos: ${dateBR(audit.currentStart)}–${dateBR(audit.currentLast)} vs ${dateBR(audit.previousStart)}–${dateBR(audit.previousLast)}`,
    ];
  }

  function positivityAuditLines(item, audit) {
    const customerAudit = item.customerAudit || {};
    return [
      `Positivação líquida = clientes únicos atuais − clientes únicos anteriores`,
      `Atual: ${number(item.customers)} clientes`,
      `Anterior: ${number(item.previousCustomers)} clientes`,
      `Cálculo: ${number(item.customers)} − ${number(item.previousCustomers)} = ${item.positivity >= 0 ? '+' : ''}${number(item.positivity)}`,
      `Detalhamento: ${number(customerAudit.new)} só no atual · ${number(customerAudit.retained)} nos dois períodos · ${number(customerAudit.lost)} só no anterior`,
      `Equivalência: novos (${number(customerAudit.new)}) − perdidos (${number(customerAudit.lost)}) = ${item.positivity >= 0 ? '+' : ''}${number(item.positivity)}`,
      `Fonte: clientes únicos por dbo.Vendas.[ID Cliente]`,
      `Períodos: ${dateBR(audit.currentStart)}–${dateBR(audit.currentLast)} vs ${dateBR(audit.previousStart)}–${dateBR(audit.previousLast)}`,
    ];
  }


  function activationAuditLines(item, campaign, audit) {
    const rule = campaign.orderActivationRule || {};
    const data = item.activationAudit || {};
    const measureLabel = (measure) => measure === 'pieces' ? 'unidades' : 'produtos distintos';

    const lines = [
      `${rule.name || 'Benefício de primeira compra'}`,
      `Ativador: ${data.triggerCategoryName || '—'} · mínimo ${number(data.triggerMin || rule.triggerMin)} ${measureLabel(data.triggerMeasure || rule.triggerMeasure)}`,
      `Produtos com desconto: ${data.baseCategoryName || '—'} · mínimo ${number(data.baseMin || rule.baseMin)} ${measureLabel(data.baseMeasure || rule.baseMeasure)}`,
      `Primeiras compras do ativador: ${number(data.opportunities)}`,
      `Benefícios utilizados: ${number(data.orders)}`,
      `Primeira compra sem item beneficiado: ${number(data.withoutBenefit)}`,
      `Taxa de aproveitamento: ${number(data.rate,1)}%`,
      `Período: ${dateBR(audit.currentStart)} a ${dateBR(audit.currentLast)}`,
      `Para a lista cliente a cliente, abra “Benefícios” na campanha.`,
    ];

    if (data.examples?.length) lines.push(`Exemplos: ${data.examples.map((row) => `pedido #${row.orderId} / cliente ${row.clientId}`).join(' · ')}`);
    return lines;
  }

  function sourceList(values, max = 20) {
    const list = Array.isArray(values) ? values : [];
    if (!list.length) return 'Nenhum';
    const shown = list.slice(0, max).join(', ');
    return list.length > max ? `${shown} … (+${list.length - max})` : shown;
  }

  function provenancePanel(campaign, data, result) {
    const p = data.provenance || {};
    const scope = p.scope || {};
    const filters = p.filters || {};
    const tables = p.tables || [];
    const cache = data.cache || {};
    const warnings = p.warnings || [];
    const endpoint = p.endpoint || '/api/campanhas-data?recurso=apuracao';

    return `<details class="provenance-panel">
      <summary>
        <span><i data-lucide="scan-search"></i><strong>Verificações, fonte e filtros da apuração</strong><small>Clique para abrir detalhes técnicos.</small></span>
        <span class="source-status ${cache.hit ? 'cached' : 'live'}">${cache.hit ? 'Cache da API' : 'SQL consultado'}</span>
      </summary>
      <div class="provenance-content">
        <div class="source-map-grid">
          <div class="source-map-card">
            <span>Apuração</span><strong>${esc(endpoint)}</strong><small>${esc(p.handler || 'local-api/campanhas-data.js')}</small>
          </div>
          <div class="source-map-card">
            <span>Banco</span><strong>${esc(p.source || data.source || 'SQL Server')}</strong><small>database ${esc(p.database || 'powerbi')}</small>
          </div>
          <div class="source-map-card">
            <span>Data de referência</span><strong>${esc(p.dateReference || data.dateReference || 'dbo.Vendas.[Data]')}</strong><small>É essa coluna que decide em qual período a venda entra.</small>
          </div>
          <div class="source-map-card">
            <span>Escopo efetivo</span><strong>${scope.mode === 'LISTA_DE_PRODUTOS' ? `${number(scope.productCount)} produtos` : `${number(scope.supplierCount)} fornecedor(es)`}</strong><small>${esc(scope.note || '')}</small>
          </div>
        </div>

        <div class="source-columns">
          <section>
            <h4>Tabelas usadas</h4>
            ${tables.length ? tables.map((table) => `<div class="source-table"><strong>${esc(table.name)}</strong><span>${esc(table.role)}</span><small>${esc((table.columns || []).join(' · '))}</small></div>`).join('') : '<small>Metadados de tabela indisponíveis nesta apuração salva.</small>'}
          </section>
          <section>
            <h4>Fórmulas atuais</h4>
            <div class="formula-list">
              <div><b>Faturamento</b><code>${esc(p.metrics?.revenue || 'SUM(dbo.VendasProdutos.[Valor])')}</code></div>
              <div><b>Volume</b><code>${esc(p.metrics?.kg || 'SUM(dbo.VendasProdutos.[Qtde Kg])')}</code></div>
              <div><b>Clientes</b><code>${esc(p.metrics?.customers || 'COUNT DISTINCT dbo.Vendas.[ID Cliente]')}</code></div>
              <div><b>Positivação</b><code>${esc(p.metrics?.positivity || 'clientes atuais - clientes anteriores')}</code></div>
            </div>
          </section>
        </div>

        <div class="source-scope-details">
          <div><span>Produtos enviados à API</span><strong>${esc(sourceList(scope.productIds, 30))}</strong></div>
          <div><span>Fornecedores enviados à API</span><strong>${esc(sourceList(scope.supplierIds, 30))}</strong></div>
          <div><span>Representantes específicos</span><strong>${scope.sellerCount ? esc(sourceList(scope.sellers, 12)) : 'Todos os representantes ativos'}</strong></div>
          <div><span>Filtro de representante ativo</span><strong>${scope.rankingMode === 'REPRESENTANTES_ATIVOS_ATUAIS' ? esc(filters.activeSeller || "Somente no ranking: dbo.Clientes.[Status] LIKE 'ATIV%'") : 'Não se aplica; representantes específicos'}</strong></div>
          <div><span>Conciliação histórica do vendedor</span><strong>${esc(filters.sellerHistory || 'ID numérico final; fallback por nome normalizado sem sufixo')}</strong></div>
          <div><span>Tipo de venda</span><strong>${esc(filters.saleType || 'Sem filtro explícito')}</strong></div>
          <div><span>Forma de venda</span><strong>${esc(filters.saleForm || 'Sem filtro explícito')}</strong></div>
        </div>

        ${warnings.length ? `<div class="source-warnings"><strong><i data-lucide="triangle-alert"></i>Pontos que podem causar diferença com outro relatório</strong>${warnings.map((warning) => `<p>${esc(warning)}</p>`).join('')}</div>` : ''}

        <div class="source-actions">
          <button class="secondary-btn" type="button" data-action="retry-performance" data-id="${esc(campaign.id)}"><i data-lucide="refresh-cw"></i>Reprocessar sem cache</button>
          <button class="secondary-btn" type="button" data-action="consistency-diagnostic" data-id="${esc(campaign.id)}"><i data-lucide="stethoscope"></i>Diagnóstico de consistência</button>
          <small>Base coletiva: ${scope.collectiveMode === 'REPRESENTANTES_ESPECIFICOS' ? 'representantes selecionados' : 'escopo comercial total, sem excluir histórico pelo status atual do vendedor'} · Ranking: ${scope.rankingMode === 'REPRESENTANTES_ESPECIFICOS' ? 'representantes selecionados' : 'representantes ativos atuais'}.</small>
        </div>
        <div id="consistencyDiagnostic" class="consistency-diagnostic-slot"></div>
      </div>
    </details>`;
  }


  function diagnosticModeLabel(mode) {
    return ({
      FORNECEDOR_BRUTO:'Fornecedor bruto',
      FORNECEDOR_VENDEDORES_ATIVOS:'Fornecedor + vendedores ativos',
      PRODUTOS_ATIVOS_VENDEDORES_ATIVOS:'Só produtos hoje ativos',
      ESCOPO_EFETIVO_CAMPANHA:'Escopo efetivo da campanha',
    })[mode] || mode;
  }

  function diagnosticRow(data, mode) {
    const current = (data.totals || []).find((row) => row.mode === mode && row.period === 'current') || {};
    const previous = (data.totals || []).find((row) => row.mode === mode && row.period === 'previous') || {};
    return `<tr>
      <td><strong>${esc(diagnosticModeLabel(mode))}</strong><small>${esc(data.modes?.[mode] || '')}</small></td>
      <td>${number(previous.kg || 0,1)} KG</td>
      <td>${number(current.kg || 0,1)} KG</td>
      <td>${money(previous.revenue || 0)}</td>
      <td>${money(current.revenue || 0)}</td>
      <td>${number(previous.customers || 0)}</td>
      <td>${number(current.customers || 0)}</td>
      <td>${number(current.products || 0)}</td>
    </tr>`;
  }

  function consistencyDiagnosticHtml(data) {
    const catalogTotal = (data.catalog || []).reduce((sum,row) => sum + Number(row.totalProducts || 0), 0);
    const catalogActive = (data.catalog || []).reduce((sum,row) => sum + Number(row.activeProducts || 0), 0);
    const catalogInactive = (data.catalog || []).reduce((sum,row) => sum + Number(row.inactiveProducts || 0), 0);
    const periods = data.periodsUsed || {};
    const modes = ['FORNECEDOR_BRUTO','FORNECEDOR_VENDEDORES_ATIVOS','PRODUTOS_ATIVOS_VENDEDORES_ATIVOS','ESCOPO_EFETIVO_CAMPANHA'];

    return `<div class="consistency-diagnostic">
      <div class="consistency-head">
        <div><span class="eyebrow">Conferência direta no SQL</span><h3>Onde o número está sendo reduzido?</h3><p>Mesma fonte e mesmo período. O que muda abaixo são apenas os filtros.</p></div>
        <span class="source-status live">SQL consultado</span>
      </div>

      <div class="diagnostic-periods">
        <span><b>Anterior:</b> ${dateBR(periods.previousStart)} a ${dateBR(periods.previousLastInclusive)}</span>
        <span><b>Campanha:</b> ${dateBR(periods.currentStart)} a ${dateBR(periods.currentLastInclusive)}</span>
        <span><b>Borda:</b> ${esc(data.dateBoundaryMode || 'data de calendário')}</span>
      </div>

      <div class="diagnostic-catalog">
        <div><span>Produtos cadastrados</span><strong>${number(catalogTotal)}</strong></div>
        <div><span>Ativos hoje</span><strong>${number(catalogActive)}</strong></div>
        <div><span>Inativos hoje</span><strong>${number(catalogInactive)}</strong></div>
        <div><span>Produtos usados no escopo</span><strong>${(data.productIds || []).length ? number(data.productIds.length) : 'Fornecedor inteiro'}</strong></div>
      </div>

      <div class="table-wrap">
        <table class="diagnostic-table">
          <thead><tr><th>Modo</th><th>KG anterior</th><th>KG campanha</th><th>R$ anterior</th><th>R$ campanha</th><th>Clientes ant.</th><th>Clientes atual</th><th>Produtos atual</th></tr></thead>
          <tbody>${modes.map((mode) => diagnosticRow(data, mode)).join('')}</tbody>
        </table>
      </div>

      ${(data.causes || []).length ? `<div class="diagnostic-causes">
        <strong><i data-lucide="scan-line"></i>Diferenças encontradas automaticamente</strong>
        ${(data.causes || []).map((cause) => `<div class="diagnostic-cause ${esc(cause.severity || 'medium')}"><b>${esc(cause.code)}</b><span>${esc(cause.message)}</span></div>`).join('')}
      </div>` : '<div class="diagnostic-ok"><i data-lucide="circle-check"></i>Nenhum corte relevante foi detectado entre os modos comparados.</div>'}

      ${(data.statusBreakdown || []).length ? `<details class="diagnostic-details">
        <summary>Volume por status atual do produto</summary>
        <div class="table-wrap"><table><thead><tr><th>Período</th><th>Status</th><th>Produtos</th><th>KG</th><th>R$</th></tr></thead>
        <tbody>${data.statusBreakdown.map((row) => `<tr><td>${row.period === 'current' ? 'Campanha' : 'Anterior'}</td><td>${esc(row.productStatus)}</td><td>${number(row.products)}</td><td>${number(row.kg,1)}</td><td>${money(row.revenue)}</td></tr>`).join('')}</tbody></table></div>
      </details>` : ''}

      ${(data.saleBreakdown || []).length ? `<details class="diagnostic-details">
        <summary>Tipos e formas de venda encontrados</summary>
        <div class="table-wrap"><table><thead><tr><th>Período</th><th>Tipo</th><th>Forma</th><th>Pedidos</th><th>KG</th><th>R$</th></tr></thead>
        <tbody>${data.saleBreakdown.map((row) => `<tr><td>${row.period === 'current' ? 'Campanha' : 'Anterior'}</td><td>${esc(row.saleType)}</td><td>${esc(row.saleForm)}</td><td>${number(row.orders)}</td><td>${number(row.kg,1)}</td><td>${money(row.revenue)}</td></tr>`).join('')}</tbody></table></div>
      </details>` : ''}
    </div>`;
  }

  async function runConsistencyDiagnostic(campaignId) {
    const slot = $('#consistencyDiagnostic');
    if (!slot) return;

    const campaign = normalizeCampaign(await DB.get('campanhas', campaignId));
    if (!campaign?.id) return;

    const periods = calculatePeriods(campaign);
    const scope = effectiveSalesScope(campaign);

    slot.innerHTML = `<div class="diagnostic-loading"><span class="mini-spinner"></span><span><strong>Comparando no snapshot comercial local…</strong><small>Fornecedor bruto × vendedores ativos × produtos ativos × escopo efetivo.</small></span></div>`;

    try {
      const data = await api(`${SQL_ENDPOINT}?recurso=diagnostico-consistencia`, {
        method:'POST',
        timeout:HEAVY_CALC_TIMEOUT_MS,
        force:true,
        body:JSON.stringify({
          campaignStart:periods.currentStart,
          campaignEnd:periods.currentLast,
          periodMode:campaign.periodMode || 'six_mondays',
          asOfDate:inputDate(new Date()),
          supplierIds:scope.supplierIds,
          productIds:scope.productIds,
          sellers:campaign.participantMode === 'specific' ? campaign.representatives : [],
        }),
      });

      slot.innerHTML = consistencyDiagnosticHtml(data);
      icons(slot);
    } catch (error) {
      slot.innerHTML = `<div class="context-error"><strong>Não foi possível executar o diagnóstico.</strong><br>${esc(error.message)}</div>`;
    }
  }


  function auditSummaryCard(label, current, previous, formatter = (value) => number(value)) {
    return `<div class="audit-summary-card"><span>${esc(label)}</span><strong>${formatter(current)}</strong><small>Anterior: ${formatter(previous)}</small></div>`;
  }

  function sellerAuditHtml(campaign, data) {
    const identity = sellerIdentity(data.seller);
    const current = data.summaries?.current || {};
    const previous = data.summaries?.previous || {};
    const rows = data.rows || [];
    const used = data.periodsUsed || {};

    return `<div class="seller-audit-top">
      <div>
        <span class="eyebrow">${esc(identity.code ? `ID ${identity.code}` : 'Representante')}</span>
        <h3>${esc(identity.name || data.seller)}</h3>
        <p>Linhas participantes exatamente como a API local recebeu do SQL.</p>
        ${data.sellerAliases?.length ? `<small class="seller-alias-note"><strong>Aliases encontrados no SQL:</strong> ${esc(data.sellerAliases.join(' · '))}</small>` : ''}
      </div>
      <div class="audit-source-chip"><i data-lucide="database"></i><span><strong>${esc(data.source || 'SQL Server')}</strong><small>${esc(data.endpoint || '')}</small></span></div>
    </div>

    <div class="audit-period-box">
      <strong>Períodos efetivamente consultados</strong>
      <span>Campanha: ${dateBR(used.currentStart)} a ${dateBR(used.currentLastInclusive)}</span>
      <span>Referência anterior: ${dateBR(used.previousStart)} a ${dateBR(used.previousLastInclusive)}</span>
      <small>${data.partial ? 'A campanha está parcial; a referência anterior oficial permanece completa.' : 'Campanha e referência anterior estão fechadas no período configurado.'}</small>
    </div>

    ${(data.powerBiParity || []).length ? `<section class="powerbi-parity">
      <div class="powerbi-parity-head">
        <span><i data-lucide="split"></i><strong>Correspondência com a consulta do Power BI</strong></span>
        <small>Primeiro toda venda encontrada para a representante; depois o mesmo dado com o escopo da campanha.</small>
      </div>
      <div class="powerbi-parity-grid">
        ${(data.powerBiParity || []).sort((a,b) => a.period === 'previous' ? -1 : 1).map((row) => `
          <div class="powerbi-parity-period">
            <span>${row.period === 'previous' ? 'Período anterior' : 'Período atual'}</span>
            <div class="powerbi-parity-flow">
              <div>
                <small>Representante · todos os produtos</small>
                <strong>${number(row.sellerKgAllProducts,2)} KG</strong>
                <em>${money(row.sellerRevenueAllProducts)} · ${number(row.sellerOrdersAllProducts)} pedidos</em>
              </div>
              <i data-lucide="arrow-right"></i>
              <div>
                <small>Após fornecedor/produtos</small>
                <strong>${number(row.campaignKg,2)} KG</strong>
                <em>${money(row.campaignRevenue)} · ${number(row.campaignOrders)} pedidos</em>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <p class="powerbi-parity-help"><strong>Leitura:</strong> se o primeiro valor existir e o segundo zerar, o corte está no escopo da campanha. Se ambos existirem, o vendedor foi conciliado. Se o primeiro zerar, a divergência ainda está na identificação do vendedor ou na data.</p>
    </section>` : ''}

    <div class="audit-summary-grid">
      ${auditSummaryCard('Faturamento', current.revenue, previous.revenue, money)}
      ${auditSummaryCard('Volume KG', current.kg, previous.kg, (v) => `${number(v,1)} KG`)}
      ${auditSummaryCard('Clientes únicos', current.customers, previous.customers)}
      ${auditSummaryCard('Pedidos', current.orders, previous.orders)}
      ${auditSummaryCard('Produtos distintos', current.products, previous.products)}
    </div>

    <div class="audit-warning-box">
      <strong><i data-lucide="shield-alert"></i>Regras de inclusão que estão valendo agora</strong>
      <p><b>Data:</b> ${esc(data.dateReference || 'dbo.Vendas.[Data]')}</p>
      <p><b>Tipo(s) encontrados:</b> ${esc((data.saleTypes || []).join(' · ') || 'nenhum')}</p>
      <p><b>Forma(s) encontradas:</b> ${esc((data.saleForms || []).join(' · ') || 'nenhuma')}</p>
      ${(data.warnings || []).map((warning) => `<small>${esc(warning)}</small>`).join('')}
    </div>

    <div class="audit-table-head">
      <div><span class="eyebrow">Linhas que formam os números</span><h3>Pedidos e produtos considerados</h3></div>
      <button class="secondary-btn" data-action="copy-seller-audit"><i data-lucide="copy"></i>Copiar diagnóstico</button>
    </div>
    ${data.truncated ? '<div class="context-error">A auditoria chegou ao limite de 1.500 linhas. Restrinja o escopo da campanha para investigação completa.</div>' : ''}
    <div class="table-wrap audit-table-wrap">
      <table class="audit-table">
        <thead><tr><th>Período</th><th>Data</th><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Forma</th><th>Produto</th><th>Fornecedor</th><th>R$ linha</th><th>KG</th><th>PC</th><th>R$ pedido inteiro*</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td><span class="badge ${row.period === 'current' ? 'active' : 'scheduled'}">${row.period === 'current' ? 'Campanha' : 'Anterior'}</span></td>
          <td>${dateBR(row.orderDate)}</td>
          <td><strong>#${esc(row.orderId)}</strong></td>
          <td>${esc(row.clientId)}</td>
          <td>${esc(row.saleType)}</td>
          <td>${esc(row.saleForm)}</td>
          <td><strong>${esc(row.productId)}</strong><small>${esc(row.productName)}</small></td>
          <td>${row.supplierId ? `<strong>${esc(row.supplierId)}</strong>` : ''}<small>${esc(row.supplierName)}</small></td>
          <td>${money(row.revenue)}</td>
          <td>${number(row.kg,2)}</td>
          <td>${number(row.pieces,2)}</td>
          <td>${money(row.wholeOrderValue)}</td>
        </tr>`).join('') || '<tr><td colspan="12">Nenhuma linha encontrada para esse representante e escopo.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="audit-footnote">* O valor total do pedido é apenas referência. A campanha soma somente <code>dbo.VendasProdutos.[Valor]</code> dos produtos participantes.</p>`;
  }

  async function openSellerAudit(campaignId, seller) {
    const backdrop = $('#sellerAuditBackdrop');
    const body = $('#sellerAuditBody');
    const campaign = normalizeCampaign(await DB.get('campanhas', campaignId));
    if (!campaign?.id) return;

    backdrop.hidden = false;
    body.innerHTML = `<div class="loading-stage"><div><div class="spinner"></div><h3>Auditando ${esc(sellerIdentity(seller).name || seller)}</h3><p>Auditando pedidos e produtos no snapshot comercial diário para conferir a origem dos números.</p></div></div>`;
    $('#sellerAuditTitle').textContent = `Origem dos números · ${sellerIdentity(seller).name || seller}`;
    icons(backdrop);

    const periods = calculatePeriods(campaign);
    const salesScope = effectiveSalesScope(campaign);
    const productIds = salesScope.productIds;
    const supplierIds = salesScope.supplierIds;

    try {
      const data = await api(`${SQL_ENDPOINT}?recurso=auditoria-vendedor`, {
        method:'POST',
        timeout:HEAVY_CALC_TIMEOUT_MS, force:true,
        body:JSON.stringify({
          campaignStart:periods.currentStart,
          campaignEnd:periods.currentLast,
          periodMode:campaign.periodMode || 'six_mondays',
          asOfDate:inputDate(new Date()),
          seller,
          productIds,
          supplierIds,
          salesScopeMode:salesScope.mode,
        }),
      });
      app.sellerAudit = { campaignId, seller, data };
      body.innerHTML = sellerAuditHtml(campaign, data);
      icons(body);
    } catch (error) {
      body.innerHTML = `<div class="context-error"><strong>Não foi possível abrir a auditoria do vendedor.</strong><br>${esc(error.message)}</div>`;
    }
  }

  function closeSellerAudit() {
    $('#sellerAuditBackdrop').hidden = true;
    app.sellerAudit = null;
  }

  async function copySellerAudit() {
    if (!app.sellerAudit?.data) return;
    const payload = {
      seller:app.sellerAudit.seller,
      source:app.sellerAudit.data.source,
      endpoint:app.sellerAudit.data.endpoint,
      dateReference:app.sellerAudit.data.dateReference,
      periodsUsed:app.sellerAudit.data.periodsUsed,
      scope:app.sellerAudit.data.scope,
      summaries:app.sellerAudit.data.summaries,
      saleTypes:app.sellerAudit.data.saleTypes,
      saleForms:app.sellerAudit.data.saleForms,
      warnings:app.sellerAudit.data.warnings,
      rows:app.sellerAudit.data.rows,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast('Diagnóstico copiado para a área de transferência.');
    } catch (_) {
      toast('Não foi possível copiar o diagnóstico.', 'error');
    }
  }


  function benefitRuleProducts(campaign) {
    const rule = campaign.orderActivationRule || {};
    const triggerCategory = (campaign.categories || []).find((category) => category.id === rule.triggerCategoryId);
    const benefitCategory = (campaign.categories || []).find((category) => category.id === rule.baseCategoryId);
    return {
      triggerCategory,
      benefitCategory,
      triggerProducts:(triggerCategory?.products || []).map((product) => ({ id:Number(product.id), name:product.name })),
      benefitProducts:(benefitCategory?.products || []).map((product) => ({ id:Number(product.id), name:product.name })),
    };
  }

  function benefitStatusMeta(status) {
    return ({
      AVAILABLE:{ label:'Direito disponível', className:'available', icon:'circle-check-big' },
      USED:{ label:'Benefício utilizado', className:'used', icon:'badge-check' },
      INELIGIBLE_PRIOR_PURCHASE:{ label:'Sem direito · compra anterior', className:'blocked', icon:'ban' },
      CONSUMED_WITHOUT_BENEFIT:{ label:'1ª compra sem item beneficiado', className:'warning', icon:'triangle-alert' },
    })[status] || { label:status || '—', className:'', icon:'circle-help' };
  }

  function benefitDiscountLabel(config = {}) {
    if (config.discountType === 'percent') return `${number(config.discountValue,2)}% sobre produtos beneficiados`;
    if (config.discountType === 'fixed_per_piece') return `${money2(config.discountValue)} por peça`;
    if (config.discountType === 'fixed') return `${money2(config.discountValue)} por pedido`;
    return 'Valor a definir';
  }

  function benefitRowsFiltered() {
    const report = app.benefitReport;
    if (!report?.data?.clients) return [];
    const query = norm(report.search || '');
    const status = report.status || 'all';
    return report.data.clients.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!query) return true;
      return norm(`${row.clientId} ${row.clientName} ${row.tradeName} ${row.document} ${row.seller} ${row.city} ${row.uf} ${row.firstOrderId}`).includes(query);
    });
  }

  function benefitReportHtml(campaign, data) {
    const summary = data.summary || {};
    const rows = benefitRowsFiltered();
    const displayed = rows.slice(0, 350);
    const config = data.configuration || {};
    const statusOptions = [
      ['all','Todos'],
      ['AVAILABLE','Direito disponível'],
      ['USED','Benefício utilizado'],
      ['INELIGIBLE_PRIOR_PURCHASE','Sem direito · compra anterior'],
      ['CONSUMED_WITHOUT_BENEFIT','1ª compra sem item beneficiado'],
    ];

    return `<div class="benefit-report-shell">
      <div class="benefit-report-intro">
        <div>
          <span class="eyebrow">Controle operacional</span>
          <h3>${esc(config.name || 'Benefício de primeira compra')}</h3>
          <p>${esc(config.triggerCategoryName || 'Produto ativador')} libera desconto em ${esc(config.benefitCategoryName || 'produtos beneficiados')}. ${config.firstPurchaseMode === 'historical_trigger' ? 'O cliente só tem direito se nunca tiver comprado o ativador antes do início da campanha.' : 'A primeira compra considerada é a primeira dentro da campanha.'}</p>
        </div>
        <span class="benefit-discount-chip"><i data-lucide="badge-percent"></i>${esc(benefitDiscountLabel(config))}</span>
      </div>

      <div class="benefit-summary-grid">
        <div><span>Clientes ativos analisados</span><strong>${number(summary.totalClients)}</strong></div>
        <div class="available"><span>Direito disponível</span><strong>${number(summary.available)}</strong></div>
        <div class="used"><span>Benefício utilizado</span><strong>${number(summary.used)}</strong></div>
        <div class="blocked"><span>Sem direito por compra anterior</span><strong>${number(summary.ineligiblePrior)}</strong></div>
        <div class="warning"><span>1ª compra sem item beneficiado</span><strong>${number(summary.consumedWithoutBenefit)}</strong></div>
        <div><span>Desconto estimado utilizado</span><strong>${config.discountType === 'pending' ? 'A definir' : money2(summary.estimatedDiscountUsed)}</strong></div>
      </div>

      <div class="benefit-source-line">
        <span><i data-lucide="database"></i><strong>Fonte:</strong> ${esc(data.source || 'SQL Server')} · dbo.Clientes + dbo.Vendas + dbo.VendasProdutos + dbo.Produtos</span>
        <span><strong>Período:</strong> ${dateBR(data.periodsUsed?.currentStart)} a ${dateBR(data.periodsUsed?.currentLastInclusive)}</span>
      </div>

      <details class="benefit-entitlement" open>
        <summary>
          <span><i data-lucide="package-check"></i><strong>Produtos aos quais um cliente com direito pode aplicar o benefício</strong></span>
          <small>${number((config.benefitProducts || []).length)} produto(s)</small>
        </summary>
        <div class="benefit-entitlement-products">
          ${(config.benefitProducts || []).map((product) => `<span><b>${esc(product.id)}</b>${esc(product.name)}</span>`).join('') || '<small>Nenhum produto beneficiado configurado.</small>'}
        </div>
      </details>

      <div class="benefit-export-inline">
        <button class="secondary-btn" type="button" data-action="export-benefit-eligible"><i data-lucide="ticket-check"></i>Exportar quem tem direito</button>
        <button class="primary-btn" type="button" data-action="export-benefit-all"><i data-lucide="file-down"></i>Exportar relatório completo</button>
      </div>

      <div class="benefit-toolbar">
        <div class="search-field"><i data-lucide="search"></i><input id="benefitSearch" placeholder="Buscar cliente, ID, CNPJ/CPF ou vendedor" value="${esc(app.benefitReport?.search || '')}"></div>
        <select id="benefitStatusFilter">${statusOptions.map(([value,label]) => `<option value="${value}" ${app.benefitReport?.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="hint">${number(rows.length)} cliente(s) no filtro</span>
      </div>

      <div class="table-wrap benefit-table-wrap">
        <table class="benefit-table">
          <thead><tr>
            <th>Status</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Primeira compra do ativador</th>
            <th>Pedido</th>
            <th>Produtos beneficiados no pedido</th>
            <th>Valor beneficiado</th>
            <th>Desconto</th>
            <th>Motivo / situação</th>
          </tr></thead>
          <tbody>${displayed.map((row) => {
            const meta = benefitStatusMeta(row.status);
            return `<tr>
              <td><span class="benefit-status ${meta.className}"><i data-lucide="${meta.icon}"></i>${esc(meta.label)}</span></td>
              <td><strong>${esc(row.tradeName || row.clientName || `Cliente ${row.clientId}`)}</strong><small>ID ${esc(row.clientId)}${row.clientName && row.tradeName ? ` · ${esc(row.clientName)}` : ''}${row.document ? ` · ${esc(row.document)}` : ''}</small></td>
              <td><strong>${esc(sellerIdentity(row.seller).name || row.seller || '—')}</strong>${sellerIdentity(row.seller).code ? `<small>ID ${esc(sellerIdentity(row.seller).code)}</small>` : ''}</td>
              <td>${row.firstTriggerDate ? `<strong>${dateBR(row.firstTriggerDate)}</strong><small>${row.status === 'INELIGIBLE_PRIOR_PURCHASE' ? 'antes da campanha' : 'durante a campanha'}</small>` : '<span class="muted-cell">Ainda não comprou</span>'}</td>
              <td>${row.firstOrderId ? `<strong>#${esc(row.firstOrderId)}</strong>` : '—'}</td>
              <td>${row.benefitLines?.length ? `<div class="benefit-lines">${row.benefitLines.slice(0,4).map((line) => `<span>${esc(line.productName)} <b>× ${number(line.pieces,2)}</b></span>`).join('')}${row.benefitLines.length > 4 ? `<small>+${row.benefitLines.length - 4} item(ns)</small>` : ''}</div>` : '<span class="muted-cell">Nenhum</span>'}</td>
              <td>${row.benefitRevenue ? `<strong>${money2(row.benefitRevenue)}</strong><small>${number(row.benefitKg,2)} KG · ${number(row.benefitPieces,2)} unidades</small>` : '—'}</td>
              <td>${config.discountType === 'pending' ? '<span class="muted-cell">A definir</span>' : row.status === 'USED' ? `<strong>${money2(row.estimatedDiscount)}</strong>` : '—'}</td>
              <td><small class="benefit-reason">${esc(row.reason || '')}</small></td>
            </tr>`;
          }).join('') || '<tr><td colspan="9">Nenhum cliente encontrado neste filtro.</td></tr>'}</tbody>
        </table>
      </div>
      ${rows.length > displayed.length ? `<div class="benefit-limit-note">A tela mostra os primeiros ${number(displayed.length)} resultados para continuar leve. A exportação inclui todos os ${number(rows.length)} clientes filtrados.</div>` : ''}
    </div>`;
  }

  function renderBenefitReport() {
    if (!app.benefitReport?.campaign || !app.benefitReport?.data) return;
    for (const selector of ['#benefitReportBody', '#benefitInlineBody']) {
      const target = $(selector);
      if (!target) continue;
      target.innerHTML = benefitReportHtml(app.benefitReport.campaign, app.benefitReport.data);
      icons(target);
    }
  }

  async function loadBenefitReportData(campaignId, { force = false, targetSelector = '#benefitReportBody', openModal = false } = {}) {
    const campaign = normalizeCampaign(await DB.get('campanhas', campaignId));
    if (!campaign?.id) return null;
    if (!campaign.orderActivationRule?.enabled) {
      toast('Esta campanha não possui benefício de primeira compra ativo.', 'warning');
      return null;
    }

    const products = benefitRuleProducts(campaign);
    if (!products.triggerProducts.length || !products.benefitProducts.length) {
      toast('Configure os produtos ativadores e beneficiados antes de abrir o relatório.', 'warning');
      return null;
    }

    if (openModal) {
      $('#benefitBackdrop').hidden = false;
      document.body.style.overflow = 'hidden';
      $('#benefitReportTitle').textContent = campaign.name;
    }

    const target = $(targetSelector);
    if (target) {
      target.innerHTML = `<div class="loading-stage"><div><div class="spinner"></div><h3>Montando lista de benefícios</h3><p>Conferindo clientes, primeira compra do ativador e produtos beneficiados no snapshot comercial diário.</p></div></div>`;
    }

    const rule = campaign.orderActivationRule;
    const periods = calculatePeriods(campaign);

    try {
      const data = await api(`${SQL_ENDPOINT}?recurso=beneficio-primeira-compra`, {
        method:'POST',
        timeout:HEAVY_CALC_TIMEOUT_MS,
        force,
        body:JSON.stringify({
          campaignStart:periods.currentStart,
          campaignEnd:periods.currentLast,
          periodMode:campaign.periodMode || 'six_mondays',
          asOfDate:inputDate(new Date()),
          sellers:campaign.participantMode === 'specific' ? campaign.representatives : [],
          participantMode:campaign.participantMode,
          triggerProductIds:products.triggerProducts.map((product) => product.id),
          benefitProductIds:products.benefitProducts.map((product) => product.id),
          triggerMin:Number(rule.triggerMin) || 1,
          triggerMeasure:rule.triggerMeasure || 'distinct_products',
          benefitMin:Number(rule.baseMin) || 1,
          benefitMeasure:rule.baseMeasure || 'distinct_products',
          firstPurchaseMode:rule.firstPurchaseMode || 'campaign_trigger',
          discountType:rule.discountType || 'pending',
          discountValue:Number(rule.discountValue) || 0,
          ruleName:rule.name || 'Benefício de primeira compra',
          triggerCategoryName:products.triggerCategory?.name || 'Produto ativador',
          benefitCategoryName:products.benefitCategory?.name || 'Produtos beneficiados',
          forceRefresh:force,
        }),
      });

      app.benefitReport = { campaignId, campaign, data, search:'', status:'all' };
      renderBenefitReport();
      return data;
    } catch (error) {
      if (target) {
        target.innerHTML = `<div class="context-error"><strong>Não foi possível montar o relatório de benefícios.</strong><br>${esc(error.message)}${error.hint ? `<br>${esc(error.hint)}` : ''}<br><button class="secondary-btn" data-action="${openModal ? 'refresh-benefit-report' : 'refresh-benefit-inline'}" data-id="${esc(campaignId)}" style="margin-top:10px">Tentar novamente</button></div>`;
      }
      return null;
    }
  }

  async function openBenefitReport(campaignId, { force = false } = {}) {
    return loadBenefitReportData(campaignId, {
      force,
      targetSelector:'#benefitReportBody',
      openModal:true,
    });
  }

  async function loadBenefitReportInline(campaignId, { force = false } = {}) {
    if (!force && app.benefitReport?.campaignId === campaignId && app.benefitReport?.data) {
      renderBenefitReport();
      return app.benefitReport.data;
    }
    return loadBenefitReportData(campaignId, {
      force,
      targetSelector:'#benefitInlineBody',
      openModal:false,
    });
  }

  function switchPerformanceTab(tab, campaignId) {
    $$('.performance-tab').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.performanceTab === tab);
    });

    $$('[data-performance-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.performancePanel !== tab;
    });

    if (tab === 'benefit') void loadBenefitReportInline(campaignId);
  }

  function closeBenefitReport() {
    $('#benefitBackdrop').hidden = true;
    app.benefitReport = null;
    if ($('#drawerBackdrop').hidden && $('#modalBackdrop').hidden && $('#sellerAuditBackdrop').hidden) document.body.style.overflow = '';
  }

  function benefitCsvRows(mode = 'filtered') {
    const report = app.benefitReport;
    if (!report?.data) return [];
    const config = report.data.configuration || {};
    const rows = mode === 'all'
      ? (report.data.clients || [])
      : mode === 'eligible'
        ? (report.data.clients || []).filter((row) => row.status === 'AVAILABLE')
        : benefitRowsFiltered();
    const targetList = (config.benefitProducts || []).map((product) => `${product.id} - ${product.name}`).join(' | ');

    return rows.map((row) => ({
      Status:benefitStatusMeta(row.status).label,
      'Tem direito agora':row.status === 'AVAILABLE' ? 'SIM' : 'NÃO',
      'ID Cliente':row.clientId,
      Cliente:row.clientName || '',
      'Nome Fantasia':row.tradeName || '',
      'CNPJ/CPF':row.document || '',
      'Vendedor atual':row.seller || '',
      Cidade:row.city || '',
      UF:row.uf || '',
      'Primeira compra do ativador':row.firstTriggerDate ? dateBR(row.firstTriggerDate) : '',
      'Pedido da primeira compra':row.firstOrderId || '',
      'Vendedor do pedido':row.firstOrderSeller || '',
      'Produtos ativadores no pedido':(row.triggerLines || []).map((line) => `${line.productId} - ${line.productName} x ${number(line.pieces,2)}`).join(' | '),
      'Produtos beneficiados no pedido':(row.benefitLines || []).map((line) => `${line.productId} - ${line.productName} x ${number(line.pieces,2)}`).join(' | '),
      'Unidades beneficiadas':number(row.benefitPieces || 0, 2),
      'KG beneficiado':number(row.benefitKg || 0, 2),
      'Valor beneficiado':number(row.benefitRevenue || 0, 2),
      'Regra de desconto':benefitDiscountLabel(config),
      'Desconto estimado':config.discountType === 'pending' ? '' : number(row.estimatedDiscount || 0, 2),
      'Produtos aos quais tem direito':targetList,
      Motivo:row.reason || '',
    }));
  }

  function csvCell(value) {
    const raw = String(value ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return `"${raw}"`;
  }

  function benefitCsvText(mode = 'filtered') {
    const rows = benefitCsvRows(mode);
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    return [headers.map(csvCell).join(';'), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(';'))].join('\r\n');
  }

  function exportBenefitCsv(mode = 'filtered') {
    const text = benefitCsvText(mode);
    if (!text) {
      const label = mode === 'eligible' ? 'Não há clientes com direito disponível.' : 'Não há clientes para exportar.';
      return toast(label, 'warning');
    }

    const campaign = app.benefitReport?.campaign;
    const suffix = mode === 'eligible'
      ? 'clientes-com-direito'
      : mode === 'all'
        ? 'relatorio-completo'
        : 'filtro-atual';

    const blob = new Blob([`\uFEFF${text}`], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `beneficios-${String(campaign?.name || 'campanha').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()}-${suffix}-${inputDate(new Date())}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${benefitCsvRows(mode).length} cliente(s) exportado(s).`);
  }

  async function copyBenefitCsv() {
    const text = benefitCsvText('filtered');
    if (!text) return toast('Não há clientes neste filtro para copiar.', 'warning');
    try {
      await navigator.clipboard.writeText(text);
      toast('Lista de benefícios copiada.');
    } catch (_) {
      toast('Não foi possível copiar a lista.', 'error');
    }
  }



  function remainingTargetText(current, previous, formatter) {
    const difference = Number(previous || 0) - Number(current || 0);
    if (difference > 0) return `Faltam ${formatter(difference)} para alcançar o período anterior completo.`;
    if (difference < 0) return `Já superou o período anterior completo em ${formatter(Math.abs(difference))}.`;
    return 'Já igualou o período anterior completo.';
  }

  function partialProgressHtml(result, data) {
    if (!data.partial) return '';
    const summary = result.summary || {};
    const hasEquivalent = Boolean(data.equivalentPreviousSummary);
    const equivalent = data.equivalentPreviousSummary || {};
    const elapsed = Number(data.elapsedDays || 0);
    const configuredStart = result.periods?.currentStart ? new Date(`${result.periods.currentStart}T12:00:00`) : null;
    const configuredLast = result.periods?.currentLast ? new Date(`${result.periods.currentLast}T12:00:00`) : null;
    const inferredTotal = configuredStart && configuredLast ? Math.floor((configuredLast - configuredStart) / 86400000) + 1 : 0;
    const total = Number(data.totalDays || result.periods?.days || inferredTotal || 0);
    const remaining = Number.isFinite(Number(data.remainingDays)) ? Number(data.remainingDays) : Math.max(0, total - elapsed);
    const eqEndExclusive = data.previousEquivalentEndExclusive;
    let eqLast = null;
    if (eqEndExclusive) {
      const date = new Date(`${String(eqEndExclusive).slice(0,10)}T12:00:00`);
      date.setDate(date.getDate() - 1);
      eqLast = inputDate(date);
    }

    return `<section class="partial-progress-card">
      <div class="partial-progress-head">
        <div><span class="eyebrow">Acompanhamento parcial</span><h3>O que está sendo comparado agora?</h3></div>
        <span class="partial-days">${number(elapsed)} de ${number(total)} dias · ${number(remaining)} restante(s)</span>
      </div>

      <div class="partial-explain-grid">
        <div class="partial-explain official">
          <span>Comparação oficial de metas/crescimento</span>
          <strong>Atual parcial × anterior completo</strong>
          <small>Atual ${dateBR(data.periodsUsed?.currentStart)} a ${dateBR(data.periodsUsed?.currentLastInclusive)} · anterior ${dateBR(data.periodsUsed?.previousStart)} a ${dateBR(data.periodsUsed?.previousLastInclusive)}.</small>
        </div>
        <div class="partial-explain pace">
          <span>Ritmo equivalente</span>
          <strong>${hasEquivalent ? `${pct(growth(summary.revenue, equivalent.revenue))} R$ · ${pct(growth(summary.kg, equivalent.kg))} KG` : 'Calculando na atualização…'}</strong>
          <small>${hasEquivalent ? `Compara os ${number(elapsed)} dias já decorridos com os mesmos ${number(elapsed)} dias no início da referência anterior${eqLast ? ` (${dateBR(data.periodsUsed?.previousStart)} a ${dateBR(eqLast)})` : ''}.` : 'A apuração salva é de uma versão anterior. O ritmo equivalente aparecerá após a próxima consulta ao SQL.'}</small>
        </div>
      </div>

      <div class="partial-target-grid">
        <div><span>Faturamento</span><strong>${money(summary.revenue)}</strong><small>${remainingTargetText(summary.revenue, summary.previousRevenue, money)}</small></div>
        <div><span>Volume</span><strong>${number(summary.kg,1)} KG</strong><small>${remainingTargetText(summary.kg, summary.previousKg, (value) => `${number(value,1)} KG`)}</small></div>
        <div><span>Clientes</span><strong>${number(summary.customers)}</strong><small>${remainingTargetText(summary.customers, summary.previousCustomers, (value) => `${number(value)} cliente(s)`)}</small></div>
      </div>
      <p class="partial-footnote"><i data-lucide="info"></i>O ritmo equivalente é apenas acompanhamento. Ele não altera ranking, elegibilidade ou meta configurada.</p>
    </section>`;
  }

  function comparisonMetricCell(title, currentHtml, previousHtml, deltaHtml, currentAudit, previousAudit, deltaAudit) {
    return `<div class="seller-compare-cell">
      <span class="seller-compare-title">${esc(title)}</span>
      <div class="seller-compare-values">
        <div><small>Atual</small>${auditValue(`<strong>${currentHtml}</strong>`, currentAudit)}</div>
        <div><small>Anterior</small>${auditValue(`<strong>${previousHtml}</strong>`, previousAudit)}</div>
      </div>
      <div class="seller-compare-delta">${auditValue(deltaHtml, deltaAudit)}</div>
    </div>`;
  }



  function prizeForPosition(campaign, position) {
    return (campaign.prizes || []).find((prize) => Number(prize.position) === Number(position)) || null;
  }

  function resultPrimaryMetric(campaign, item) {
    const metrics = campaign.rankingMetrics || [];
    const primary = metrics[0] || 'points';
    const secondary = metrics[1] || null;

    return {
      primary,
      primaryLabel:metricLabel(primary),
      primaryValue:metricDisplay(primary, rankMetric(item, primary)),
      secondary,
      secondaryLabel:secondary ? metricLabel(secondary) : '',
      secondaryValue:secondary ? metricDisplay(secondary, rankMetric(item, secondary)) : '',
    };
  }

  function outcomeSellerCompact(campaign, item, kind) {
    const identity = sellerIdentity(item.name);
    const metric = resultPrimaryMetric(campaign, item);
    const prize = prizeForPosition(campaign, item.position);
    const reason = item.reasons?.[0] || '';

    const statusLabel = kind === 'winner'
      ? 'Ganhador'
      : kind === 'potential'
        ? 'Na zona de classificação'
        : kind === 'eligible'
          ? 'Elegível'
          : 'Inelegível';

    return `<div class="outcome-seller ${kind}">
      <div class="outcome-seller-rank">${number(item.position)}</div>
      <div class="outcome-seller-main">
        <div class="outcome-seller-name">
          <strong>${esc(identity.name || item.name)}</strong>
          ${identity.code ? `<small>ID ${esc(identity.code)}</small>` : ''}
        </div>
        <div class="outcome-seller-metrics">
          <span><small>${esc(metric.primaryLabel)}</small><strong>${esc(metric.primaryValue)}</strong></span>
          ${metric.secondary ? `<span><small>${esc(metric.secondaryLabel)}</small><strong>${esc(metric.secondaryValue)}</strong></span>` : ''}
        </div>
        ${prize?.description ? `<div class="outcome-prize"><i data-lucide="gift"></i><span>${esc(prize.description)}</span></div>` : ''}
        ${kind === 'ineligible' && reason ? `<div class="outcome-reason"><i data-lucide="circle-x"></i><span>${esc(reason)}</span></div>` : ''}
      </div>
      <div class="outcome-seller-side">
        <span class="outcome-status ${kind}">${esc(statusLabel)}</span>
        <button class="outcome-audit-btn" type="button" data-action="audit-seller" data-campaign-id="${esc(campaign.id)}" data-seller="${esc(item.name)}" title="Auditar origem">
          <i data-lucide="scan-search"></i>
        </button>
      </div>
    </div>`;
  }

  function performanceOutcomeBoard(campaign, result) {
    const rows = result.results || [];
    const collectiveHit = Boolean(result.collectiveHit);

    const classified = rows.filter((item) => item.eligible && item.classified);
    const winners = collectiveHit ? classified : [];
    const potential = collectiveHit ? [] : classified;
    const eligible = rows.filter((item) => item.eligible && !item.classified);
    const ineligible = rows.filter((item) => !item.eligible);

    const highlightRows = collectiveHit ? winners : potential;
    const highlightKind = collectiveHit ? 'winner' : 'potential';

    const rankingModeLabel = campaign.rankingMode === 'ALL_ELIGIBLE'
      ? 'Todos que atingirem'
      : campaign.rankingMode === 'TOP_N'
        ? `Top ${number(campaign.topN)} geral`
        : `Top ${number(campaign.topN)} entre elegíveis`;

    return `<section class="outcome-board">
      <div class="outcome-board-head">
        <div>
          <span class="eyebrow">Resultado da campanha</span>
          <h3>Quem ganhou, quem está elegível e quem ficou de fora</h3>
          <p>${esc(rankingModeLabel)} · prioridade: ${(campaign.rankingMetrics || []).map((metric) => esc(metricLabel(metric))).join(' → ') || 'ranking configurado'}.</p>
        </div>
        <span class="outcome-collective ${collectiveHit ? 'hit' : 'pending'}">
          <i data-lucide="${collectiveHit ? 'circle-check' : 'clock-3'}"></i>
          ${collectiveHit ? 'Meta coletiva liberada' : 'Meta coletiva pendente'}
        </span>
      </div>

      <div class="outcome-summary-grid">
        <div class="outcome-summary-card winners">
          <span>${collectiveHit ? 'Ganhadores / classificados' : 'Na zona de classificação'}</span>
          <strong>${number(highlightRows.length)}</strong>
          <small>${collectiveHit ? 'Já estão dentro da classificação final atual.' : 'Seriam classificados se a meta coletiva fosse liberada agora.'}</small>
        </div>
        <div class="outcome-summary-card eligible">
          <span>Elegíveis fora do corte</span>
          <strong>${number(eligible.length)}</strong>
          <small>Cumpriram a elegibilidade, mas estão fora da faixa de classificação.</small>
        </div>
        <div class="outcome-summary-card ineligible">
          <span>Inelegíveis</span>
          <strong>${number(ineligible.length)}</strong>
          <small>Não cumpriram pelo menos uma condição obrigatória da campanha.</small>
        </div>
      </div>

      <div class="outcome-winner-zone ${collectiveHit ? '' : 'pending'}">
        <div class="outcome-zone-head">
          <div>
            <span>${collectiveHit ? 'Classificação atual' : 'Classificação provisória'}</span>
            <strong>${collectiveHit ? 'Ganhadores em destaque' : 'Quem está na zona de prêmio'}</strong>
          </div>
          <small>${collectiveHit ? 'A ordem abaixo já considera ranking, elegibilidade e desempates.' : 'A ordem já considera ranking e elegibilidade, mas depende da meta coletiva.'}</small>
        </div>

        <div class="outcome-winners-list">
          ${highlightRows.length
            ? highlightRows.map((item) => outcomeSellerCompact(campaign, item, highlightKind)).join('')
            : `<div class="outcome-empty"><i data-lucide="trophy"></i><strong>Ninguém classificado neste momento</strong><span>${collectiveHit ? 'Nenhum representante entrou na faixa de classificação.' : 'A campanha ainda não possui representantes na zona de classificação.'}</span></div>`}
        </div>
      </div>

      <div class="outcome-secondary-grid">
        <section class="outcome-group eligible">
          <div class="outcome-group-head">
            <span><i data-lucide="badge-check"></i><strong>Elegíveis fora do corte</strong></span>
            <b>${number(eligible.length)}</b>
          </div>
          <div class="outcome-group-list">
            ${eligible.length
              ? eligible.map((item) => outcomeSellerCompact(campaign, item, 'eligible')).join('')
              : `<div class="outcome-group-empty">Nenhum elegível fora do corte.</div>`}
          </div>
        </section>

        <section class="outcome-group ineligible">
          <div class="outcome-group-head">
            <span><i data-lucide="badge-x"></i><strong>Inelegíveis</strong></span>
            <b>${number(ineligible.length)}</b>
          </div>
          <div class="outcome-group-list">
            ${ineligible.length
              ? ineligible.map((item) => outcomeSellerCompact(campaign, item, 'ineligible')).join('')
              : `<div class="outcome-group-empty">Nenhum representante inelegível.</div>`}
          </div>
        </section>
      </div>
    </section>`;
  }


  function performanceHtml(campaign, result, data) {
    const summary = result.summary;
    const used = data.periodsUsed || {};
    const nominal = data.nominalPeriods || {};
    const isPartial = Boolean(data.partial);
    const audit = performanceAuditContext(campaign, data, result);
    const apiCache = data.cache || {};

    const currentUsedStart = used.currentStart || result.periods.currentStart;
    const currentUsedLast = used.currentLastInclusive || result.periods.currentLast;
    const previousUsedStart = used.previousStart || result.periods.previousStart;
    const previousUsedLast = used.previousLastInclusive || result.periods.previousLast;

    const periodAudit = isPartial
      ? `<div class="period-audit partial">
          <div class="period-audit-icon"><i data-lucide="calendar-clock"></i></div>
          <div>
            <strong>Apuração parcial até ${dateBR(data.asOfDate || currentUsedLast)}</strong>
            <p>Atual usado: ${dateBR(currentUsedStart)} a ${dateBR(currentUsedLast)} · referência anterior oficial completa: ${dateBR(previousUsedStart)} a ${dateBR(previousUsedLast)}.</p>
            <small>A campanha completa continua sendo ${dateBR(nominal.currentStart || result.periods.currentStart)} a ${dateBR(nominal.currentLastInclusive || result.periods.currentLast)}. A referência anterior permanece completa; abaixo mostramos também o ritmo equivalente dos mesmos dias já decorridos.</small>
          </div>
        </div>`
      : `<div class="period-audit">
          <div class="period-audit-icon"><i data-lucide="calendar-check-2"></i></div>
          <div>
            <strong>Apuração do período configurado completo</strong>
            <p>Campanha ${dateBR(currentUsedStart)} a ${dateBR(currentUsedLast)} · anterior ${dateBR(previousUsedStart)} a ${dateBR(previousUsedLast)}.</p>
          </div>
        </div>`;

    const collectiveBaseBanner = `<div class="collective-base-banner">
      <i data-lucide="scale"></i>
      <div>
        <strong>Base coletiva separada do ranking</strong>
        <span>${campaign.participantMode === 'specific'
          ? 'KPIs, meta coletiva e ranking usam os representantes selecionados.'
          : 'KPIs e meta coletiva usam o escopo comercial total; o ranking continua nos representantes ativos atuais.'}</span>
      </div>
    </div>`;

    const overviewHtml = `${periodAudit}
    ${provenancePanel(campaign, data, result)}
    ${collectiveBaseBanner}
    ${partialProgressHtml(result, data)}
    <div class="performance-kpis">
      ${performanceMeta('Faturamento', money(summary.revenue), `Anterior ${money(summary.previousRevenue)} · ${pct(growth(summary.revenue, summary.previousRevenue))}`)}
      ${performanceMeta('Volume', `${number(summary.kg,1)} KG`, `Anterior ${number(summary.previousKg,1)} KG · ${pct(growth(summary.kg, summary.previousKg))}`)}
      ${performanceMeta('Clientes', number(summary.customers), `Anterior ${number(summary.previousCustomers)} · ${pct(growth(summary.customers, summary.previousCustomers))}`)}
      ${performanceMeta('Positivação', `${summary.positivity >= 0 ? '+' : ''}${number(summary.positivity)}`, `${number(summary.customers)} atuais − ${number(summary.previousCustomers)} anteriores`)}
      ${performanceMeta('Pontos', number(summary.points,1), 'total da campanha')}
      ${performanceMeta('Elegíveis', number(summary.eligible), `${summary.classified} classificado(s)`)}
    </div>

    ${result.collectiveGoals.length
      ? `<div class="goal-status-grid">${result.collectiveGoals.map((goal) => `
          <div class="goal-status ${goal.hit ? 'success' : 'danger'}">
            <div class="goal-status-title">
              <strong>${goal.hit ? 'Meta coletiva atingida' : 'Meta coletiva não atingida'}</strong>
              <span class="badge ${goal.hit ? 'active' : 'danger'}">${goal.hit ? 'Atingida' : 'Pendente'}</span>
            </div>
            <h4>${esc(goal.mode === 'growth_percent' ? `Crescimento de ${metricLabel(goal.metric, true)}` : metricLabel(goal.metric))}</h4>
            ${goalComparisonHtml(goal)}
          </div>`).join('')}</div>`
      : '<div class="goal-status-grid"><div class="goal-status"><strong>Meta coletiva não configurada</strong><small>O ranking depende apenas das metas individuais, elegibilidade e métricas selecionadas.</small></div></div>'}

    ${performanceOutcomeBoard(campaign, result)}

    <details class="ranking-detail-panel">
      <summary>
        <span><i data-lucide="table-properties"></i><strong>Ver análise detalhada por vendedor</strong><small>Atual × anterior, positivação, mix, pontos, metas e auditoria</small></span>
        <span class="ranking-detail-meta">${number(result.results.length)} vendedor(es)</span>
      </summary>

      <section class="section-card ranking-compare-section">
        <div class="section-head">
          <div><span class="eyebrow">Análise técnica</span><h3>Comparativo detalhado por vendedor</h3><p class="ranking-helper">Use esta visão quando precisar investigar números. O resultado principal da campanha fica no painel acima.</p></div>
          <span class="hint">${esc(data.source || 'SQL Server')} · ${number(data.durationMs || 0)} ms${apiCache.hit ? ` · cache API ${number((apiCache.ageMs || 0) / 1000, 1)}s` : ''}</span>
        </div>
        <div class="table-wrap ranking-compare-wrap" style="margin-top:12px">
          <table class="ranking-compare-table">
            <thead><tr>
              <th>#</th>
              <th>${auditHeader('Representante', ['O histórico é conciliado pelo ID final do vendedor quando disponível.', 'Se o registro histórico não tiver ID, o sistema usa o nome normalizado sem o sufixo.'])}</th>
              <th>Faturamento</th>
              <th>Volume</th>
              <th>Clientes / positivação</th>
              <th>Mix / pontos</th>
              <th>Situação / meta</th>
            </tr></thead>
            <tbody>${result.results.map((item) => performanceRow(item, result.collectiveHit, audit, campaign)).join('') || '<tr><td colspan="7">Nenhuma venda encontrada no período.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </details>

    <div class="meta-block period-meta">
      <strong>Regra de período:</strong>
      ${campaign.periodMode === 'custom' ? 'período livre' : 'modelo PMG · 6 segundas'}
      · campanha ${dateBR(result.periods.currentStart)} a ${dateBR(result.periods.currentLast)}
      · referência anterior ${dateBR(result.periods.previousStart)} a ${dateBR(result.periods.previousLast)}
      · coluna SQL ${esc(data.dateReference || 'dbo.Vendas.[Data]')}.
    </div>`;

    if (!campaign.orderActivationRule?.enabled) return overviewHtml;

    return `<div class="performance-tabs-shell">
      <div class="performance-tabs" role="tablist" aria-label="Áreas da campanha">
        <button class="performance-tab is-active" type="button" data-action="performance-tab" data-performance-tab="overview" data-id="${esc(campaign.id)}">
          <i data-lucide="chart-no-axes-combined"></i>
          <span><strong>Performance geral</strong><small>Ranking, metas e comparativos</small></span>
        </button>
        <button class="performance-tab benefit-tab" type="button" data-action="performance-tab" data-performance-tab="benefit" data-id="${esc(campaign.id)}">
          <i data-lucide="badge-percent"></i>
          <span><strong>${esc(campaign.orderActivationRule?.name || 'Benefício 1ª compra')}</strong><small>Direitos, utilização e exportação</small></span>
        </button>
      </div>

      <div data-performance-panel="overview">${overviewHtml}</div>

      <div data-performance-panel="benefit" hidden>
        <div id="benefitInlineBody" class="benefit-inline-body">
          <div class="benefit-tab-intro">
            <i data-lucide="ticket-check"></i>
            <div>
              <strong>Controle de benefício por cliente</strong>
              <p>Abra esta aba para carregar quem ainda tem direito, quem já utilizou, qual pedido consumiu a primeira compra e quais itens receberam o benefício.</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function performanceMeta(label, value, detail) { return `<div class="meta-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`; }
  function performanceRow(item, collectiveHit, audit, campaign) {
    const status = !item.eligible ? 'Inelegível' : !collectiveHit ? 'Meta coletiva pendente' : item.classified ? 'Classificado' : 'Elegível';
    const identity = sellerIdentity(item.name);

    const sellerAudit = [
      `Representante consolidado: ${identity.name || item.name}`,
      identity.code ? `ID: ${identity.code}` : '',
      `Chave principal: ID numérico final quando disponível`,
      `Fallback: nome normalizado sem o sufixo`,
      `Fonte: dbo.Vendas.[Vendedor]`,
    ];

    const mixAudit = [
      `Mix = categorias obrigatórias cumpridas ÷ categorias obrigatórias × 100`,
      `Cumpridas: ${number(item.mixDone)} de ${number(item.mixTotal)}`,
      item.mixMissing?.length ? `Faltando: ${item.mixMissing.join(', ')}` : `Todas as categorias obrigatórias foram cumpridas.`,
      `Resultado: ${number(item.mix,1)}%`,
    ];

    const pointsAudit = [
      `Pontos totais calculados pelas regras configuradas nesta campanha.`,
      `Resultado atual: ${number(item.points,1)} pontos`,
      ...(item.pointRuleAudit || []).map((rule) => {
        if (rule.mode !== 'formula') return `Regra simples: +${number(rule.result,1)} ponto(s)`;
        if (rule.error) return `${rule.name}: erro na fórmula (${rule.error}) → 0 ponto`;
        const vars = rule.variables || {};
        const packWarning = rule.missingPackProducts?.length ? ` · ${rule.missingPackProducts.length} produto(s) sem divisor de fardo` : '';
        return `${rule.name}: ${rule.formula} = ${number(rule.result,2)} ponto(s) · FARDOS ${number(vars.FARDOS,2)} · UNIDADES ${number(vars.UNIDADES,2)}${packWarning}`;
      }),
    ];

    const customerAudit = positivityAuditLines(item, audit);

    return `<tr>
      <td><span class="rank-badge">${item.position}</span></td>
      <td class="ranking-seller-cell">
        ${auditValue(`<strong class="rep-name">${esc(identity.name || item.name)}</strong>${identity.code ? `<small class="rep-code">ID ${esc(identity.code)}</small>` : ''}`, sellerAudit, 'rep-audit')}
        <button class="row-audit-btn" type="button" data-action="audit-seller" data-campaign-id="${esc(campaign.id)}" data-seller="${esc(item.name)}"><i data-lucide="scan-search"></i>Auditar origem</button>
        ${item.reasons.length ? `<small class="ranking-first-reason" title="${esc(item.reasons.join(' · '))}">${esc(item.reasons[0])}</small>` : ''}
      </td>
      <td>${comparisonMetricCell(
        'Faturamento',
        money(item.revenue),
        money(item.previousRevenue),
        `<span class="delta ${item.revenueGrowth >= 0 ? 'positive' : 'negative'}">${pct(item.revenueGrowth)}</span>`,
        metricCellAudit('revenue','current',item,audit),
        metricCellAudit('revenue','previous',item,audit),
        growthCellAudit('revenue',item,audit)
      )}</td>
      <td>${comparisonMetricCell(
        'Volume',
        `${number(item.kg,1)} KG`,
        `${number(item.previousKg,1)} KG`,
        `<span class="delta ${item.kgGrowth >= 0 ? 'positive' : 'negative'}">${pct(item.kgGrowth)}</span>`,
        metricCellAudit('kg','current',item,audit),
        metricCellAudit('kg','previous',item,audit),
        growthCellAudit('kg',item,audit)
      )}</td>
      <td>
        <div class="customer-compare-cell">
          <div><small>Atual</small>${auditValue(`<strong>${number(item.customers)}</strong>`, metricCellAudit('customers','current',item,audit))}</div>
          <div><small>Anterior</small>${auditValue(`<strong>${number(item.previousCustomers)}</strong>`, metricCellAudit('customers','previous',item,audit))}</div>
          <div class="positivity-chip ${item.positivity >= 0 ? 'positive' : 'negative'}">${auditValue(`<strong>${item.positivity >= 0 ? '+' : ''}${number(item.positivity)}</strong><small>positivação</small>`, customerAudit)}</div>
        </div>
      </td>
      <td>
        <div class="mix-points-cell">
          ${auditValue(`<strong>${number(item.mix)}%</strong><small>mix · ${item.mixDone}/${item.mixTotal}</small>`, mixAudit)}
          ${auditValue(`<strong>${number(item.points,1)}</strong><small>pontos</small>`, pointsAudit)}
        </div>
      </td>
      <td class="ranking-status-cell"><span class="badge ${item.classified && collectiveHit ? 'active' : !item.eligible ? 'danger' : 'scheduled'}">${status}</span>${individualGoalsHtml(item)}</td>
    </tr>`;
  }

  function closePerformance() {
    $('#drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
  }

  function renderSupplierResults(value) {
    if (!app.wizard) return;
    syncCurrentStep();
    app.wizard.supplierQuery = value;
    const input = $('#supplierSearch');
    renderWizard();
    requestAnimationFrame(() => {
      const next = $('#supplierSearch');
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    });
  }

  function addProductsToCategory(products, categoryId) {
    const category = app.wizard.campaign.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const map = new Map((category.products || []).map((product) => [Number(product.id), product]));
    for (const product of products) {
      const visual = app.imageCache.get(String(product.id));
      map.set(Number(product.id), { ...product, image:visual?.image || product.image || '' });
    }
    category.products = [...map.values()];
    app.wizard.selectedProducts.clear();
    renderWizard();
  }

  function targetCategory() {
    let category = app.wizard.campaign.categories.find((item) => item.id === app.wizard.selectedCategoryId);
    if (!category && app.wizard.campaign.categories.length === 1) category = app.wizard.campaign.categories[0];
    if (!category) {
      toast('Crie ou selecione uma categoria antes de adicionar produtos.', 'warning');
      return null;
    }
    return category;
  }

  function updateCategorySelection(categoryId) {
    app.wizard.selectedCategoryId = categoryId;
  }

  function applyProductFiltersAndRender() {
    if (app.wizard) syncCurrentStep();
    app.wizard.productVisibleLimit = 100;
    renderWizard();
  }

  let supplierTimer;
  let productTimer;
  document.addEventListener('input', (event) => {
    if (event.target.id === 'campaignSearch') { app.campaignSearch = event.target.value; renderCampaigns(); $('#campaignSearch')?.focus(); }
    if (event.target.id === 'representativeSearch') { app.representativeSearch = event.target.value; renderRepresentatives(); $('#representativeSearch')?.focus(); }
    if (event.target.id === 'productPageSearch') { app.productSearch = event.target.value; renderProducts(); $('#productPageSearch')?.focus(); }
    if (event.target.id === 'benefitSearch' && app.benefitReport) { app.benefitReport.search = event.target.value; renderBenefitReport(); $('#benefitSearch')?.focus(); }
    if (event.target.id === 'campaignName' && app.wizard) app.wizard.campaign.name = event.target.value;
    if (event.target.id === 'campaignDescription' && app.wizard) app.wizard.campaign.description = event.target.value;
    if (event.target.id === 'supplierSearch') { clearTimeout(supplierTimer); supplierTimer = setTimeout(() => renderSupplierResults(event.target.value), 80); }
    if (event.target.id === 'campaignStart') {
      app.wizard.campaign.start = $('#campaignStart')?.value || app.wizard.campaign.start;
      if (app.wizard.campaign.periodMode === 'custom') {
        if (!app.wizard.campaign.end || app.wizard.campaign.end < app.wizard.campaign.start) app.wizard.campaign.end = app.wizard.campaign.start;
      } else {
        app.wizard.campaign.end = sixthMondayFrom(app.wizard.campaign.start) || app.wizard.campaign.end;
      }
      const endField = $('#campaignEnd');
      if (endField) endField.value = app.wizard.campaign.end;
      const preview = $('#periodPreview');
      if (preview) { preview.innerHTML = periodPreview(calculatePeriods(app.wizard.campaign)); icons(preview); }
    }
    if (event.target.id === 'campaignEnd') {
      app.wizard.campaign.end = $('#campaignEnd')?.value || app.wizard.campaign.end;
      const preview = $('#periodPreview');
      if (preview) { preview.innerHTML = periodPreview(calculatePeriods(app.wizard.campaign)); icons(preview); }
    }
    if (event.target.id === 'wizardRepSearch') {
      const query = norm(event.target.value);
      $$('#wizardRepList [data-rep-row]').forEach((row) => { row.hidden = query && !row.dataset.repRow.includes(query); });
    }
    if (event.target.id === 'productSearch') {
      clearTimeout(productTimer);
      app.wizard.productFilters.search = event.target.value;
      productTimer = setTimeout(applyProductFiltersAndRender, 90);
    }
    if (event.target.matches('[data-category-field]')) syncCategories();
    if (event.target.matches('[data-goal-field]')) syncGoals();
    if (event.target.matches('[data-point-field]')) syncPointRules();
    if (event.target.matches('[data-rule-field]')) syncEligibilityRules();
    if (event.target.matches('[data-activation-field]')) syncActivationRule();
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-representative]')) {
      const selected = new Set(app.wizard.campaign.representatives || []);
      event.target.checked ? selected.add(event.target.dataset.representative) : selected.delete(event.target.dataset.representative);
      app.wizard.campaign.representatives = [...selected];
    }
    if (event.target.id === 'rankingMode') app.wizard.campaign.rankingMode = event.target.value;
    if (event.target.id === 'topN') app.wizard.campaign.topN = Math.max(1, Number(event.target.value) || 1);
    if (event.target.id === 'productGroup') { app.wizard.productFilters.group = event.target.value; app.wizard.productFilters.subgroup = ''; applyProductFiltersAndRender(); }
    if (event.target.id === 'productSubgroup') { app.wizard.productFilters.subgroup = event.target.value; applyProductFiltersAndRender(); }
    if (event.target.id === 'targetCategorySelect') app.wizard.selectedCategoryId = event.target.value || null;
    if (event.target.matches('[data-product-select]')) {
      const id = Number(event.target.dataset.productSelect);
      event.target.checked ? app.wizard.selectedProducts.add(id) : app.wizard.selectedProducts.delete(id);
      event.target.closest('.product-card')?.classList.toggle('is-selected', event.target.checked);
    }
    if (event.target.matches('[data-goal-field="mode"]')) { syncCurrentStep(); renderWizard(); }
    if (event.target.matches('[data-point-field="mode"]')) {
      syncCurrentStep();
      const row = event.target.closest('.point-rule-row');
      const rule = app.wizard.campaign.pointRules.find((item) => item.id === row?.dataset.pointRuleId);
      if (rule?.mode === 'formula') {
        rule.name = rule.name || 'Fórmula personalizada';
        rule.formula = rule.formula || '=FARDOS * 5';
        rule.packMode = rule.packMode || 'manual';
        rule.unitsPerPack = Number(rule.unitsPerPack) || 1;
        rule.formulaCategoryId = rule.formulaCategoryId || '';
      }
      renderWizard();
    }
    if (event.target.matches('[data-point-field="packMode"]')) { syncCurrentStep(); renderWizard(); }
    if (event.target.matches('[data-activation-field="discountType"]')) { syncCurrentStep(); renderWizard(); }
    if (event.target.id === 'benefitStatusFilter' && app.benefitReport) { app.benefitReport.status = event.target.value; renderBenefitReport(); }
  });

  const WIZARD_STATEFUL_ACTIONS = new Set([
    'toggle-supplier','remove-supplier','participant-mode','period-mode','toggle-ranking','goal-mode',
    'add-goal','remove-goal','add-point-rule','remove-point-rule','add-rule-template','remove-rule',
    'sales-scope','toggle-activation-rule','apply-harald-fortunata','add-category','remove-category',
    'remove-product-category','add-selected-products','add-all-filtered','add-tie','remove-tie','move-tie-up',
    'add-prize','remove-prize'
  ]);

  document.addEventListener('click', async (event) => {
    const node = event.target.closest('[data-action],[data-view]');
    if (!node) return;
    const action = node.dataset.action;
    const view = node.dataset.view;
    if (app.wizard && WIZARD_STATEFUL_ACTIONS.has(action)) syncCurrentStep();

    if (view) { app.view = view; renderView(); return; }
    if (action === 'new-campaign') return openWizard();
    if (action === 'edit-campaign') return openWizard(node.dataset.id);
    if (action === 'close-modal') return closeWizard();
    if (action === 'close-performance') return closePerformance();
    if (action === 'close-seller-audit') return closeSellerAudit();
    if (action === 'open-sidebar') { $('#sidebar').classList.add('is-open'); $('.sidebar-backdrop').classList.add('is-open'); return; }
    if (action === 'close-sidebar') { $('#sidebar').classList.remove('is-open'); $('.sidebar-backdrop').classList.remove('is-open'); return; }
    if (action === 'theme') { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem(THEME_KEY, next); return; }
    if (action === 'settings') { const value = prompt('Endereço da API local', SQL_BASE); if (value) { localStorage.setItem(SQL_BASE_KEY, value.replace(/\/$/, '')); alert('Endereço salvo. Recarregue a página.'); } return; }
    if (action === 'open-date-picker') {
      const input = document.getElementById(node.dataset.target);
      if (!input) return;
      try { input.showPicker?.(); }
      catch (_) { input.focus(); input.click(); }
      return;
    }
    if (action === 'refresh-context') { $('#contextOverlay').hidden = false; document.body.style.overflow = 'hidden'; return pollContext({ force:true, blocking:true }).catch(() => {}); }
    if (action === 'retry-context') {
      // O clique do usuário permite que o Chrome apresente o aviso de acesso à rede local.
      app.apiCache.clear();
      return pollContext({ force:true, blocking:true }).catch(() => {});
    }
    if (action === 'use-cached-context') { if (app.contextCached) { app.contextReady = true; $('#contextOverlay').hidden = true; document.body.style.overflow = ''; renderView(); toast('Usando o último contexto salvo.', 'warning'); } return; }

    if (action === 'wizard-step') {
      syncCurrentStep();
      const target = Number(node.dataset.step);
      if (target > app.wizard.step) { const error = validateStep(app.wizard.step); if (error) return toast(error, 'error'); }
      app.wizard.step = target; renderWizard(); return;
    }
    if (action === 'previous-step') { syncCurrentStep(); app.wizard.step = Math.max(0, app.wizard.step - 1); renderWizard(); return; }
    if (action === 'next-step') { const error = validateStep(); if (error) return toast(error, 'error'); syncCurrentStep(); app.wizard.step = Math.min(STEPS.length - 1, app.wizard.step + 1); renderWizard(); return; }
    if (action === 'save-campaign') return saveCampaign();

    if (action === 'toggle-supplier') {
      const supplier = app.context.suppliers.find((item) => String(item.id) === String(node.dataset.id));
      if (!supplier) return;
      const list = app.wizard.campaign.suppliers;
      const index = list.findIndex((item) => String(item.id) === String(supplier.id));
      if (index >= 0) list.splice(index, 1);
      else list.push({ id:supplier.id, name:supplier.name, totalProducts:supplier.totalProducts });
      app.wizard.campaign.categories = app.wizard.campaign.categories.map((category) => ({ ...category, products:(category.products || []).filter((product) => list.some((item) => Number(item.id) === Number(product.supplierId))) }));
      renderWizard(); return;
    }
    if (action === 'remove-supplier') {
      app.wizard.campaign.suppliers = app.wizard.campaign.suppliers.filter((item) => String(item.id) !== String(node.dataset.id));
      renderWizard(); return;
    }
    if (action === 'period-mode') {
      syncCurrentStep();
      app.wizard.campaign.periodMode = node.dataset.value === 'custom' ? 'custom' : 'six_mondays';
      if (app.wizard.campaign.periodMode === 'six_mondays') {
        app.wizard.campaign.end = sixthMondayFrom(app.wizard.campaign.start) || app.wizard.campaign.end;
      } else if (!app.wizard.campaign.end || app.wizard.campaign.end < app.wizard.campaign.start) {
        app.wizard.campaign.end = app.wizard.campaign.start;
      }
      renderWizard();
      return;
    }
    if (action === 'participant-mode') { app.wizard.campaign.participantMode = node.dataset.value; renderWizard(); return; }
    if (action === 'toggle-ranking') {
      const metric = node.dataset.value;
      const list = app.wizard.campaign.rankingMetrics;
      const index = list.indexOf(metric);
      if (index >= 0) list.splice(index, 1); else list.push(metric);
      renderWizard(); return;
    }
    if (action === 'goal-mode') { app.wizard.campaign.goalMode = node.dataset.value; renderWizard(); return; }
    if (action === 'add-goal') {
      const scope = node.dataset.scope;
      (scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals).push(defaultGoal(scope));
      renderWizard(); return;
    }
    if (action === 'remove-goal') {
      const list = node.dataset.scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals;
      const index = list.findIndex((item) => item.id === node.dataset.id);
      if (index >= 0) list.splice(index, 1);
      renderWizard(); return;
    }
    if (action === 'add-point-rule') {
      syncCurrentStep();
      app.wizard.campaign.pointRules.push({ id:uid('point'), source:'positivity', mode:'per_unit', basis:1, points:100 });
      renderWizard(); return;
    }
    if (action === 'add-formula-point-rule') {
      syncCurrentStep();
      app.wizard.campaign.pointRules.push({
        id:uid('point'),
        mode:'formula',
        name:'Pontos por fardo',
        formula:'=FARDOS * 5',
        formulaCategoryId:'',
        packMode:'manual',
        unitsPerPack:1,
      });
      renderWizard(); return;
    }
    if (action === 'insert-formula-token') {
      const row = node.closest('.point-rule-row');
      const input = row?.querySelector('[data-point-field="formula"]');
      if (!input) return;
      const token = node.dataset.token || '';
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = `${input.value.slice(0,start)}${token}${input.value.slice(end)}`;
      input.focus();
      const next = start + token.length;
      input.setSelectionRange(next, next);
      syncPointRules();
      return;
    }
    if (action === 'remove-point-rule') { app.wizard.campaign.pointRules = app.wizard.campaign.pointRules.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }
    if (action === 'add-rule-template') { app.wizard.campaign.rules.push({ id:uid('rule'), name:node.dataset.label, metric:node.dataset.metric, operator:'>=', value:Number(node.dataset.value) || 0 }); renderWizard(); return; }
    if (action === 'remove-rule') { app.wizard.campaign.rules = app.wizard.campaign.rules.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }

    if (action === 'sales-scope') { app.wizard.campaign.salesScopeMode = node.dataset.value; renderWizard(); return; }

    if (action === 'toggle-activation-rule') {
      syncCategories();
      app.wizard.campaign.orderActivationRule.enabled = !app.wizard.campaign.orderActivationRule.enabled;
      renderWizard();
      return;
    }
    if (action === 'apply-harald-fortunata') { applyHaraldFortunataPreset(); return; }

    if (action === 'add-category') {
      const name = $('#newCategoryName')?.value.trim();
      if (!name) return toast('Informe o nome da categoria.', 'warning');
      const category = { id:uid('category'), name, requiredMix:true, minDistinct:1, pointUnit:'none', pointValue:0, products:[] };
      app.wizard.campaign.categories.push(category); updateCategorySelection(category.id); renderWizard(); return;
    }
    if (action === 'remove-category') { app.wizard.campaign.categories = app.wizard.campaign.categories.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }
    if (action === 'remove-product-category') {
      const category = app.wizard.campaign.categories.find((item) => item.id === node.dataset.categoryId);
      if (category) category.products = category.products.filter((product) => Number(product.id) !== Number(node.dataset.productId));
      renderWizard(); return;
    }
    if (action === 'add-selected-products') {
      const category = targetCategory(); if (!category) return;
      const selected = filteredCampaignProducts().filter((product) => app.wizard.selectedProducts.has(Number(product.id)));
      if (!selected.length) return toast('Selecione pelo menos um produto.', 'warning');
      addProductsToCategory(selected, category.id); return;
    }
    if (action === 'add-all-filtered') {
      const category = targetCategory(); if (!category) return;
      const filtered = filteredCampaignProducts();
      addProductsToCategory(filtered, category.id);
      toast(`${filtered.length} produto(s) filtrado(s) adicionados.`); return;
    }

    if (action === 'add-tie') { app.wizard.campaign.tieBreaks.push({ metric:'revenue', direction:'desc' }); renderWizard(); return; }
    if (action === 'remove-tie') { app.wizard.campaign.tieBreaks.splice(Number(node.dataset.index), 1); renderWizard(); return; }
    if (action === 'move-tie-up') { const index = Number(node.dataset.index); if (index > 0) { const list = app.wizard.campaign.tieBreaks; [list[index - 1], list[index]] = [list[index], list[index - 1]]; } renderWizard(); return; }
    if (action === 'add-prize') { app.wizard.campaign.prizes.push({ position:app.wizard.campaign.prizes.length + 1, type:'money', description:'' }); renderWizard(); return; }
    if (action === 'remove-prize') { app.wizard.campaign.prizes.splice(Number(node.dataset.index), 1); renderWizard(); return; }
    if (action === 'performance-tab') { switchPerformanceTab(node.dataset.performanceTab, node.dataset.id); return; }
    if (action === 'refresh-benefit-inline') return loadBenefitReportInline(node.dataset.id || app.benefitReport?.campaignId, { force:true });
    if (action === 'export-benefit-eligible') { exportBenefitCsv('eligible'); return; }
    if (action === 'export-benefit-all') { exportBenefitCsv('all'); return; }
    if (action === 'performance') return openPerformance(node.dataset.id);
    if (action === 'benefit-report') return openBenefitReport(node.dataset.id);
    if (action === 'close-benefit-report') { closeBenefitReport(); return; }
    if (action === 'refresh-benefit-report') return openBenefitReport(node.dataset.id || app.benefitReport?.campaignId, { force:true });
    if (action === 'export-benefit-csv') { exportBenefitCsv('filtered'); return; }
    if (action === 'copy-benefit-csv') return copyBenefitCsv();
    if (action === 'retry-performance') { return openPerformance(node.dataset.id, { force:true }); }
    if (action === 'consistency-diagnostic') { return runConsistencyDiagnostic(node.dataset.id); }
    if (action === 'audit-seller') return openSellerAudit(node.dataset.campaignId, node.dataset.seller);
    if (action === 'copy-seller-audit') return copySellerAudit();
  });

  document.addEventListener('click', (event) => {
    const categoryCardNode = event.target.closest('.category-card');
    if (categoryCardNode && !event.target.closest('button,input,select')) updateCategorySelection(categoryCardNode.dataset.categoryId);
  });

  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    event.dataTransfer.setData('text/product-id', card.dataset.productId);
    event.dataTransfer.effectAllowed = 'copy';
  });
  document.addEventListener('dragover', (event) => {
    const drop = event.target.closest('[data-category-drop]');
    if (!drop) return;
    event.preventDefault(); drop.closest('.category-card')?.classList.add('is-dragover');
  });
  document.addEventListener('dragleave', (event) => event.target.closest('.category-card')?.classList.remove('is-dragover'));
  document.addEventListener('drop', (event) => {
    const drop = event.target.closest('[data-category-drop]');
    if (!drop) return;
    event.preventDefault(); drop.closest('.category-card')?.classList.remove('is-dragover');
    const id = Number(event.dataTransfer.getData('text/product-id'));
    const product = productsForCampaign().find((item) => Number(item.id) === id);
    if (product) addProductsToCategory([product], drop.dataset.categoryDrop);
  });

  document.addEventListener('click', (event) => {
    if (event.target?.id === 'drawerBackdrop') closePerformance();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch')?.focus(); }
    if (event.key === 'Escape') {
      if (!$('#benefitBackdrop').hidden) closeBenefitReport();
      else if (!$('#sellerAuditBackdrop').hidden) closeSellerAudit();
      else if (!$('#modalBackdrop').hidden) closeWizard();
      else if (!$('#drawerBackdrop').hidden) closePerformance();
    }
  });

  $('#globalSearch')?.addEventListener('input', (event) => {
    app.campaignSearch = event.target.value;
    app.view = 'campaigns';
    renderView();
  });

  async function init() {
    document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || 'light';
    const params = new URLSearchParams(location.search);
    const requestedView = params.get('view');
    const requestedSearch = String(params.get('busca') || '').trim();
    const requestedCampaign = params.get('campanha');

    if (['dashboard','campaigns','products','representatives'].includes(requestedView)) app.view = requestedView;
    if (requestedSearch) {
      if (app.view === 'products') app.productSearch = requestedSearch;
      else if (app.view === 'representatives') app.representativeSearch = requestedSearch;
      else { app.view = 'campaigns'; app.campaignSearch = requestedSearch; }
    }
    if (requestedCampaign) app.view = 'campaigns';

    await DB.init();
    await loadCampaigns();
    renderView();
    icons();
    $('#contextOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    const contextPromise = initializeContext();
    if (requestedCampaign) {
      await contextPromise.catch(() => null);
      if (app.campaigns.some(item => String(item.id) === String(requestedCampaign))) await openWizard(requestedCampaign);
    }
  }

  window.addEventListener('pmg-lucide-ready', () => icons());
  window.addEventListener('DOMContentLoaded', init);
})();
