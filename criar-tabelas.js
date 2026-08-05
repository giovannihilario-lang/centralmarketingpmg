import fs from 'node:fs/promises';
import { getPool } from './src/lib/db.js';

let pool;

try {
  const script = await fs.readFile('./sql/schema.sql', 'utf8');

  pool = await getPool();
  await pool.request().batch(script);

  console.log('Tabelas criadas com sucesso.');
} catch (erro) {
  console.error('Erro ao criar tabelas:');
  console.error(erro.message);
} finally {
  if (pool) {
    await pool.close();
  }
}