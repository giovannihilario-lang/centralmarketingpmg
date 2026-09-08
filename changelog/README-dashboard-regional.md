# Dashboard Regional — arquitetura ativa

O Dashboard Regional é servido por `public/dashboard-regional.html` e consulta as rotas SQL de `local-api/` registradas pelo `server.js`.

## Fluxo de acesso

Quando aberto pelo PMG Connect hospedado, o usuário precisa estar autenticado no Supabase Auth. A página transfere a sessão para `http://localhost:3001/dashboard-regional.html` por um fragmento temporário da URL. O fragmento não é enviado ao servidor e é removido do endereço após `setSession`.

As chamadas para `/api/*` no serviço local recebem automaticamente `Authorization: Bearer <token>`. Sem token válido, as rotas SQL retornam 401.

## Integridade dos dados

- `Vendas`, `Clientes` e `Produtos` são reduzidos a uma linha por ID antes dos JOINs do Regional.
- Faturamento e volume vêm de `VendasProdutos`, preservando linhas legítimas de item.
- Ticket médio usa faturamento dividido por pedidos distintos.
- Cidades usam normalização de caixa, espaços e collation sem diferenciação de acento.
- Heatmap agrupa por UF + ano + mês.
- Atualização explícita pode ignorar cache do servidor naquele ciclo.
- Conexões SQL usam o pool compartilhado de `src/lib/db.js`.

## CORS / acesso local

Origens extras devem ser informadas em:

```env
PMG_ALLOWED_ORIGINS=https://exemplo.interno,https://outro-dominio.com
```

Não desative a autenticação da API local em produção.
