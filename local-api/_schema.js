import { getPool } from '../src/lib/db.js';
import { requireGestor } from '../src/lib/colaborador.js';

// Diagnóstico: GET /api/_schema
// Lista todas as tabelas e colunas do banco conectado, pra descobrir os
// nomes reais e preencher src/lib/tabelas.js corretamente.
// Depois que a migração estiver concluída, dá pra apagar esse arquivo.
//
// Restrito a gestor: expõe todo o schema do SQL Server (tabelas/colunas via
// INFORMATION_SCHEMA) e antes disso qualquer colaborador logado conseguia
// consultar essa estrutura interna.
export default async function handler(req, res) {
  try {
    if (req.pmgUser) await requireGestor(req.pmgUser.id);
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
    return res.status(err.status || 500).json({ erro: err.message });
  }
}
