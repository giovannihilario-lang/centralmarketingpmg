import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Autoriza a página HTTPS da Vercel a conversar com a API local.
// Navegadores recentes fazem um preflight específico para acesso à rede local.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Content-Type, Authorization'
  );

  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: '15mb' }));

/**
 * Registra handlers no formato usado pela Vercel.
 *
 * /api       -> funções que também serão publicadas na Vercel.
 * /local-api -> funções que dependem do SQL Server acessível apenas na rede local.
 *
 * As duas pastas continuam respondendo localmente em /api/<nome>, então o
 * dashboard não precisa saber onde o arquivo físico está guardado.
 */
async function registrarDiretorioApi(nomeDiretorio) {
  const diretorio = path.join(__dirname, nomeDiretorio);
  if (!fs.existsSync(diretorio)) return;

  const arquivos = fs.readdirSync(diretorio).filter((arquivo) => arquivo.endsWith('.js'));

  for (const arquivo of arquivos) {
    const nomeRota = arquivo.replace(/\.js$/, '');
    const rota = `/api/${nomeRota}`;

    try {
      const modulo = await import(pathToFileURL(path.join(diretorio, arquivo)));
      const handler = modulo.default;

      if (typeof handler !== 'function') {
        throw new TypeError('O módulo não exporta um handler default');
      }

      app.all(rota, (req, res) => handler(req, res));
      console.log(`[api] ${rota} <- ${nomeDiretorio}/${arquivo}`);
    } catch (erro) {
      console.error(`[api] Falha ao carregar ${nomeDiretorio}/${arquivo}: ${erro.message}`);
      app.all(rota, (req, res) => {
        res.status(500).json({
          message: `A rota ${rota} não pôde ser carregada`,
          detail: erro.message,
        });
      });
    }
  }
}

await registrarDiretorioApi('api');
await registrarDiretorioApi('local-api');

// Uma rota de API inexistente deve responder JSON, não uma página HTML.
app.use('/api', (req, res) => {
  res.status(404).json({
    message: `Rota local não encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// O frontend local é servido somente depois das rotas da API.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/fornecedor/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fornecedor', 'slug.html'));
});

app.get('/img-proxy', async (req, res) => {
  const modulo = await import(pathToFileURL(path.join(__dirname, 'api', 'img-proxy.js')));
  return modulo.default(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\nServidor local do PMG Connect rodando.');
  console.log(`- Neste computador: http://localhost:${PORT}`);
  console.log(`- Dashboard regional: http://localhost:${PORT}/dashboard-regional.html`);
  console.log(`- Na rede local: http://<IP-DESTE-PC>:${PORT}`);
  console.log('Mantenha este terminal aberto enquanto usar os relatórios conectados ao SQL Server.\n');
});
