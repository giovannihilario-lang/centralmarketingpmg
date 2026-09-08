# PMG Connect — Planejamento Estratégico — Instalação

Este patch adiciona ao PMG Connect o módulo **Planejamento Estratégico | Rumo aos R$ 200 milhões**, sem substituir módulos existentes e sem adicionar Serverless Functions à Vercel.

## O que o patch instala

- página `/planejamento-estrategico.html`;
- dashboard executivo com dados reais do Dashboard Regional;
- KPI de clientes positivados calculado no SQL Server;
- sinais determinísticos de oportunidades regionais, categorias, fornecedores e clientes;
- projetos estratégicos com baseline imutável;
- plano de ação interdepartamental;
- criação de Demandas a partir de ações estratégicas;
- medições do ciclo de 90 dias;
- fechamento com aprendizados e recalibração;
- modo apresentação e exportação para PowerPoint `.pptx`;
- migration SQL 28 com tabelas, RLS, policies, RPCs, índices e rollback;
- teste estático `estrategia:testar`.

## Pré-requisitos

Use a versão atual do PMG Connect já com a Central, Demandas e o servidor local funcionando. O módulo comercial depende da mesma conexão SQL Server/Azure já usada pelo Dashboard Regional.

As variáveis SQL continuam sendo lidas do `.env` local existente. Nenhuma credencial faz parte deste patch.

## 1. Aplicar os arquivos

Extraia o conteúdo deste ZIP na **raiz do repositório PMG Connect**, preservando as pastas.

O patch não traz uma cópia de `public/central.html` nem de `package.json`, para não sobrescrever alterações mais recentes do seu projeto. Em vez disso, execute o instalador abaixo, que faz alterações pontuais e idempotentes nesses dois arquivos:

```powershell
node scripts/instalar-planejamento-estrategico.mjs
```

Resultado esperado:

```text
PLANEJAMENTO_ESTRATEGICO_INSTALL: PASS
```

O instalador:

- adiciona **Planejamento Estratégico** à navegação principal e à `quick-grid` da Central;
- adiciona `npm run estrategia:testar` ao `package.json`;
- não duplica nenhuma das duas alterações se for executado novamente.

## 2. Executar o SQL 28 no Supabase PMG

No SQL Editor do **Supabase usado pelo PMG Connect**, execute:

```text
sql/28-PLANEJAMENTO-ESTRATEGICO.sql
```

A migration cria somente estruturas novas do módulo estratégico. Ela não apaga nem reescreve dados existentes de Demandas, Acompanhamento, Fornecedores, Campanhas ou Dashboard Regional.

O baseline de cada projeto fica protegido contra edição posterior e a tabela de medições não permite `UPDATE` para usuários comuns, preservando o histórico do ciclo.

## 3. Rodar os testes

Na raiz do projeto:

```powershell
npm run estrategia:testar
```

Resultado esperado:

```text
PLANEJAMENTO_ESTRATEGICO: PASS
```

Depois, rode também as validações que já fazem parte do seu projeto atual:

```powershell
npm test
npm run vercel:check
```

Se o projeto atual não possuir `npm test`, ignore apenas esse comando. O `vercel:check` deve continuar com a mesma contagem de funções porque `local-api/estrategia-clientes.js` roda apenas no servidor Node local.

## 4. Teste local

Inicie o PMG Connect normalmente:

```powershell
npm start
```

Abra:

```text
http://localhost:3001/planejamento-estrategico.html
```

Valide, nesta ordem:

1. a página autentica com a conta PMG;
2. faturamento, kg, pedidos, cidades e fornecedores coincidem com o Dashboard Regional para o mesmo mês;
3. clientes positivados carregam sem erro;
4. oportunidades aparecem com evidência e regra rastreável;
5. criar um projeto grava baseline e uma medição `baseline`;
6. adicionar uma ação e usar **Criar demanda** abre vínculo real com Demandas;
7. **Medir período atual** adiciona nova medição sem alterar a anterior;
8. **Fechar ciclo** registra o resultado e os aprendizados;
9. **Apresentar** abre o modo de reunião;
10. **Exportar PPTX** gera o arquivo da apresentação com os dados atuais.

## Fonte dos dados

O módulo não duplica a base comercial no Supabase.

Os indicadores comerciais continuam vindo do PMG Bridge / SQL Server:

- `/api/kpis`;
- `/api/agregado-cidades`;
- `/api/agregado-por-dimensao`;
- `/api/evolucao-mensal`;
- `/api/periodos-distintos`;
- `/api/estrategia-clientes`.

O Supabase armazena apenas a camada estratégica: oportunidades salvas, projetos, baseline, ações, medições e revisões.

## Rollback

Se for necessário remover somente as estruturas de banco deste módulo, use:

```text
sql/28-ROLLBACK-PLANEJAMENTO-ESTRATEGICO.sql
```

Depois reverta os arquivos do patch pelo Git. Não execute rollback durante uma instalação normal.

## Git commit

Depois dos testes:

```powershell
git add public/planejamento-estrategico.html public/assets/estrategia-core.js public/assets/estrategia.js public/assets/estrategia.css local-api/estrategia-clientes.js sql/28-PLANEJAMENTO-ESTRATEGICO.sql sql/28-ROLLBACK-PLANEJAMENTO-ESTRATEGICO.sql scripts/instalar-planejamento-estrategico.mjs scripts/testar-planejamento-estrategico.mjs public/central.html package.json PMG-CONNECT-PLANEJAMENTO-ESTRATEGICO-INSTALACAO.md PMG-CONNECT-PLANEJAMENTO-ESTRATEGICO-PATCH-NOTES.md
git commit -m "feat: add strategic planning and 90-day execution to PMG Connect"
git push origin main
```
