# Carga da Central pelo SQL Editor do Supabase

O arquivo integral ultrapassa o limite de tamanho do editor. Use estes lotes menores.

## Ordem

1. Execute primeiro `sql/06-CENTRAL-ACOMPANHAMENTO.sql`.
2. Execute os arquivos abaixo, um de cada vez, na ordem:

- `07-01-CARGA.sql`
- `07-02-CARGA.sql`
- `07-03-CARGA.sql`
- `07-04-CARGA.sql`
- `07-05-CARGA.sql`
- `07-06-CARGA.sql`
- `07-07-CARGA.sql`
- `07-08-CARGA.sql`
- `07-09-CARGA.sql`
- `07-10-CARGA.sql`
- `07-11-CARGA.sql`
- `07-12-CARGA.sql`
- `07-13-CARGA.sql`
- `07-14-CARGA.sql`
- `07-15-CARGA.sql`
- `07-16-CARGA.sql`
- `07-17-CARGA.sql`
- `07-18-CARGA.sql`

3. Execute `07-99-CONFERENCIA-FINAL.sql`.

Todos os lotes são idempotentes: se um deles falhar por conexão, ele pode ser executado novamente. O maior lote possui 166.3 KB.
