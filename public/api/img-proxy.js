/**
 * /api/img-proxy.js
 * Busca imagens da API PMG e repassa para o browser,
 * resolvendo CORS e backslashes nas URLs.
 *
 * Uso: /img-proxy?url=https://...
 */
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Parâmetro ?url= obrigatório.');
  }

  // Sanitiza: aceita apenas URLs absolutas http/https
  let alvo;
  try {
    alvo = new URL(url);
    if (!['http:', 'https:'].includes(alvo.protocol)) throw new Error('Protocolo inválido');
  } catch {
    return res.status(400).send('URL inválida.');
  }

  try {
    const upstream = await fetch(alvo.toString());

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Imagem retornou ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 's-maxage=86400'); // cache 24h
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[PMG /img-proxy]', err);
    return res.status(502).send('Falha ao buscar imagem.');
  }
}
