(function () {
  'use strict';

  const root = document.documentElement;
  const originalFetch = window.fetch.bind(window);
  const isProtected = root.hasAttribute('data-pmg-auth');
  const isLoginPage = root.hasAttribute('data-pmg-login');
  const localTarget = root.getAttribute('data-pmg-local-target') || '';
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
  const state = { client: null, session: null, profile: null, config: null };
  let readyPromise;

  root.classList.add('pmg-auth-pending');

  function isLocalUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname) && parsed.port === '3001';
    } catch {
      return false;
    }
  }

  function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function buildBridgeUrl(target, session) {
    const url = new URL(target, window.location.href);
    if (!session?.access_token || !session?.refresh_token || !isLocalUrl(url)) return url.toString();

    const payload = base64UrlEncode(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    }));

    const previousHash = url.hash ? url.hash.slice(1) : '';
    const params = new URLSearchParams();
    params.set('pmg_auth', payload);
    if (previousHash) params.set('pmg_hash', previousHash);
    url.hash = params.toString();
    return url.toString();
  }

  function readBridgeFromHash() {
    if (!window.location.hash) return null;
    const raw = window.location.hash.slice(1);
    const params = new URLSearchParams(raw);
    const encoded = params.get('pmg_auth');
    if (!encoded) return null;

    try {
      const payload = JSON.parse(base64UrlDecode(encoded));
      const previousHash = params.get('pmg_hash') || '';
      return { payload, previousHash };
    } catch (error) {
      console.warn('[PMG Connect] Ponte de sessão inválida.', error);
      return null;
    }
  }

  function cleanBridgeHash(previousHash) {
    const url = new URL(window.location.href);
    url.hash = previousHash ? `#${previousHash}` : '';
    history.replaceState(history.state, document.title, url.pathname + url.search + url.hash);
  }

  function safeNext(raw) {
    if (!raw) return '/central.html';
    try {
      const parsed = new URL(raw, window.location.origin);
      const sameOrigin = parsed.origin === window.location.origin;
      if (sameOrigin || isLocalUrl(parsed)) return parsed.toString();
    } catch { /* noop */ }
    return '/central.html';
  }

  function loginUrl() {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `/index.html?next=${encodeURIComponent(current)}`;
  }

  function showAuthError(message) {
    root.classList.remove('pmg-auth-pending');
    root.classList.add('pmg-auth-error');
    if (!document.body) return;
    const existing = document.getElementById('pmgAuthFailure');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'pmgAuthFailure';
    box.className = 'pmg-auth-failure';
    box.innerHTML = `
      <div class="pmg-auth-failure-card">
        <img src="/imagenssite/pmglogo.png" alt="PMG">
        <strong>Não foi possível validar o acesso</strong>
        <p>${String(message || 'Falha de autenticação.')}</p>
        <button type="button" onclick="location.reload()">Tentar novamente</button>
      </div>`;
    document.body.appendChild(box);
  }

  async function loadConfig() {
    const response = await originalFetch('/api/notificar-demandas?config=1', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.erro || 'Configuração de autenticação indisponível.');
    if (!payload.supabaseUrl || !payload.supabaseAnonKey) throw new Error('Supabase não configurado no servidor.');
    return payload;
  }

  async function getProfile(client) {
    try {
      const { data, error } = await client.rpc('garantir_meu_perfil');
      if (error) return null;
      return data || null;
    } catch {
      return null;
    }
  }

  function updateSessionUi() {
    const name = state.profile?.nome || state.session?.user?.user_metadata?.name || state.session?.user?.email || 'Conta PMG';
    document.querySelectorAll('[data-pmg-user-name]').forEach(el => { el.textContent = name; });
    document.querySelectorAll('[data-pmg-user-email]').forEach(el => { el.textContent = state.session?.user?.email || ''; });
  }

  function bindLogoutButtons() {
    document.querySelectorAll('[data-pmg-logout]').forEach(button => {
      if (button.dataset.pmgBound === '1') return;
      button.dataset.pmgBound = '1';
      button.addEventListener('click', async event => {
        event.preventDefault();
        button.disabled = true;
        try { await state.client?.auth.signOut(); } catch (error) { console.warn('[PMG Connect] Falha ao sair.', error); }
        window.location.replace('/index.html');
      });
    });
  }

  function bindLocalLinks() {
    document.querySelectorAll('a[href]').forEach(anchor => {
      if (anchor.dataset.pmgLocalBound === '1') return;
      let url;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (!isLocalUrl(url)) return;
      anchor.dataset.pmgLocalBound = '1';
      anchor.addEventListener('click', event => {
        if (!state.session) return;
        event.preventDefault();
        window.location.href = buildBridgeUrl(url.toString(), state.session);
      });
    });
  }

  function bindDocumentUi() {
    updateSessionUi();
    bindLogoutButtons();
    bindLocalLinks();
  }

  function bindDocumentUiWhenReady() {
    bindDocumentUi();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDocumentUi, { once:true });
    }
  }

  async function navigate(target) {
    const resolved = safeNext(target);
    const url = isLocalUrl(resolved) ? buildBridgeUrl(resolved, state.session) : resolved;
    window.location.replace(url);
  }

  window.PMGConnect = {
    state,
    get ready() { return readyPromise; },
    get client() { return state.client; },
    get session() { return state.session; },
    get profile() { return state.profile; },
    async login(email, password) {
      await readyPromise;
      const { data, error } = await state.client.auth.signInWithPassword({ email: String(email || '').trim(), password });
      if (error) throw error;
      state.session = data.session;
      state.profile = await getProfile(state.client);
      updateSessionUi();
      return data;
    },
    async logout() {
      await readyPromise.catch(() => null);
      if (state.client) await state.client.auth.signOut();
      window.location.replace('/index.html');
    },
    buildLocalUrl(target) { return buildBridgeUrl(target, state.session); },
    navigate
  };

  // Nas páginas protegidas, chamadas à API esperam a sessão e recebem o Bearer.
  // Isso permite ao Node local rejeitar acesso direto aos dados SQL sem sessão válida.
  window.fetch = async function pmgAuthenticatedFetch(input, init) {
    const requestInit = init ? { ...init } : {};
    let url;
    try {
      const raw = input instanceof Request ? input.url : input;
      url = new URL(raw, window.location.href);
    } catch {
      return originalFetch(input, init);
    }

    const sameOriginApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    if (isProtected && sameOriginApi && readyPromise) {
      try { await readyPromise; } catch { /* a tela de erro já trata */ }
      const token = state.session?.access_token;
      if (token) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (requestInit.headers) new Headers(requestInit.headers).forEach((value, key) => headers.set(key, value));
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        requestInit.headers = headers;
      }
    }
    return originalFetch(input, requestInit);
  };

  readyPromise = (async () => {
    if (!window.supabase?.createClient) throw new Error('Biblioteca de autenticação não carregou.');
    state.config = await loadConfig();
    state.client = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    const bridge = readBridgeFromHash();
    if (bridge?.payload?.access_token && bridge?.payload?.refresh_token) {
      const { error } = await state.client.auth.setSession(bridge.payload);
      cleanBridgeHash(bridge.previousHash);
      if (error) throw error;
    }

    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    state.session = data.session || null;

    if (isProtected && !state.session) {
      window.location.replace(loginUrl());
      return state;
    }

    if (state.session) {
      state.profile = await getProfile(state.client);
      if (state.profile?.ativo === false) {
        await state.client.auth.signOut();
        state.session = null;
        throw new Error('Esta conta está desativada no PMG Connect.');
      }
    }

    if (isLoginPage && state.session) {
      const params = new URLSearchParams(window.location.search);
      await navigate(params.get('next') || '/central.html');
      return state;
    }

    bindDocumentUiWhenReady();

    state.client.auth.onAuthStateChange((event, session) => {
      state.session = session || null;
      if (!session && isProtected && event === 'SIGNED_OUT') window.location.replace('/index.html');
      setTimeout(() => {
        bindDocumentUi();
      }, 0);
    });

    root.classList.remove('pmg-auth-pending');
    root.classList.add('pmg-auth-ready');
    document.dispatchEvent(new CustomEvent('pmg:auth-ready', { detail: state }));

    if (localTarget && state.session && !isLocalUrl(window.location.href)) {
      await navigate(`http://localhost:3001${localTarget}${window.location.search}${window.location.hash}`);
    }

    return state;
  })().catch(error => {
    console.error('[PMG Connect] Autenticação:', error);
    showAuthError(error?.message || error);
    throw error;
  });
})();
