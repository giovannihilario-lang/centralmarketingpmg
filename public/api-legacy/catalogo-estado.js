import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

export default async function handler(req, res) {
  try {
    const pool = await getPool();

    if (req.method === 'GET') {
      const result = await pool
        .request()
        .query(`SELECT estado FROM ${TABELAS.catalogo_estado} WHERE id = 1`);
      if (!result.recordset.length) return res.status(404).json({ erro: 'não encontrado' });
      return res.status(200).json(JSON.parse(result.recordset[0].estado));
    }

    if (req.method === 'POST') {
      const request = pool.request();
      request.input('estado', sql.NVarChar(sql.MAX), JSON.stringify(req.body));
      request.input('atualizadoEm', sql.DateTime2, new Date());
      await request.query(`
        UPDATE ${TABELAS.catalogo_estado}
        SET estado = @estado, atualizado_em = @atualizadoEm
        WHERE id = 1
      `);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
