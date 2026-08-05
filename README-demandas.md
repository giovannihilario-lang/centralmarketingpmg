# PMG Connect — Central de Demandas V2

A V2 transforma o módulo antigo em uma central diária de trabalho: demandas, agenda, lembretes, compromissos, carga da equipe e histórico de alterações.

## O que entrou

- Tela **Hoje** com atrasos, próximos compromissos, lembretes e movimentações recentes.
- **Agenda mensal** com demandas, lembretes e compromissos.
- **Kanban** preservado, com filtros e visão de arquivadas.
- Tela de **Equipe** com carga, atrasos e entregas da semana.
- Criação rápida de demanda, lembrete ou compromisso.
- Edição completa de demanda: briefing, prioridade, responsável, prazo, horário, esforço, tags e lembrete.
- Lembretes com horário, aviso antecipado, recorrência e visibilidade pessoal/equipe.
- Adiar e concluir lembretes.
- Histórico de atividade por demanda.
- Central de notificações e configuração de Push por computador.
- Busca global.
- Interface responsiva e identidade PMG Connect.

## Instalação sobre a versão atual

1. Preserve seu arquivo `.env`.
2. Substitua os arquivos do projeto pelos arquivos desta pasta.
3. No SQL Editor do Supabase, execute somente:

```text
sql/demandas_v2_migracao.sql
```

A migração foi criada para rodar depois da V1 e preservar colaboradores, tarefas, comentários e notificações existentes.

4. Reinicie o servidor local:

```powershell
npm install
npm start
```

5. Teste localmente:

```text
http://localhost:3001/demandas.html
```

6. Envie ao GitHub:

```powershell
git add -A
git commit -m "Atualiza Central de Demandas para V2"
git push origin main
```

## Vercel Hobby

A pasta `api/` contém exatamente 12 funções. As rotas do Dashboard Regional permanecem em `local-api/` e continuam sendo carregadas apenas pelo `server.js` local.

## Arquivos principais

- `public/demandas.html`
- `public/assets/demandas-v2.css`
- `public/assets/demandas-v2.js`
- `sql/demandas_v2_migracao.sql`
- `api/notificar-demandas.js`
- `public/sw.js`
