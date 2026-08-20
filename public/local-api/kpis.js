import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

const norm = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');

export default async function handler(req, res) {
  try {
    let totalValor = 0;
    let totalKg = 0;
    let registros = 0;
    const pedidos = new Set();
    const cidades = new Set();
    const ufs = new Set();
    const fornecedores = new Set();

    await forEachRegionalFact(req.query, ({ line, client, product }) => {
      totalValor += Number(line.v) || 0;
      totalKg += Number(line.kg) || 0;
      registros += 1;
      pedidos.add(String(line.o));
      if (client.ci && client.uf) cidades.add(`${norm(client.ci)}|${norm(client.uf)}`);
      if (client.uf) ufs.add(norm(client.uf));
      if (product.sn) fornecedores.add(product.sn);
    });

    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json([{
      total_valor: totalValor,
      total_kg: totalKg,
      n_registros: registros,
      n_pedidos: pedidos.size,
      n_cidades: cidades.size,
      n_ufs: ufs.size,
      n_fornecedores: fornecedores.size,
      ticket_medio: pedidos.size ? Number((totalValor / pedidos.size).toFixed(2)) : null,
    }]);
  } catch (err) {
    return erroApi(res, err);
  }
}
