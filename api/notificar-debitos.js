import webpush from 'web-push';
import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

export default async function handler(req, res) {
  if (!TABELAS.notas_fiscais || !TABELAS.fornecedores) {
    return res.status(501).json({
      erro: 'Débitos de sell-in ainda não migrados: falta definir onde ficam as tabelas de fornecedores e notas fiscais no SQL Server (veja src/lib/tabelas.js).',
    });
  }

  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(500).json({ erro: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas no .env' });
    }
    webpush.setVapidDetails(
      'mailto:marketing04@pmg.com.br',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const pool = await getPool();

    const notasResult = await pool
      .request()
      .query(`SELECT fornecedor_id, valor, situacao FROM ${TABELAS.notas_fiscais}`);
    const notas = notasResult.recordset;

    const fornecedoresResult = await pool
      .request()
      .query(`SELECT id, pct_sellin FROM ${TABELAS.fornecedores}`);
    const fornecedores = fornecedoresResult.recordset;

    const faturadoPorForn = {};
    notas.forEach((n) => {
      const sit = (n.situacao || '').toLowerCase().trim();
      if (sit !== 'autorizada' && sit !== 'autorizado') return;
      faturadoPorForn[n.fornecedor_id] = (faturadoPorForn[n.fornecedor_id] || 0) + (n.valor || 0);
    });

    let totalDebito = 0;
    let qtd = 0;
    fornecedores.forEach((f) => {
      const debito = (faturadoPorForn[f.id] || 0) * ((f.pct_sellin || 0) / 100);
      if (debito > 0.01) {
        totalDebito += debito;
        qtd++;
      }
    });

    const fmt = (v) =>
      'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const payload = JSON.stringify({
      title: '💰 Débitos Sell-In — PMG',
      body: qtd > 0 ? `${qtd} fornecedor(es) com débito. Total: ${fmt(totalDebito)}` : 'Nenhum débito pendente no momento.',
      url: '/fornecedores.html',
    });

    const subsResult = await pool.request().query(`SELECT * FROM ${TABELAS.push_subscriptions}`);
    const subs = subsResult.recordset;

    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      )
    );

    for (let i = 0; i < resultados.length; i++) {
      if (resultados[i].status === 'rejected' && [404, 410].includes(resultados[i].reason?.statusCode)) {
        const request = pool.request();
        request.input('endpoint', sql.NVarChar(450), subs[i].endpoint);
        await request.query(`DELETE FROM ${TABELAS.push_subscriptions} WHERE endpoint = @endpoint`);
      }
    }

    return res.status(200).json({ enviados: subs.length, totalDebito, qtd });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
