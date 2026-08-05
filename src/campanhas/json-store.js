import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'campanhas-db.json');

const ESTRUTURA_INICIAL = {
  campanhas: [],
  campanhas_representantes: [],
  campanhas_vendas: [],
  campanhas_regras: [],
  campanhas_regras_produto: [],
  campanhas_mapeamentos: [],
  campanhas_apuracoes: [],
};

let filaEscrita = Promise.resolve();

async function garantirArquivo() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(ESTRUTURA_INICIAL, null, 2), 'utf8');
  }
}

async function lerBanco() {
  await garantirArquivo();
  const bruto = await fs.readFile(DATA_FILE, 'utf8');
  const banco = bruto.trim() ? JSON.parse(bruto) : {};
  return { ...ESTRUTURA_INICIAL, ...banco };
}

async function escreverBanco(banco) {
  await garantirArquivo();
  const temporario = DATA_FILE + '.tmp';
  await fs.writeFile(temporario, JSON.stringify(banco, null, 2), 'utf8');
  await fs.rename(temporario, DATA_FILE);
}

function validarTabela(tabela) {
  if (!(tabela in ESTRUTURA_INICIAL)) {
    throw new Error(`Tabela lógica inválida: ${tabela}`);
  }
}

function comFilaEscrita(operacao) {
  const atual = filaEscrita.then(operacao, operacao);
  filaEscrita = atual.catch(() => undefined);
  return atual;
}

export async function listar(tabela, filtros = {}) {
  validarTabela(tabela);
  const banco = await lerBanco();
  let registros = Array.isArray(banco[tabela]) ? banco[tabela] : [];

  if (filtros.id) {
    registros = registros.filter((item) => String(item.id) === String(filtros.id));
  }
  if (filtros.campanhaId) {
    registros = registros.filter(
      (item) => String(item.campanhaId || '') === String(filtros.campanhaId)
    );
  }

  return registros;
}

export async function salvar(tabela, itens) {
  validarTabela(tabela);
  const lista = Array.isArray(itens) ? itens : [itens];

  return comFilaEscrita(async () => {
    const banco = await lerBanco();
    const registros = Array.isArray(banco[tabela]) ? banco[tabela] : [];
    const porId = new Map(registros.map((item) => [String(item.id), item]));
    const agora = new Date().toISOString();

    for (const item of lista) {
      if (!item || !item.id) throw new Error('Todo registro precisa possuir id');
      const anterior = porId.get(String(item.id)) || {};
      porId.set(String(item.id), {
        ...anterior,
        ...item,
        atualizadoEm: agora,
      });
    }

    banco[tabela] = [...porId.values()];
    await escreverBanco(banco);
    return lista;
  });
}

export async function remover(tabela, { id, todos = false } = {}) {
  validarTabela(tabela);

  return comFilaEscrita(async () => {
    const banco = await lerBanco();
    if (todos) {
      banco[tabela] = [];
    } else {
      if (!id) throw new Error('id obrigatório');
      banco[tabela] = (banco[tabela] || []).filter(
        (item) => String(item.id) !== String(id)
      );
    }
    await escreverBanco(banco);
  });
}

export { DATA_FILE };
