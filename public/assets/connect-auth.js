(() => {
  'use strict';

  const root = document.documentElement;
  const SESSION_KEY = 'pmg_connect_auth_session_v2';
  const LEGACY_ACCESS_KEY = 'pmg_connect_access_token';
  const SUPABASE_URL = 'https://scokolfzvtzohrzdgisz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_inJrO1hMCTys3g7FAyjV3w_4TVfLOok';
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
  const isProtected = root.hasAttribute('data-pmg-auth');
  const isLoginPage = root.hasAttribute('data-pmg-login');
  const localTarget = root.getAttribute('data-pmg-local-target') || '';
  const isLoopbackPage = location.protocol === 'http:' && LOCAL_HOSTS.has(location.hostname) && location.port === '3001';
  const originalFetch = window.fetch.bind(window);

  let memorySession = null;
  let refreshPromise = null;
  let hostReadyPromise = null;
  const hostState = { client:null, session:null, profile:null };

  if (isProtected && !isLoopbackPage) root.classList.add('pmg-auth-pending');

  function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function jwtPayload(token) {
    try {
      const [, payload] = String(token || '').split('.');
      return payload ? JSON.parse(decodeBase64Url(payload)) : null;
    } catch {
      return null;
    }
  }

  function jwtExpiry(token) {
    return Number(jwtPayload(token)?.exp) || null;
  }

  function normalizeSession(value = {}) {
    const accessToken = String(value.access_token || value.accessToken || value.token || '').trim();
    const refreshToken = String(value.refresh_token || value.refreshToken || '').trim();
    const expiresAt = Number(value.expires_at || value.expiresAt || jwtExpiry(accessToken)) || null;

    return {
      access_token:accessToken,
      refresh_token:refreshToken,
      expires_at:expiresAt,
      expires_in:Number(value.expires_in || value.expiresIn) || null,
      token_type:value.token_type || value.tokenType || 'bearer',
      captured_at:Date.now(),
    };
  }

  function saveSession(session) {
    const normalized = normalizeSession(session);
    if (!normalized.access_token && !normalized.refresh_token) return null;

    memorySession = normalized;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
      sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    } catch {}
    return normalized;
  }

  function loadSession() {
    if (memorySession) return memorySession;

    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        memorySession = normalizeSession(JSON.parse(raw));
        return memorySession;
      }

      // Compatibilidade com versões que guardavam apenas o access token.
      const legacyAccess = sessionStorage.getItem(LEGACY_ACCESS_KEY) || '';
      if (legacyAccess) {
        memorySession = normalizeSession({ access_token:legacyAccess });
        return memorySession;
      }
    } catch {}

    return null;
  }

  function clearLocalSession() {
    memorySession = null;
    refreshPromise = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    } catch {}
  }

  function accessTokenStillValid(session, leewaySeconds = 45) {
    const token = session?.access_token || '';
    if (!token) return false;
    const exp = Number(session?.expires_at || jwtExpiry(token));
    if (!exp) return true;
    return Date.now() < (exp * 1000) - (leewaySeconds * 1000);
  }

  function isLocalApiUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const sameLocalNode = location.protocol === 'http:' && location.port === '3001' && parsed.origin === location.origin;
      const loopbackNode = parsed.protocol === 'http:' && parsed.port === '3001' && LOCAL_HOSTS.has(parsed.hostname);
      return (sameLocalNode || loopbackNode) && parsed.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  }

  function isLocalAppUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.protocol === 'http:' && parsed.port === '3001' && LOCAL_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  function buildBridgeUrl(target, session) {
    const url = new URL(target, location.href);
    const normalized = normalizeSession(session || {});
    if (!normalized.access_token || !normalized.refresh_token || !isLocalAppUrl(url)) return url.toString();

    const payload = encodeBase64Url(JSON.stringify({
      access_token:normalized.access_token,
      refresh_token:normalized.refresh_token,
      expires_at:normalized.expires_at,
      expires_in:normalized.expires_in,
      token_type:normalized.token_type,
    }));

    const previousHash = url.hash ? url.hash.slice(1) : '';
    const params = new URLSearchParams();
    params.set('pmg_auth', payload);
    if (previousHash) params.set('pmg_hash', previousHash);
    url.hash = params.toString();
    return url.toString();
  }

  function consumeFragment() {
    const rawHash = String(location.hash || '').replace(/^#/, '');
    if (!rawHash) return loadSession();

    const params = new URLSearchParams(rawHash);
    const encoded = params.get('pmg_auth');
    if (!encoded) return loadSession();

    // O fragmento não é enviado ao servidor, mas também não precisa ficar na barra.
    const previousHash = params.get('pmg_hash') || '';
    const next = `${location.pathname}${location.search}${previousHash ? `#${previousHash}` : ''}`;
    history.replaceState(history.state, document.title, next);

    try {
      let payload = null;
      try { payload = JSON.parse(decodeBase64Url(encoded)); } catch { payload = null; }

      if (payload && typeof payload === 'object') {
        const saved = saveSession(payload);
        if (saved?.access_token) {
          console.info(`[PMG Connect Auth] sessão completa capturada.${saved.refresh_token ? ' Refresh disponível.' : ' Sem refresh token.'}`);
          return saved;
        }
      }

      // Compatibilidade com links antigos que transportavam somente JWT.
      if (encoded.split('.').length === 3) return saveSession({ access_token:encoded });

      console.warn('[PMG Connect Auth] pmg_auth recebido sem sessão reconhecível.');
      return null;
    } catch (error) {
      console.warn('[PMG Connect Auth] falha ao consumir sessão:', error?.message || error);
      return null;
    }
  }

  async function refreshSession({ force = false } = {}) {
    const current = loadSession();
    if (!current?.refresh_token) return null;
    if (!force && accessTokenStillValid(current)) return current;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const response = await originalFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method:'POST',
          headers:{
            apikey:SUPABASE_PUBLISHABLE_KEY,
            'Content-Type':'application/json',
          },
          body:JSON.stringify({ refresh_token:current.refresh_token }),
          cache:'no-store',
        });

        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch {}

        if (!response.ok || !data.access_token) {
          const error = new Error(data?.msg || data?.message || data?.error_description || `Falha ao renovar sessão (HTTP ${response.status}).`);
          error.code = data?.code || data?.error_code || 'PMG_AUTH_REFRESH_FAILED';
          error.httpStatus = response.status;
          if ([400, 401, 403].includes(response.status)) clearLocalSession();
          throw error;
        }

        const next = saveSession({
          ...current,
          ...data,
          refresh_token:data.refresh_token || current.refresh_token,
        });
        console.info('[PMG Connect Auth] access token renovado automaticamente.');
        return next;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function ensureAccessToken() {
    if (accessTokenStillValid(hostState.session)) return hostState.session.access_token;

    if (hostState.client) {
      try {
        const { data, error } = await hostState.client.auth.getSession();
        if (error) throw error;
        hostState.session = data?.session || null;
        if (accessTokenStillValid(hostState.session, 0)) return hostState.session.access_token;
      } catch (error) {
        console.warn('[PMG Connect Auth] sessão hospedada indisponível:', error?.message || error);
      }
    }

    let session = loadSession();
    if (accessTokenStillValid(session)) return session.access_token;

    if (session?.refresh_token) {
      try {
        session = await refreshSession({ force:true });
        return session?.access_token || '';
      } catch (error) {
        console.warn('[PMG Connect Auth] renovação automática falhou:', error?.message || error);
        return '';
      }
    }

    return session?.access_token && accessTokenStillValid(session, 0) ? session.access_token : '';
  }

  async function authorizationHeaders(existing = {}) {
    const headers = { ...existing };
    const hasAuth = Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
    if (hasAuth) return headers;

    const token = await ensureAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  window.PMGConnectAuth = Object.freeze({
    consumeFragment,
    authorizationHeaders,
    ensureAccessToken,
    refreshSession,
    isLocalApiUrl,
    buildBridgeUrl,
    clear:clearLocalSession,
    getSession:() => hostState.session || loadSession(),
    getPublicConfig:() => ({ supabaseUrl:SUPABASE_URL, supabasePublishableKey:SUPABASE_PUBLISHABLE_KEY }),
    hasSession:() => Boolean(hostState.session?.access_token || hostState.session?.refresh_token || loadSession()?.access_token || loadSession()?.refresh_token),
    hasRefreshToken:() => Boolean(hostState.session?.refresh_token || loadSession()?.refresh_token),
  });

  // Primeiro consome a credencial quando a página já está no Node local.
  consumeFragment();

  // Garante Bearer automaticamente para qualquer rota SQL do Node local.
  // Campanhas já faz isso explicitamente; o wrapper mantém o header existente.
  window.fetch = async function pmgFetch(input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input, location.href); }
    catch { return originalFetch(input, init); }

    if (!isLocalApiUrl(url)) return originalFetch(input, init);

    const requestInit = init ? { ...init } : {};
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (requestInit.headers) new Headers(requestInit.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has('Authorization')) {
      const token = await ensureAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    requestInit.headers = headers;
    return originalFetch(input, requestInit);
  };

  function showAuthError(message) {
    root.classList.remove('pmg-auth-pending');
    root.classList.add('pmg-auth-error');
    const render = () => {
      if (!document.body) return;
      document.getElementById('pmgAuthFailure')?.remove();
      const box = document.createElement('div');
      box.id = 'pmgAuthFailure';
      box.className = 'pmg-auth-failure';
      box.innerHTML = `
        <div class="pmg-auth-failure-card">
          <img src="/imagenssite/pmglogo.png" alt="PMG">
          <strong>Não foi possível validar o acesso</strong>
          <p>${String(message || 'Falha de autenticação.').replace(/[<>&"]/g, (ch) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]))}</p>
          <button type="button" onclick="location.reload()">Tentar novamente</button>
        </div>`;
      document.body.appendChild(box);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once:true });
    else render();
  }

  function loginUrl() {
    const current = `${location.pathname}${location.search}${location.hash}`;
    return `/index.html?next=${encodeURIComponent(current)}`;
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
    const session = hostState.session;
    const name = hostState.profile?.nome || session?.user?.user_metadata?.name || session?.user?.email || 'Conta PMG';
    document.querySelectorAll('[data-pmg-user-name]').forEach((el) => { el.textContent = name; });
    document.querySelectorAll('[data-pmg-user-email]').forEach((el) => { el.textContent = session?.user?.email || ''; });
  }

  function bindLogoutButtons() {
    document.querySelectorAll('[data-pmg-logout]').forEach((button) => {
      if (button.dataset.pmgBound === '1') return;
      button.dataset.pmgBound = '1';
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        button.disabled = true;
        try { await hostState.client?.auth.signOut(); } catch (error) { console.warn('[PMG Connect] Falha ao sair.', error); }
        clearLocalSession();
        location.replace('/index.html');
      });
    });
  }

  function bindLocalLinks() {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      if (anchor.dataset.pmgLocalBound === '1') return;
      let url;
      try { url = new URL(anchor.href, location.href); } catch { return; }
      if (!isLocalAppUrl(url)) return;
      anchor.dataset.pmgLocalBound = '1';
      anchor.addEventListener('click', (event) => {
        if (!hostState.session?.access_token || !hostState.session?.refresh_token) return;
        event.preventDefault();
        location.href = buildBridgeUrl(url.toString(), hostState.session);
      });
    });
  }

  function bindHostedUi() {
    updateSessionUi();
    bindLogoutButtons();
    bindLocalLinks();
  }

  async function triggerDailyCommercialSnapshot() {
    const token = hostState.session?.access_token || '';
    if (!token || isLoopbackPage) return null;
    try {
      const response = await originalFetch('http://localhost:3001/api/dados-diarios?acao=iniciar', {
        method:'GET',
        headers:{ Authorization:`Bearer ${token}` },
        cache:'no-store',
      });
      const raw = await response.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
      window.PMGDailySnapshot = data;
      document.dispatchEvent(new CustomEvent('pmg:daily-snapshot', { detail:data }));
      return data;
    } catch (error) {
      // Não bloqueia o login: se o navegador impedir HTTPS -> localhost ou o
      // Node estiver fechado, o primeiro Dashboard Regional/Campanhas tentará
      // novamente ao acessar sua própria API local.
      console.info('[PMG Connect] snapshot diário será preparado no primeiro acesso local:', error?.message || error);
      return null;
    }
  }

  function definePMGConnect() {
    const api = {
      state:hostState,
      get ready() { return hostReadyPromise; },
      get client() { return hostState.client; },
      get session() { return hostState.session; },
      get profile() { return hostState.profile; },
      async login(email, password) {
        await hostReadyPromise;
        const { data, error } = await hostState.client.auth.signInWithPassword({ email:String(email || '').trim(), password });
        if (error) throw error;
        hostState.session = data.session || null;
        hostState.profile = await getProfile(hostState.client);
        bindHostedUi();
        return data;
      },
      async logout() {
        await hostReadyPromise.catch(() => null);
        if (hostState.client) await hostState.client.auth.signOut();
        clearLocalSession();
        location.replace('/index.html');
      },
      buildLocalUrl(target) { return buildBridgeUrl(target, hostState.session); },
      navigate(target) {
        const resolved = new URL(target || '/central.html', location.href);
        location.replace(isLocalAppUrl(resolved) ? buildBridgeUrl(resolved, hostState.session) : resolved.toString());
      },
    };
    window.PMGConnect = api;
  }

  function initHostedAuth() {
    // No Node local, a sessão vem pela ponte e a API usa PMGConnectAuth.
    if (isLoopbackPage) return;

    definePMGConnect();

    hostReadyPromise = (async () => {
      if (!window.supabase?.createClient) throw new Error('Biblioteca de autenticação não carregou.');

      hostState.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false }
      });

      const { data, error } = await hostState.client.auth.getSession();
      if (error) throw error;
      hostState.session = data?.session || null;

      if (isProtected && !hostState.session) {
        location.replace(loginUrl());
        return hostState;
      }

      if (hostState.session) {
        hostState.profile = await getProfile(hostState.client);
        if (hostState.profile?.ativo === false) {
          await hostState.client.auth.signOut();
          hostState.session = null;
          throw new Error('Esta conta está desativada no PMG Connect.');
        }
      }

      if (isLoginPage && hostState.session) {
        const params = new URLSearchParams(location.search);
        const next = params.get('next') || '/central.html';
        const resolved = new URL(next, location.origin);
        location.replace(isLocalAppUrl(resolved) ? buildBridgeUrl(resolved, hostState.session) : resolved.toString());
        return hostState;
      }

      const bind = () => bindHostedUi();
      bind();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });

      hostState.client.auth.onAuthStateChange((event, session) => {
        hostState.session = session || null;
        if (!session && isProtected && event === 'SIGNED_OUT') location.replace('/index.html');
        setTimeout(bindHostedUi, 0);
      });

      root.classList.remove('pmg-auth-pending');
      root.classList.add('pmg-auth-ready');
      document.dispatchEvent(new CustomEvent('pmg:auth-ready', { detail:hostState }));

      if (hostState.session) void triggerDailyCommercialSnapshot();

      if (localTarget && hostState.session) {
        const target = `http://localhost:3001${localTarget}${location.search}${location.hash}`;
        location.replace(buildBridgeUrl(target, hostState.session));
      }

      return hostState;
    })().catch((error) => {
      console.error('[PMG Connect] Autenticação:', error);
      showAuthError(error?.message || error);
      throw error;
    });
  }

  initHostedAuth();

  // Renova proativamente a sessão local quando a aba volta ao foco.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isLoopbackPage) void ensureAccessToken();
  });
})();
