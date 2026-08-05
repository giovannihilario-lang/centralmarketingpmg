# PMG Connect — Módulo Demandas

O módulo está em `public/demandas.html` e usa Supabase Auth, PostgreSQL, Realtime e Web Push.

## O que foi implementado

- Quadro Kanban com os status Nova, Em andamento, Em revisão e Concluída.
- Criação e delegação de demandas restritas a gestores.
- Alteração de status pelo gestor ou pelo colaborador responsável.
- Comentários por tarefa.
- Indicadores de carga da equipe, urgências e prazos.
- Arquivamento e restauração por soft delete, restritos a gestores.
- Perfil individual no primeiro acesso, com nome, cargo e espaço preparado para avatar.
- Notificações internas em tempo real.
- Registro de notificações Push para Windows/navegador.
- Job diário para gerar alertas de tarefas com prazo hoje ou amanhã.

## Instalação

### 1. Banco de dados

No SQL Editor do Supabase, execute:

```text
sql/demandas_supabase.sql
```

O script tenta habilitar o módulo Cron. Caso o painel mostre um aviso, abra **Supabase > Integrations > Cron**, habilite o módulo e execute novamente apenas o bloco de agendamento próximo ao fim do arquivo.

### 2. Usuários

Crie uma conta em **Authentication > Users** para cada integrante do Marketing. No primeiro login, o perfil do colaborador é criado automaticamente e o formulário solicita nome e cargo.

Depois que os gestores entrarem uma vez, promova-os pelo SQL Editor:

```sql
update public.colaboradores c
set role = 'gestor'::public.role_colaborador
from auth.users u
where c.auth_user_id = u.id
  and u.email in (
    'EMAIL-DO-GESTOR-1',
    'EMAIL-DO-GESTOR-2'
  );
```

### 3. Variáveis do Vercel

Cadastre no Vercel as variáveis presentes em `.env.example`:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
CRON_SECRET
```

A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser colocada em HTML ou enviada ao navegador.

### 4. Push

O endpoint `api/notificar-demandas.js` entrega as notificações pendentes. Ele é chamado imediatamente pelo frontend depois de ações que geram notificação e também uma vez por dia pelo Vercel Cron, às 11:05 UTC, para entregar os alertas de prazo gerados às 11:00 UTC.

O plano Hobby do Vercel aceita cron diário, mas não execução a cada poucos minutos. Por isso as atualizações imediatas usam uma chamada autenticada do próprio módulo.

### 5. Avatares

Enquanto não houver imagem, o sistema mostra as iniciais. Depois, coloque os arquivos em uma pasta pública, por exemplo `public/avatares/`, e atualize:

```sql
update public.colaboradores
set foto_url = '/avatares/nome.png'
where auth_user_id = 'UUID-DO-USUARIO';
```

## Arquivos alterados ou adicionados

- `public/demandas.html`
- `public/central.html`
- `public/sw.js`
- `api/notificar-demandas.js`
- `sql/demandas_supabase.sql`
- `.env.example`
- `vercel.json`
