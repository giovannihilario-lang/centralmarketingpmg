import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

const COLUNAS = {
  Cidade: { param: 'p_cidade', value: ({ client }) => client.ci && client.uf ? `${client.ci} / ${client.uf}` : '', label: ({ client }) => client.ci && client.uf ? `${client.ci} / ${client.uf}` : '' },
  Regiao: { param: 'p_regiao', value: ({ client }) => client.z },
  UF: { param: 'p_uf', value: ({ client }) => client.uf },
  Segmento: { param: 'p_segmento', value: ({ client }) => client.se },
  Grupo: { param: 'p_grupo', value: ({ product }) => product.g },
  Fornecedor: { param: 'p_fornecedor', value: ({ product }) => product.sn },
  SubGrupo: { param: 'p_subgrupo', value: ({ product }) => product.sg },
  Produto: {
    param: 'p_produto',
    value: ({ product }) => String(product.p),
    label: ({ product }) => `${product.p} — ${product.n || 'Produto sem descrição'}`,
    search: ({ product }) => `${product.p} ${product.n || ''}`,
  },
};

export default async function handler(req, res) {
  try {
    const item = COLUNAS[req.query.p_coluna];
    if (!item) return res.status(400).json({ message: `Coluna inválida: ${req.query.p_coluna}` });
    const busca = String(req.query.p_busca || '').trim().toLocaleLowerCase('pt-BR');
    const limite = Math.min(Math.max(Number.parseInt(req.query.p_limit || (req.query.p_coluna === 'Produto' ? '120' : '5000'), 10) || 120, 1), 5000);
    const baseOrders = new Set();
    const groups = new Map();

    await forEachRegionalFact(req.query, (fact) => {
      baseOrders.add(String(fact.line.o));
      const valor = String(item.value(fact) ?? '').trim();
      if (!valor) return;
      const rotulo = String((item.label || item.value)(fact) ?? valor).trim();
      if (busca && item.search && !String(item.search(fact)).toLocaleLowerCase('pt-BR').includes(busca)) return;
      if (!groups.has(valor)) groups.set(valor, { valor, rotulo, pedidos: new Set() });
      const row = groups.get(valor);
      if (rotulo.localeCompare(row.rotulo, 'pt-BR') > 0) row.rotulo = rotulo;
      row.pedidos.add(String(fact.line.o));
    }, { ignore: [item.param] });

    const totalPedidos = baseOrders.size;
    const data = [...groups.values()]
      .map((row) => ({ valor: row.valor, rotulo: row.rotulo, qtd: row.pedidos.size, total_pedidos: totalPedidos }))
      .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
      .slice(0, limite);
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
