import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const authCache = new Map();
const authInFlight = new Map();
const AUTH_CACHE_MS = 60 * 1000;

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const supabaseAuth = getSupabaseAuthClient();

async function exigirSessaoLocal(req) {
  if (String(process.env.PMG_LOCAL_API_REQUIRE_AUTH || 'true').toLowerCase() === 'false') return null;
  if (!supabaseAuth) {
    const error = new Error('Autenticação local indisponível: configure SUPABASE_URL e SUPABASE_ANON_KEY.');
    error.status = 503;
    throw error;
  }

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Sessão do PMG Connect obrigatória para consultar o SQL local.');
    error.status = 401;
    throw error;
  }

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  if (authInFlight.has(token)) return authInFlight.get(token);
  const pending = (async () => {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      const authError = new Error('Sessão inválida ou expirada.');
      authError.status = 401;
      throw authError;
    }
    authCache.set(token, { user: data.user, expiresAt: Date.now() + AUTH_CACHE_MS });
    return data.user;
  })().finally(() => authInFlight.delete(token));

  authInFlight.set(token, pending);
  return pending;
}


// A API local é poderosa demais para aceitar qualquer site da internet.
// Permitimos localhost, o projeto PMG na Vercel e origens adicionais configuradas
// explicitamente em PMG_ALLOWED_ORIGINS (separadas por vírgula).
const ORIGENS_EXTRAS = new Set(
  String(process.env.PMG_ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function origemPermitida(origin) {
  if (!origin) return true; // curl/Postman e navegação direta
  let url;
  try { url = new URL(origin); } catch { return false; }
  const normalized = origin.replace(/\/$/, '');
  if (ORIGENS_EXTRAS.has(normalized)) return true;
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return true;
  if (url.protocol === 'https:' && (url.hostname === 'pmg-marketing.vercel.app' || /^pmg-marketing-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname))) return true;
  return false;
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  let mesmaOrigem = false;
  if (origin) {
    try { mesmaOrigem = new URL(origin).host === req.headers.host; } catch { mesmaOrigem = false; }
  }

  // Rejeita a requisição antes de qualquer rota. Requisições da própria página
  // servida por este Node são aceitas mesmo quando o acesso ocorre pelo IP da LAN.
  if (origin && !mesmaOrigem && !origemPermitida(origin)) {
    return res.status(403).json({ message: 'Origin não autorizada para a API local.' });
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');

  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  res.setHeader('Private-Network-Access-Name', 'API Local PMG Connect');
  res.setHeader('Private-Network-Access-ID', 'pmg-connect-local-api');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
const rotasRegistradas = new Map();

async function registrarDiretorioApi(nomeDiretorio) {
  const diretorio = path.join(__dirname, nomeDiretorio);
  if (!fs.existsSync(diretorio)) return;

  const arquivos = fs.readdirSync(diretorio).filter((arquivo) => arquivo.endsWith('.js'));

  for (const arquivo of arquivos) {
    const nomeRota = arquivo.replace(/\.js$/, '');
    const rota = `/api/${nomeRota}`;

    // No servidor local, as rotas de local-api têm prioridade.
    // Isso impede que o arquivo de contingência da Vercel assuma a mesma URL.
    if (rotasRegistradas.has(rota)) {
      console.log(
        `[api] Ignorada rota duplicada ${nomeDiretorio}/${arquivo}; ` +
        `já registrada por ${rotasRegistradas.get(rota)}`
      );
      continue;
    }

    try {
      const modulo = await import(pathToFileURL(path.join(diretorio, arquivo)));
      const handler = modulo.default;

      if (typeof handler !== 'function') {
        throw new TypeError('O módulo não exporta um handler default');
      }

      if (nomeDiretorio === 'local-api') {
        app.all(rota, async (req, res) => {
          try {
            req.pmgUser = await exigirSessaoLocal(req);
            return handler(req, res);
          } catch (error) {
            return res.status(error.status || 401).json({
              message: error.message || 'Não autorizado.',
              codigo: 'PMG_AUTH_REQUIRED'
            });
          }
        });
      } else {
        app.all(rota, (req, res) => handler(req, res));
      }
      rotasRegistradas.set(rota, `${nomeDiretorio}/${arquivo}`);
      console.log(`[api] ${rota} <- ${nomeDiretorio}/${arquivo}`);
    } catch (erro) {
      console.error(`[api] Falha ao carregar ${nomeDiretorio}/${arquivo}: ${erro.message}`);
      app.all(rota, (req, res) => {
        res.status(500).json({
          message: `A rota ${rota} não pôde ser carregada`,
          detail: erro.message,
        });
      });
      rotasRegistradas.set(rota, `${nomeDiretorio}/${arquivo} (erro)`);
    }
  }
}

// Ordem intencional: tudo que depende do SQL local deve vencer rotas homônimas
// presentes em /api para publicação na Vercel.
await registrarDiretorioApi('local-api');
await registrarDiretorioApi('api');

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
  console.log(`- Campanhas: http://localhost:${PORT}/campanhas.html`);
  console.log(`- Na rede local: http://<IP-DESTE-PC>:${PORT}`);
  console.log('Mantenha este terminal aberto enquanto usar os relatórios conectados ao SQL Server.\n');
});
