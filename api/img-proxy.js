/**
 * Proxy de imagens do catálogo PMG.
 * Aceita somente hosts explicitamente autorizados para evitar SSRF.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 12000;

function allowedHosts() {
  const hosts = new Set(
    String(process.env.PMG_IMAGE_PROXY_HOSTS || '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );

  // Quando a API visual está configurada, o host dela é autorizado automaticamente.
  try {
    if (process.env.PMG_API_URL) hosts.add(new URL(process.env.PMG_API_URL).hostname.toLowerCase());
  } catch { /* configuração inválida será tratada no endpoint da API visual */ }

  return hosts;
}


export default async function handler(req, res) {
  const { url } = req.query || {};
  if (!url) return res.status(400).send('Parâmetro ?url= obrigatório.');

  let alvo;
  try {
    alvo = new URL(url);
    if (!['http:', 'https:'].includes(alvo.protocol)) throw new Error('Protocolo inválido');
  } catch {
    return res.status(400).send('URL inválida.');
  }

  const hosts = allowedHosts();
  const host = alvo.hostname.toLowerCase();
  if (!hosts.has(host)) {
    return res.status(403).send('Host de imagem não autorizado.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(alvo.toString(), { signal: controller.signal, redirect: 'error' });
    if (!upstream.ok) return res.status(upstream.status).send(`Imagem retornou ${upstream.status}`);

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return res.status(415).send('O recurso remoto não é uma imagem.');

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return res.status(413).send('Imagem excede o limite permitido.');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return res.status(413).send('Imagem excede o limite permitido.');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return res.send(buffer);
  } catch (error) {
    console.error('[PMG /img-proxy]', error);
    return res.status(error?.name === 'AbortError' ? 504 : 502).send('Falha ao buscar imagem.');
  } finally {
    clearTimeout(timer);
  }
}
