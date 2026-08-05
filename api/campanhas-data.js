import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

/**
 * Handler único para todos os "stores" do módulo de Campanhas.
 * O front-end (campanhas.html) manda a tabela via query string (?tabela=...).
 *
 * Cada tabela segue o formato: id, campanha_id, dados (json como texto),
 * atualizado_em — exceto "campanhas", que É a campanha (não pertence a uma
 * campanha_id) e tem também a coluna "nome".
 *
 * Veja sql/schema.sql para o script de criação dessas tabelas no SQL Server.
 */
const TABELAS_VALIDAS = new Set([
  'campanhas',
  'campanhas_representantes',
  'campanhas_vendas',
  'campanhas_regras',
  'campanhas_regras_produto',
  'campanhas_mapeamentos',
  'campanhas_apuracoes',
]);

const TABELAS_SEM_CAMPANHA_ID = new Set(['campanhas', 'campanhas_representantes']);

export default async function handler(req, res) {
  const { id, campanhaId, all, tabela: tabelaLogica } = req.query;

  if (!tabelaLogica || !TABELAS_VALIDAS.has(tabelaLogica)) {
    return res.status(400).json({ erro: "Parâmetro 'tabela' ausente ou inválido" });
  }

  const tabela = TABELAS[tabelaLogica];
  const comCampanhaId = !TABELAS_SEM_CAMPANHA_ID.has(tabelaLogica);

  try {
    const pool = await getPool();

    if (req.method === 'GET') {
      const request = pool.request();
      const filtros = [];
      if (id) {
        request.input('id', sql.NVarChar, id);
        filtros.push('id = @id');
      }
      if (comCampanhaId && campanhaId) {
        request.input('campanhaId', sql.NVarChar, campanhaId);
        filtros.push('campanha_id = @campanhaId');
      }
      const whereSql = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      const result = await request.query(
        `SELECT dados FROM ${tabela} ${whereSql} ORDER BY atualizado_em DESC`
      );
      return res.status(200).json(result.recordset.map((r) => JSON.parse(r.dados)));
    }

    if (req.method === 'POST') {
      const body = req.body;
      const itens = Array.isArray(body) ? body : [body];
      if (!itens.length) return res.status(200).json({ ok: true, quantidade: 0 });

      for (const obj of itens) {
        const request = pool.request();
        request.input('id', sql.NVarChar, String(obj.id));
        request.input('dados', sql.NVarChar(sql.MAX), JSON.stringify(obj));
        request.input('atualizadoEm', sql.DateTime2, new Date());

        let colunasExtra = '';
        let valoresExtra = '';
        let updateExtra = '';

        if (comCampanhaId) {
          request.input('campanhaId', sql.NVarChar, obj.campanhaId || null);
          colunasExtra += ', campanha_id';
          valoresExtra += ', @campanhaId';
          updateExtra += ', campanha_id = @campanhaId';
        }
        if (tabelaLogica === 'campanhas') {
          request.input('nome', sql.NVarChar, obj.nome || '');
          colunasExtra += ', nome';
          valoresExtra += ', @nome';
          updateExtra += ', nome = @nome';
        }

        await request.query(`
          MERGE ${tabela} AS destino
          USING (SELECT @id AS id) AS origem ON destino.id = origem.id
          WHEN MATCHED THEN
            UPDATE SET dados = @dados, atualizado_em = @atualizadoEm ${updateExtra}
          WHEN NOT MATCHED THEN
            INSERT (id, dados, atualizado_em ${colunasExtra})
            VALUES (@id, @dados, @atualizadoEm ${valoresExtra});
        `);
      }

      return res.status(200).json({ ok: true, quantidade: itens.length });
    }

    if (req.method === 'DELETE') {
      const request = pool.request();
      if (all) {
        await request.query(`DELETE FROM ${tabela}`);
        return res.status(200).json({ ok: true });
      }
      if (!id) return res.status(400).json({ erro: 'id obrigatório' });
      request.input('id', sql.NVarChar, id);
      await request.query(`DELETE FROM ${tabela} WHERE id = @id`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (err) {
    console.error(`[campanhas-data:${tabelaLogica}]`, err);
    return res.status(500).json({ erro: err.message });
  }
}
