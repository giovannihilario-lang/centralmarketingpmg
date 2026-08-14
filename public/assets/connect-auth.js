(() => {
  'use strict';

  const SESSION_KEY = 'pmg_connect_auth_session_v2';
  const LEGACY_ACCESS_KEY = 'pmg_connect_access_token';
  const SUPABASE_URL = "https://scokolfzvtzohrzdgisz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_inJrO1hMCTys3g7FAyjV3w_4TVfLOok";

  let memorySession = null;
  let refreshPromise = null;

  function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
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

      // Compatibilidade com a V5.16/V5.16.1. Um access token legado ainda
      // pode funcionar até expirar, mas não possui refresh token.
      const legacyAccess = sessionStorage.getItem(LEGACY_ACCESS_KEY) || '';
      if (legacyAccess) {
        memorySession = normalizeSession({ access_token:legacyAccess });
        return memorySession;
      }
    } catch {}

    return null;
  }

  function clear() {
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

  function removePmgAuthFromUrl(params) {
    params.delete('pmg_auth');
    const remaining = params.toString();
    const next = `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`;
    history.replaceState(history.state, document.title, next);
  }

  function consumeFragment() {
    const rawHash = String(location.hash || '').replace(/^#/, '');
    if (!rawHash) return loadSession();

    const params = new URLSearchParams(rawHash);
    const encoded = params.get('pmg_auth');
    if (!encoded) return loadSession();

    // Credencial sai da URL assim que for lida.
    removePmgAuthFromUrl(params);

    try {
      let payload = null;

      try {
        payload = JSON.parse(decodeBase64Url(encoded));
      } catch {
        payload = null;
      }

      if (payload && typeof payload === 'object') {
        const saved = saveSession(payload);
        if (saved?.access_token) {
          console.info(
            `[PMG Connect Auth] sessão completa capturada.${saved.refresh_token ? ' Refresh disponível.' : ' Sem refresh token.'}`
          );
          return saved;
        }
      }

      // Compatibilidade com um JWT cru.
      if (encoded.split('.').length === 3) {
        return saveSession({ access_token:encoded });
      }

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
        const response = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
          {
            method:'POST',
            headers:{
              apikey:SUPABASE_PUBLISHABLE_KEY,
              'Content-Type':'application/json',
            },
            body:JSON.stringify({ refresh_token:current.refresh_token }),
            cache:'no-store',
          }
        );

        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch {}

        if (!response.ok || !data.access_token) {
          const error = new Error(data?.msg || data?.message || data?.error_description || `Falha ao renovar sessão (HTTP ${response.status}).`);
          error.code = data?.code || data?.error_code || 'PMG_AUTH_REFRESH_FAILED';
          error.httpStatus = response.status;

          // Refresh tokens são rotacionados. Se o servidor negar o token,
          // não insistimos indefinidamente com um token que não serve mais.
          if ([400, 401, 403].includes(response.status)) clear();
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

    return session?.access_token && accessTokenStillValid(session, 0)
      ? session.access_token
      : '';
  }

  async function authorizationHeaders(existing = {}) {
    const headers = { ...existing };
    const hasAuth = Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
    if (hasAuth) return headers;

    const token = await ensureAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function isLocalApiUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return ['localhost', '127.0.0.1'].includes(parsed.hostname)
        && parsed.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  }

  window.PMGConnectAuth = Object.freeze({
    consumeFragment,
    authorizationHeaders,
    ensureAccessToken,
    refreshSession,
    isLocalApiUrl,
    clear,
    getSession:() => loadSession(),
    hasSession:() => Boolean(loadSession()?.access_token || loadSession()?.refresh_token),
    hasRefreshToken:() => Boolean(loadSession()?.refresh_token),
  });

  consumeFragment();

  // Renova proativamente quando a aba volta ao foco após ficar aberta.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void ensureAccessToken();
  });
})();
