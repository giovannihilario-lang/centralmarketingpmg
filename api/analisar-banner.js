// api/analisar-banner.js
// Recebe uma imagem (base64) do banner de campanha e usa o Gemini 2.5 Flash
// (gratuito, dentro do free tier) para extrair os dados estruturados que
// preenchem o formulário "Nova Campanha".
//
// Variável de ambiente necessária na Vercel:
//   GEMINI_API_KEY  -> gerar grátis em https://aistudio.google.com/apikey

const PROMPT = `
Você recebe a imagem de um banner/arte de campanha de incentivo comercial.
Extraia as informações e responda APENAS com um JSON válido (sem markdown,
sem crases, sem texto antes ou depois), no seguinte formato exato:

{
  "nome": "string curta para o nome da campanha, ex: Campanha de incentivo Cargill",
  "fornecedor": "string com o nome do fornecedor/marca principal",
  "dataInicio": "YYYY-MM-DD ou null se não identificar",
  "dataFim": "YYYY-MM-DD ou null se não identificar",
  "descricao": "string com o resumo das regras gerais da campanha (metas, requisitos, como ganhar)",
  "premiacoes": "string com a lista de premiações, uma por linha, ex: 1º lugar - R$ 2.000\\n2º lugar - R$ 1.500",
  "regrasProduto": [
    {
      "escopo": "marca",
      "valor": "nome da marca ou produto mencionado",
      "pontosPorKg": null,
      "pontosFixos": número de pontos por unidade se mencionado, ou null,
      "observacao": "texto curto explicando a regra, ex: 30 pontos por unidade - atomatados, óleos e azeite"
    }
  ]
}

Regras importantes:
- Datas: se o banner mostrar "08/06 até 13/07/2026" no formato DD/MM(/YYYY), converta para YYYY-MM-DD. Se o ano não aparecer em uma das datas, assuma o mesmo ano da outra data.
- Se não conseguir identificar um campo com confiança, use null (não invente).
- "regrasProduto": crie uma entrada por grupo de produtos/marcas com pontuação distinta mencionada no banner.
- Responda em português do Brasil.
- Responda SOMENTE o JSON, nada mais.
`.trim();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: "GEMINI_API_KEY não configurada no servidor" });
  }

  try {
    const { imagemBase64, mimeType } = req.body;
    if (!imagemBase64) {
      return res.status(400).json({ erro: "imagemBase64 não enviada" });
    }

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: imagemBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      throw new Error(`Gemini API: ${geminiResp.status} - ${errText}`);
    }

    const data = await geminiResp.json();
    const textoResposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textoResposta) {
      throw new Error("Resposta vazia do Gemini");
    }

    let extraido;
    try {
      extraido = JSON.parse(textoResposta);
    } catch {
      throw new Error("Gemini não retornou um JSON válido");
    }

    return res.status(200).json({ sucesso: true, dados: extraido });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
};