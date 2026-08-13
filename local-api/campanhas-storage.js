import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.resolve(__dirname, '../data/campanhas-studio-v5.json');
let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(STORAGE_PATH, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return Array.isArray(parsed.campanhas) ? parsed.campanhas : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(campanhas) {
  await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
  const payload = JSON.stringify({ version: 5, updatedAt: new Date().toISOString(), campanhas }, null, 2);
  const temp = `${STORAGE_PATH}.tmp`;
  await fs.writeFile(temp, payload, 'utf8');
  try {
    await fs.rename(temp, STORAGE_PATH);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.rm(STORAGE_PATH, { force: true });
    await fs.rename(temp, STORAGE_PATH);
  }
}

function enqueue(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, campanhas: await readAll() });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const incoming = Array.isArray(req.body?.campanhas)
        ? req.body.campanhas
        : req.body?.campanha ? [req.body.campanha] : [];
      if (!incoming.length) return res.status(400).json({ ok: false, message: 'Campanha obrigatória.' });

      const campanhas = await enqueue(async () => {
        const current = await readAll();
        const byId = new Map(current.filter((item) => item?.id).map((item) => [String(item.id), item]));
        for (const campaign of incoming) {
          if (!campaign?.id) continue;
          const previous = byId.get(String(campaign.id)) || {};
          byId.set(String(campaign.id), { ...previous, ...campaign, updatedAt: campaign.updatedAt || new Date().toISOString() });
        }
        const merged = [...byId.values()];
        await writeAll(merged);
        return merged;
      });
      return res.status(200).json({ ok: true, total: campanhas.length });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, message: 'id obrigatório.' });
      const campanhas = await enqueue(async () => {
        const next = (await readAll()).filter((item) => String(item?.id || '') !== id);
        await writeAll(next);
        return next;
      });
      return res.status(200).json({ ok: true, total: campanhas.length });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, message: 'Método não permitido.' });
  } catch (error) {
    console.error('[campanhas-storage]', error);
    return res.status(500).json({ ok: false, message: 'Falha ao persistir campanhas.', detail: error.message });
  }
}
