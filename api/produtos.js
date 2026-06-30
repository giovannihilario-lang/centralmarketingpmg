export default async function handler(req, res) {
  const apiUrl = process.env.PMG_API_URL;

  const auth = Buffer.from(
    `${process.env.PMG_USUARIO}:${process.env.PMG_SENHA}`
  ).toString("base64");

  try {
    const upstream = await fetch(apiUrl, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    if (!upstream.ok) {
      const texto = await upstream.text();

      return res.status(upstream.status).json({
        erro: `API PMG retornou ${upstream.status}`,
        detalhe: texto
      });
    }

    const dados = await upstream.json();

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=60"
    );

    return res.status(200).json(dados);

  } catch (err) {
    console.error("[PMG /api/produtos]", err);

    return res.status(500).json({
      erro: err.message
    });
  }
}