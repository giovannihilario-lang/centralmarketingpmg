# Revisão completa — PMG Connect
**Data:** 08/09/2026 · **Repositório:** `pmg-marketing` (pasta local do usuário, ligado ao GitHub/Vercel)
**Escopo:** frontend (public/), API Vercel (api/), API local de desenvolvimento (local-api/), camada de negócio (src/), servidor local (server.js), SQL/migrações relevantes, configuração de deploy (vercel.json, package.json, GitHub Actions).

Revisão feita em 5 frentes paralelas: (1) Autenticação/Segurança, (2) Módulo de Campanhas, (3) Demandas/Planejamento, (4) Dashboard Regional/SQL Server, (5) Deploy/Config + restante do frontend.

10 arquivos foram corrigidos diretamente na sua pasta local (bugs de JavaScript claros e seguros). **Nada foi commitado no git nem enviado para o GitHub/Vercel** — as mudanças estão como alterações não commitadas no seu working directory, para você revisar o diff no VS Code antes de commitar/dar push.

---

## ✅ Corrigido automaticamente (10 arquivos)

| # | Arquivo | Problema | Correção |
|---|---|---|---|
| 1 | `public/assets/academia-checkin.js` | **XSS armazenado** na página pública de check-in (sem login, acessível via QR code). Título/local do treinamento eram inseridos via `innerHTML` sem escapar HTML. | Adicionada função `esc()` (mesmo padrão do resto do projeto) e escapado o conteúdo antes de montar o HTML. |
| 2 | `vercel.json` | Headers de segurança (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) só existiam no servidor local (`server.js`) — em produção (Vercel) não existiam. | Adicionado bloco `"headers"` replicando a mesma política para todas as rotas. |
| 3 | `.env.example` | `ACADEMIA_FORMS_WEBHOOK_SECRET` era exigida pelo código mas não estava documentada — risco de esquecer de configurar na Vercel. | Variável documentada com comentário explicativo. |
| 4 | `public/assets/campanhas-studio-v5.js` | **Bug de fuso-horário**: `asOfDate` era calculado com `new Date().toISOString()` (UTC). Entre ~21h e 23h59 (horário de Brasília), o backend recebia a data do dia seguinte, distorcendo `elapsedDays`/ritmo comparativo das campanhas nas últimas horas do dia. | Criado helper `todayLocalDate()` (mesmo padrão já usado em `nextMonday()`/`sixthMondayFrom()` no arquivo) e substituídas as 5 ocorrências. |
| 5 | `local-api/estrategia-clientes.js` | Endpoint mantinha **seu próprio pool de conexão SQL Server**, duplicado e divergente do pool compartilhado (`src/lib/db.js`): não suportava as variáveis de fallback `AZURE_SQL_*` e não tinha recuperação automática de erro de conexão (`pool.on('error')`), podendo travar em 500 até reiniciar o processo. | Substituído pelo pool compartilhado (`getPool()` de `src/lib/db.js`). |
| 6 | `public/assets/supplier-identity-core.js` | `normalizeSupplierCnpj()` tinha um `ternário` onde os dois ramos retornavam o mesmo valor — **nunca invalidava CNPJ malformado**, podendo gerar falsos "CNPJ duplicado" ou falsos matches entre fornecedores diferentes. | Corrigido para retornar string vazia quando o CNPJ não tem 14 dígitos. |
| 7 | `api/notificar-debitos.js` | E-mail do remetente VAPID (push notification) estava hardcoded e diferente do padrão usado no endpoint irmão (`notificar-demandas.js`), ignorando a variável de ambiente `VAPID_SUBJECT` já documentada. | Alinhado para usar `process.env.VAPID_SUBJECT` com o mesmo fallback do outro endpoint. |
| 8 | `public/fornecedores.html` | Botão **"Ativar notificações" sempre falhava (401)** — a chamada a `/api/salvar-subscricao` não enviava o token de autenticação exigido pelo endpoint. | Adicionado header `Authorization: Bearer <token>` via `window.PMGConnectAuth.ensureAccessToken()`. |
| 9 | `public/upload.html` | Mesmo problema do #8 na chamada a `/api/processar-xlsx` — hoje "mascarado" porque o endpoint retorna 501 antes (feature de sell-in ainda não ligada), mas quebraria no dia em que for ativada. | Header de autenticação adicionado preventivamente. |
| 10 | `public/upload-sellin.html` | Mesmo problema do #8/#9 na chamada a `/api/processar-sellin`. | Header de autenticação adicionado preventivamente. |

Todos os arquivos `.js` alterados foram validados com `node --check` (sintaxe OK).

---

## 🔴 Crítico / Alto — precisam da sua decisão (nada foi alterado)

1. **Campanhas não têm persistência real — vivem só no IndexedDB do navegador.**
   `saveCampaign()`/`loadCampaigns()` em `campanhas-studio-v5.js` gravam/leem apenas do IndexedDB local do navegador. Existe um endpoint de backend pronto (`local-api/campanhas-storage.js`, grava em `data/campanhas-studio-v5.json`) e até uma camada mais antiga (`src/campanhas/json-store.js`) e tabelas desenhadas no `sql/schema.sql` (`campanhas`, `campanhas_regras`, etc.) — **nenhuma dessas três é chamada pelo frontend atual**.
   **Consequência prática:** uma campanha criada por um usuário é invisível para outro usuário/dispositivo; limpar o navegador ou trocar de PC apaga a campanha permanentemente; não há backup nem trilha de quem criou/editou o quê. Isso é exatamente o padrão "UI state não é persistência" que o projeto já identificou como problema histórico — aqui é ainda mais estrutural, pois não existe fonte de verdade nenhuma.
   **Decisão necessária:** reativar `/api/campanhas-storage` (JSON local), migrar para as tabelas já desenhadas no SQL Server, ou usar Supabase? Não decidi sozinho por ser uma escolha de arquitetura.

2. **RLS pública (`USING (true)`) nas tabelas `notas_fiscais` e `pedidos_fornecedor`.**
   As policies do Supabase liberam leitura de **todas** as notas fiscais e pedidos de **todos** os fornecedores para qualquer pessoa que tenha a anon key — que está exposta publicamente no HTML de `public/fornecedor/slug.html`. O frontend filtra por `fornecedor_id` ao consultar, mas isso é só filtro de aplicação: qualquer pessoa pode chamar a API REST do Supabase diretamente e baixar dados financeiros de todos os fornecedores, não só do slug que está vendo.
   **Recomendação:** trocar por uma RPC `SECURITY DEFINER` que recebe o slug e devolve só os dados daquele fornecedor, em vez de `SELECT` liberado na tabela inteira.

3. **As rotas `/api/wave2/*` (portal de fornecedor externo, check-in de academia, upload interno) só existem no `server.js` local**, que usa `app.listen()` — modelo incompatível com Serverless Functions da Vercel. Não há arquivo correspondente em `/api/` nem entrada em `vercel.json` para elas.
   **Isso pode significar que 3 páginas públicas estão quebradas em produção agora:** `fornecedor-envio.html` (portal de fornecedor externo), `academia-checkin.html` (check-in via QR code) e o upload interno em `operacoes.html`. Não consegui confirmar ao vivo (o fetch de teste neste ambiente não teve acesso à internet pública), então **peço que você teste diretamente**: abra um link de fornecedor real ou o QR code de check-in e veja se a página realmente salva. Se estiver quebrado, a correção é mover essas rotas para dentro de `/api/`.

4. **`local-api/_schema.js`** expõe toda a estrutura do banco SQL Server (nomes de tabelas/colunas via `INFORMATION_SCHEMA`) para qualquer usuário autenticado (não só admin) — o próprio comentário no código diz que era um endpoint temporário de migração, esquecido em produção. Recomendo remover ou restringir a um papel administrativo.

5. **Escritas em `local-api/campanhas-storage.js` e `local-api/catalogo-estado.js`** exigem só sessão válida, sem checar papel/permissão — qualquer colaborador logado pode sobrescrever/apagar qualquer campanha ou o catálogo inteiro (diferente do padrão de permissão granular já usado no módulo Wave2). Pode ser intencional (equipe pequena), mas como envolve dados comerciais, prefiro que vocês confirmem.

---

## 🟡 Médio

- **Regra das "6 segundas-feiras" duplicada** entre frontend (preview) e backend (cálculo autoritativo) em arquivos diferentes. Hoje está sincronizada e o backend sempre recalcula por cima, mas se um dia alguém mudar a regra em só um lugar, o preview da tela diverge do resultado real da apuração.
- **Toda a lógica de elegibilidade/ranking/pontuação de campanhas roda só no navegador** (`calculatePerformance` em `campanhas-studio-v5.js`) — como a definição da campanha também só existe no IndexedDB (achado crítico #1), um usuário com DevTools poderia alterar a campanha antes de reabrir a apuração.
- **Dependências não usadas em `package.json`**: `@supabase/ssr` e `cors` estão declaradas mas nunca importadas em lugar nenhum do código.
- **GitHub Action `notificar-debitos.yml`** roda 3x ao dia chamando um endpoint que hoje sempre retorna 501 (a feature de notas fiscais/sell-in está "adiada" — as tabelas ainda não foram mapeadas em `src/lib/tabelas.js`). Consome minutos de CI e uma invocação Vercel à toa.
- **`local-api/catalogo-estado.js`** devolve `err.message` cru ao cliente em qualquer ambiente (outros endpoints do mesmo diretório escondem detalhes internos em produção) — pode vazar nomes de tabela/coluna do SQL Server em mensagens de erro.
- **Rate limit de `api/analisar-documento.js`** é só em memória (`Map` no escopo do módulo) — não sobrevive a múltiplas instâncias serverless da Vercel escalando em paralelo.

## 🟢 Baixo / limpeza

- **~5.250 linhas de JavaScript morto**: `campaign-builder-v2.js`, `campaign-builder-v3-7.js`, `campaign-studio-v3-3.js`, `campaign-studio-v3-7.js`, `campanhas-fast-v4.js`, `campanhas-v3.js` — versões antigas do módulo de Campanhas, confirmado (via grep em todos os HTML/JS do projeto) que nenhuma é mais referenciada. Só `campanhas-studio-v5.js` está ativo. Vale limpar numa faxina deliberada (não apaguei nada).
- `src/campanhas/json-store.js` também sem nenhuma referência no projeto.
- `local-api/test-azure-sql.js`: endpoint de diagnóstico órfão, duplica config de conexão SQL fora do padrão do resto do projeto e pode vazar host/porta do SQL Server em mensagens de erro.
- `demandas-v2.js:2018`: `Promise.all` marcando notificações como lidas não checa erro por item individualmente (impacto mínimo — só o flag "lida").
- `processar-sellin.js:115`: `console.log` de debug esquecido (o próprio comentário do código já avisa "remover depois de confirmar em produção"), loga valores de nota fiscal nos logs da Vercel.
- `.env.example` documenta `PMG_IMAGE_PROXY_HOSTS`, variável que o código não lê mais (a proteção de `img-proxy.js` hoje é feita por resolução de DNS/bloqueio de IP privado, mais robusta que um allowlist).

## ✅ O que foi verificado e está correto (sem achados)

- Nenhum uso do bug histórico "Bearer com ANON_KEY em vez do token do usuário" — todas as escritas relevantes (planejamento, acompanhamento, demandas) usam o token real da sessão.
- Trava de confirmação do Marcos (`acompanhamento_registros`/`acompanhamento_pagamentos`) está implementada corretamente **tanto no banco** (triggers `security definer`) **quanto no frontend**, com verificação da resposta do RPC antes de assumir sucesso e reversão do estado otimista em caso de erro — exatamente o padrão que evita o bug "UI diz Publicado, banco fica Planejado".
- Todos os `CHECK CONSTRAINT`s de estado/status revisados (ocorrências recorrentes, tarefas, oportunidades/projetos estratégicos, decisões de qualidade Wave2, obrigações de fornecedor, reservas de academia) batem 100% com os valores literais usados no JavaScript.
- Nenhuma query SQL Server com concatenação de string vinda de input do usuário — tudo parametrizado via `.input()`.
- Nenhum alias de JOIN inválido encontrado (o erro histórico "Column X.Y invalid in select list" não se repete nos arquivos revisados).
- Nenhum número comercial (fornecedores/produtos/representantes/metas) hardcoded.
- `img-proxy.js` tem proteção sólida contra SSRF.
- `.env` está corretamente no `.gitignore`; nenhum segredo real hardcoded no código-fonte.

---

## Próximos passos sugeridos

1. **Revisar o diff no VS Code** dos 10 arquivos alterados (nada foi commitado) e testar localmente antes de dar commit/push.
2. **Decidir o destino da persistência de Campanhas** (achado crítico #1) — é o problema estrutural mais importante encontrado.
3. **Testar ao vivo** o portal de fornecedor e o check-in de academia para confirmar se as rotas `/api/wave2/*` funcionam em produção (achado crítico #3).
4. Revisar a policy RLS de `notas_fiscais`/`pedidos_fornecedor` (achado crítico #2) com quem cuida do Supabase.
5. Quando for conveniente, limpar o código morto de Campanhas (~5.250 linhas) e as dependências não usadas do `package.json`.
