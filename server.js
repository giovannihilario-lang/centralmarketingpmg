import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Libera acesso de outras origens na rede local (ex: enquanto o front roda
// via Live Server em outra porta). Quando tudo rodar só por este servidor
// (recomendado), isso deixa de ser necessário, mas não atrapalha.
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Serve os arquivos estáticos (o mesmo conteúdo da pasta public/ que hoje
// vai pro Vercel). Ex: http://localhost:3001/dashboard.html
app.use(express.static(path.join(__dirname, 'public')));

// Roteamento automático estilo Vercel: cada arquivo em /api/<nome>.js vira
// a rota /api/<nome>. Não precisa registrar rota manualmente ao adicionar
// um novo arquivo em api/.
const apiDir = path.join(__dirname, 'api');
const arquivos = fs.readdirSync(apiDir).filter((f) => f.endsWith('.js'));

for (const arquivo of arquivos) {
  const nomeRota = arquivo.replace(/\.js$/, '');
  try {
    const modulo = await import(pathToFileURL(path.join(apiDir, arquivo)));
    const handler = modulo.default;
    app.all(`/api/${nomeRota}`, (req, res) => handler(req, res));
    console.log(`[api] /api/${nomeRota} <- api/${arquivo}`);
  } catch (err) {
    console.error(`[api] FALHOU ao carregar api/${arquivo} — rota /api/${nomeRota} ficará indisponível.`);
    console.error(`      Motivo: ${err.message}`);
    app.all(`/api/${nomeRota}`, (req, res) =>
      res.status(500).json({ erro: `api/${arquivo} não pôde ser carregado: ${err.message}` })
    );
  }
}

// Compatibilidade com os rewrites que existiam no vercel.json
app.get('/fornecedor/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fornecedor', 'slug.html'));
});
app.get('/img-proxy', async (req, res) => {
  const modulo = await import(pathToFileURL(path.join(apiDir, 'img-proxy.js')));
  return modulo.default(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nServidor rodando!`);
  console.log(`- Neste PC:        http://localhost:${PORT}`);
  console.log(`- Na rede local:   http://<IP-deste-PC>:${PORT}  (ex: http://192.168.0.10:${PORT})`);
  console.log(`Descubra o IP deste PC com "ipconfig" (Windows) e procure o "Endereço IPv4".\n`);
});
