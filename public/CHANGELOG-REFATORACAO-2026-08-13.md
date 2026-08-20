# Refatoração PMG Connect — 13/08/2026

## Autenticação e segurança

- Login antigo por `users.json`/`sessionStorage` removido.
- Páginas internas migradas para Supabase Auth.
- Ponte de sessão segura entre portal hospedado e `localhost:3001` para Campanhas/Regional.
- Rotas SQL locais exigem Bearer válido.
- Uploads e endpoints administrativos exigem sessão.
- Headers de segurança adicionados ao Node local.
- Proxy de imagens restringido a hosts configurados, com timeout, validação de tipo e limite de tamanho.
- Migração RLS criada em `sql/SEGURANCA-PMG-CONNECT.sql`.

## Integração

- Campanhas passam a manter cópia persistente no serviço local além do IndexedDB.
- Cliente Supabase autenticado compartilhado por Dashboard/Fornecedores/Upload Sell-In.
- Links internos do portal apontam diretamente para `/ferramentas/catalogo.html`; o Catálogo foi mantido sem redirecionamento adicional.
- Navegação de retorno ao Connect e saída padronizada nos módulos internos.

## Interface

- Login redesenhado na identidade verde PMG Connect.
- Uploads alinhados à identidade do portal. O Catálogo foi restaurado integralmente ao visual e comportamento do pacote original.
- Dashboard Geral recebeu identidade e breakpoints responsivos.
- Favicon oficial conectado às páginas e otimizado.
- Imagens grandes de logo, mascote e avatares comprimidas/redimensionadas sem alterar os caminhos usados pelo app.

## Manutenção

- Funções duplicadas de Demandas consolidadas.
- Assets V2/V3/V4 de Campanhas não referenciados removidos.
- Cópias antigas de backend dentro de `public/` removidas.
- Cron obsoleto de sincronização de produtos removido.
- Documentação antiga conflitante removida/atualizada.

## Exceção intencional — Catálogo
- `public/ferramentas/catalogo.html`, `api/produtos-supabase.js`, `api/produtos.js`, `api/sync-produtos.js`, `api/img-proxy.js` e `local-api/catalogo-estado.js` foram restaurados exatamente do pacote original a pedido do usuário.
- A autenticação, regras de proxy e comportamento da API do Catálogo não foram alterados nesta versão.
