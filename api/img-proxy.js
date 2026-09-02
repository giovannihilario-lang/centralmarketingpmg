/**
 * /api/img-proxy.js
 * Busca imagens remotas e repassa para o browser, resolvendo CORS.
 * O proxy aceita somente destinos públicos e conteúdo de imagem para evitar
 * que a rota seja usada como ponte para serviços internos (SSRF).
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 12_000;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0
    || a >= 224;
}

function isPrivateIpv6(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value)) return true;
  if (value.startsWith('::ffff:')) return isPrivateIpv4(value.slice(7));
  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicDestination(target) {
  const hostname = String(target.hostname || '').toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Destino privado não permitido.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Destino privado não permitido.');
    return;
  }

  const records = await dns.lookup(hostname, { all:true, verbatim:true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Destino privado não permitido.');
  }
}

async function fetchPublicImage(initialUrl) {
  let target = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDestination(target);
    const response = await fetch(target.toString(), {
      redirect:'manual',
      signal:AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers:{ Accept:'image/*' },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === MAX_REDIRECTS) throw new Error('Muitos redirecionamentos na imagem.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento de imagem sem destino.');
      const next = new URL(location, target);
      if (!['http:', 'https:'].includes(next.protocol)) throw new Error('Protocolo de redirecionamento inválido.');
      target = next;
      continue;
    }
    return response;
  }
  throw new Error('Não foi possível resolver a imagem.');
}

async function readLimitedBody(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error('Imagem excede o limite de 10 MB.');

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > MAX_IMAGE_BYTES) throw new Error('Imagem excede o limite de 10 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

export default async function handler(req, res) {
  const { url } = req.query || {};
  if (!url) return res.status(400).send('Parâmetro ?url= obrigatório.');

  let target;
  try {
    target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Protocolo inválido');
    if (target.username || target.password) throw new Error('Credenciais na URL não são permitidas');
  } catch {
    return res.status(400).send('URL inválida.');
  }

  try {
    const upstream = await fetchPublicImage(target);
    if (!upstream.ok) return res.status(upstream.status).send(`Imagem retornou ${upstream.status}`);

    const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return res.status(415).send('O endereço informado não retornou uma imagem.');

    const buffer = await readLimitedBody(upstream);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (err) {
    const blocked = /privado não permitido|Credenciais na URL/i.test(String(err?.message || ''));
    if (!blocked) console.error('[PMG /img-proxy]', err);
    return res.status(blocked ? 403 : 502).send(blocked ? 'Destino não permitido.' : 'Falha ao buscar imagem.');
  }
}
