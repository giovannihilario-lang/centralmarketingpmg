(() => {
  'use strict';

  const STORAGE_KEY = 'pmg_connect_access_token';
  let memoryToken = '';

  function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function jwtExpiry(token) {
    try {
      const [, payload] = String(token || '').split('.');
      if (!payload) return null;
      const data = JSON.parse(decodeBase64Url(payload));
      return Number(data?.exp) || null;
    } catch {
      return null;
    }
  }

  function tokenExpired(token) {
    const exp = jwtExpiry(token);
    return exp ? Date.now() >= (exp * 1000) - 15000 : false;
  }

  function storeToken(token) {
    const clean = String(token || '').trim();
    if (!clean) return '';
    memoryToken = clean;
    try { sessionStorage.setItem(STORAGE_KEY, clean); } catch {}
    return clean;
  }

  function clear() {
    memoryToken = '';
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function getAccessToken() {
    let token = memoryToken;
    if (!token) {
      try { token = sessionStorage.getItem(STORAGE_KEY) || ''; } catch {}
    }

    if (token && tokenExpired(token)) {
      clear();
      return '';
    }

    memoryToken = token || '';
    return memoryToken;
  }

  function removePmgAuthFromUrl(params) {
    params.delete('pmg_auth');
    const remaining = params.toString();
    const next = `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`;
    history.replaceState(history.state, document.title, next);
  }

  function consumeFragment() {
    const rawHash = String(location.hash || '').replace(/^#/, '');
    if (!rawHash) return getAccessToken();

    const params = new URLSearchParams(rawHash);
    const encoded = params.get('pmg_auth');
    if (!encoded) return getAccessToken();

    // Remove a credencial da barra imediatamente.
    removePmgAuthFromUrl(params);

    try {
      let payload = null;
      let token = '';

      try {
        payload = JSON.parse(decodeBase64Url(encoded));
      } catch {
        payload = null;
      }

      if (payload && typeof payload === 'object') {
        token = payload.access_token || payload.accessToken || payload.token || '';
      } else if (encoded.split('.').length === 3) {
        token = encoded;
      }

      if (!token) {
        console.warn('[PMG Connect Auth] pmg_auth recebido sem access_token.');
        return '';
      }

      storeToken(token);
      console.info('[PMG Connect Auth] sessão capturada para esta aba.');
      return token;
    } catch (error) {
      console.warn('[PMG Connect Auth] falha ao consumir sessão:', error?.message || error);
      return '';
    }
  }

  function authorizationHeaders(existing = {}) {
    const headers = { ...existing };
    const hasAuth = Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
    if (hasAuth) return headers;

    const token = getAccessToken();
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
    getAccessToken,
    authorizationHeaders,
    isLocalApiUrl,
    clear,
    hasSession: () => Boolean(getAccessToken()),
  });

  consumeFragment();
})();
