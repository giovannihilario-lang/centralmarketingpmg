# Plano de melhoria — PMG Connect
**Data:** 08/09/2026 · Baseado na revisão completa de 08/09/2026 (`revisao-pmg-connect-2026-09-08.md`)

Este plano cobre as três frentes discutidas — dependência de localhost, performance e visual — organizadas por prioridade e dependência entre si. A Fase 0 é a base: sem resolver o acesso ao SQL Server fora do "localhost", boa parte do ganho de performance fica limitado a quem está rodando o projeto na própria máquina.

---

## Fase 0 — Tirar o SQL Server da dependência de "localhost" (bloqueador estrutural)

**Por que é prioridade zero:** hoje `api/campanhas-data.js` (o que roda de fato na Vercel) é um stub que devolve erro pedindo pra usar a API local. Quem consulta o SQL Server de verdade é o `local-api/`, que só existe rodando `node server.js` na sua máquina. Ou seja: o site publicado provavelmente não mostra dados comerciais reais pra ninguém além de quem está com o projeto aberto localmente — isso é maior que uma questão de velocidade.

**O que fazer:** você não precisa esperar a empresa toda ter IP fixo — basta **um servidor pequeno, sempre ligado, com IP fixo**, rodando o que hoje é `local-api/`, e o frontend passa a chamar essa URL em vez de `localhost:3001`.

| Opção | Custo aproximado | Quando faz sentido |
|---|---|---|
| VPS simples (DigitalOcean, Lightsail, Azure VM) | ~R$30–50/mês | Mais rápido de configurar, funciona com qualquer SQL Server acessível pela internet (com IP liberado no firewall) |
| Azure App Service/Container App na mesma rede do SQL Server | Varia, pode ser mais barato se já usam Azure | Evita expor o SQL Server à internet — tudo fica dentro da rede Azure |
| Cloudflare Tunnel a partir de uma máquina fixa da empresa (não notebook pessoal) | Grátis | Solução ponte, só se não puder migrar pra nuvem ainda |

**Passos:**
1. Escolher a opção de hospedagem.
2. Subir o `local-api/` + `server.js` (ou só as rotas de API, sem a parte de servir os arquivos estáticos, que já ficam na Vercel) nesse servidor.
3. Liberar o IP fixo desse servidor no firewall do SQL Server.
4. Trocar a URL base que o frontend usa (hoje aponta pra `localhost:3001` em dev) para apontar pra esse servidor em produção.
5. Testar cada endpoint que hoje só funciona local (campanhas, dashboard regional, performance comercial) contra o novo servidor.

**Esforço:** médio, é infraestrutura, não reescrita de código — pode rodar em paralelo com as fases seguintes.
**Validação:** abrir o site pela URL pública (não localhost) e confirmar que campanhas/dashboard regional carregam dados reais.

---

## Fase 1 — Performance rápida, baixo risco (1–2 dias)

Essas mudanças não mexem em regra de negócio, só em como os arquivos são carregados/servidos.

1. **`defer`/`async` nos scripts que bloqueiam renderização.** `dashboard-regional.html` carrega Chart.js, Leaflet, PapaParse e XLSX (400KB+) direto no `<head>` sem `defer` — a página trava esperando tudo isso antes de mostrar qualquer coisa. `geo-data.js` (251KB) também.
2. **`Cache-Control` no `vercel.json`** para os arquivos de `/assets/*` — hoje só tem headers de segurança (que adicionei na revisão), sem cache. Toda visita rebaixa tudo do zero.
3. **Remover os 6 arquivos JS mortos** do módulo antigo de campanhas (`campaign-builder-v2.js`, `campaign-builder-v3-7.js`, `campaign-studio-v3-3.js`, `campaign-studio-v3-7.js`, `campanhas-fast-v4.js`, `campanhas-v3.js`, ~280KB somados) e `src/campanhas/json-store.js` — confirmados sem uso em nenhum HTML.
4. **Minificar os bundles gigantes**: `demandas-v2.js` (510KB), `acompanhamento.js` (333KB), `campanhas-studio-v5.js` (236KB) e os `.css` equivalentes estão sem nenhuma minificação. Adicionar um passo de build simples (esbuild ou terser) antes do deploy reduz isso facilmente em 40–60% sem mudar o código-fonte.
5. **Carregar bibliotecas pesadas só quando usadas**: Leaflet só quando o mapa é aberto, `xlsx.full.min.js` só na hora de exportar — em vez de sempre no carregamento da página.

**Esforço:** baixo. **Risco:** baixo (não muda lógica). Posso aplicar isso diretamente, como fiz na revisão anterior.

---

## Fase 2 — Performance estrutural (1–2 semanas)

- Mover o cálculo de elegibilidade/ranking de campanhas do navegador pro backend (resolve performance *e* o achado de segurança de cálculo client-side que reportei).
- Resolver a persistência real de campanhas (achado crítico #1 da revisão) — hoje tudo é recalculado do zero no IndexedDB a cada acesso, o que também pesa.
- Paginação server-side em vez de carregar datasets grandes inteiros no navegador (dashboard regional, acompanhamento).
- Consolidar chamadas repetidas usando o "Commercial Context" compartilhado que o projeto já prevê, evitando que cada componente busque a mesma coisa separadamente.

**Esforço:** médio-alto, exige decisões de arquitetura (algumas já estão na lista de pendências críticas da revisão).

---

## Fase 3 — Visual/design system (contínuo, 2–4 semanas de migração gradual)

**Diagnóstico:** cada módulo tem seu próprio CSS gigante e independente (`demandas-v2.css` 400KB, `acompanhamento.css` 286KB, `campanhas-studio-v5.css` 89KB, mais `estrategia.css`, `wave2-operacoes.css`, `fornecedor-360.css`, `performance-comercial.css`) — sinal de que cada módulo foi construído do zero, sem componentes compartilhados. Isso é a causa mais provável da sensação de inconsistência visual.

1. Expandir o `connect-core.css` (hoje pequeno) com tokens de design — cores laranja/navy, tipografia, espaçamento — e componentes base (botão, card, badge de status, modal), seguindo a estética VisionOS/liquid glass já definida no projeto.
2. Migrar módulo por módulo pro sistema compartilhado, começando pelo mais usado no dia a dia (sugestão: `central.html`/demandas).
3. Padronizar loading states, empty states e mensagens de erro (já é um princípio explícito do projeto).
4. Remover CSS duplicado à medida que cada módulo migra.

**Esforço:** o mais longo dos quatro, mas pode ser feito em paralelo com as outras fases, módulo por módulo, sem quebrar nada.

---

## Fase 4 — Pendências de segurança da revisão anterior (não é sobre lentidão/visual, mas está na fila)

- RLS pública em `notas_fiscais`/`pedidos_fornecedor` no Supabase.
- Confirmar se as rotas `/api/wave2/*` funcionam em produção (podem estar quebradas — só existem no `server.js` local).
- Remover ou restringir `local-api/_schema.js` (expõe schema do SQL Server a qualquer usuário logado).

---

## Resumo — por onde começar

| Fase | Prioridade | Esforço | Pode começar já? |
|---|---|---|---|
| 0 — Tirar SQL Server do localhost | 🔴 Crítica | Médio (infra) | Sim, em paralelo |
| 1 — Performance rápida | 🟠 Alta | Baixo | Sim, posso aplicar agora |
| 4 — Segurança pendente | 🟠 Alta | Baixo-médio | Sim |
| 2 — Performance estrutural | 🟡 Média | Médio-alto | Depois da Fase 0 |
| 3 — Design system | 🟢 Contínua | Alto (mas gradual) | Pode começar já, sem pressa |
