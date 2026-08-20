import { getPool } from '../src/lib/db.js';

// Diagnóstico: GET /api/_schema
// Lista todas as tabelas e colunas do banco conectado, pra descobrir os
// nomes reais e preencher src/lib/tabelas.js corretamente.
// Depois que a migração estiver concluída, dá pra apagar esse arquivo.
export default async function handler(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT t.TABLE_SCHEMA, t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
      FROM INFORMATION_SCHEMA.TABLES t
      JOIN INFORMATION_SCHEMA.COLUMNS c
        ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
    `);

    const porTabela = {};
    for (const linha of result.recordset) {
      const chave = `${linha.TABLE_SCHEMA}.${linha.TABLE_NAME}`;
      if (!porTabela[chave]) porTabela[chave] = [];
      porTabela[chave].push(`${linha.COLUMN_NAME} (${linha.DATA_TYPE})`);
    }

    return res.status(200).json(porTabela);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
