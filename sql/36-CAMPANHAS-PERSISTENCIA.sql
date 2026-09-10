-- 36-CAMPANHAS-PERSISTENCIA.sql
--
-- Incidente real (2026-09-10): todas as campanhas cadastradas em
-- public/assets/campanhas-studio-v5.js foram perdidas porque a única
-- persistência existente era o IndexedDB do navegador (banco
-- "pmg_campanhas_db", gaveta "campanhas") — sem nenhum backend real por
-- trás. O app nunca chama navigator.storage.persist(), então o próprio
-- Chrome pode limpar esse armazenamento a qualquer momento sem aviso; não
-- existe UI de exclusão nem código que dê DB.clear() na gaveta, então a
-- explicação mais provável é exatamente essa limpeza automática do
-- navegador. Não há como recuperar o que já se perdeu.
--
-- Esta migração cria uma tabela real para "campanhas" (a única das 9
-- gavetas IndexedDB que é dado genuinamente autoral e crítico — as outras
-- ou nunca são usadas, ou são cache recalculável de consulta ao SQL
-- Server). Guarda o objeto de campanha inteiro como jsonb, no mesmo
-- espírito de estrategia_projetos.baseline e tarefas.checklist já usados
-- neste projeto — não há necessidade de normalizar a estrutura
-- profundamente aninhada (suppliers/goals/rules/pointRules/categories/...)
-- em várias tabelas para resolver o problema real, que é durabilidade.
--
-- Reaproveita a infraestrutura de autenticação/permissão que já existe:
-- campanhas.html já autentica via connect-auth.js contra este mesmo
-- projeto Supabase, e a coluna colaboradores.pode_gerenciar_campanhas já
-- existe (sql/31-CAPACIDADES-CAMPANHAS-CATALOGO.sql), só nunca tinha sido
-- usada de verdade.
--
-- Descoberto ao investigar: já existia uma tabela public.campanhas vazia
-- (id text, nome text, dados jsonb, data jsonb, created_at, updated_at),
-- criada em algum momento anterior mas sem nenhuma função/RLS que a
-- alimentasse — nenhum código no repositório a referenciava. Em vez de
-- criar outra tabela, esta migração ajusta essa mesma tabela: remove a
-- coluna "data" (redundante com "dados", ambas jsonb, tabela vazia então
-- sem risco), renomeia created_at/updated_at para o padrão em português já
-- usado no resto do schema, e adiciona autoria.

ALTER TABLE public.campanhas DROP COLUMN IF EXISTS data;
ALTER TABLE public.campanhas RENAME COLUMN created_at TO criado_em;
ALTER TABLE public.campanhas RENAME COLUMN updated_at TO atualizado_em;
ALTER TABLE public.campanhas
  ALTER COLUMN nome SET NOT NULL,
  ALTER COLUMN dados SET NOT NULL,
  ALTER COLUMN criado_em SET DEFAULT now(),
  ALTER COLUMN criado_em SET NOT NULL,
  ALTER COLUMN atualizado_em SET DEFAULT now(),
  ALTER COLUMN atualizado_em SET NOT NULL,
  ADD COLUMN IF NOT EXISTS criado_por uuid,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid;

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaboradores ativos leem campanhas" ON public.campanhas;
CREATE POLICY "colaboradores ativos leem campanhas" ON public.campanhas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.auth_user_id = auth.uid() AND c.ativo = true
    )
  );

CREATE OR REPLACE FUNCTION public.salvar_campanha_v1(p_id text, p_nome text, p_dados jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ator uuid := public.meu_colaborador_id();
begin
  if v_ator is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if p_id is null or length(trim(p_id)) = 0 then raise exception 'A campanha precisa de um id'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'O nome da campanha é obrigatório'; end if;

  if not (
    public.sou_gestor()
    or exists(select 1 from public.colaboradores where id = v_ator and pode_gerenciar_campanhas = true)
  ) then
    raise exception 'Você não tem permissão para gerenciar campanhas';
  end if;

  insert into public.campanhas(id, nome, dados, criado_por, atualizado_por)
  values (p_id, trim(p_nome), p_dados, auth.uid(), auth.uid())
  on conflict (id) do update
    set nome = excluded.nome,
        dados = excluded.dados,
        atualizado_por = auth.uid(),
        atualizado_em = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_campanha_v1(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ator uuid := public.meu_colaborador_id();
begin
  if v_ator is null then raise exception 'Colaborador não encontrado ou inativo'; end if;

  if not (
    public.sou_gestor()
    or exists(select 1 from public.colaboradores where id = v_ator and pode_gerenciar_campanhas = true)
  ) then
    raise exception 'Você não tem permissão para gerenciar campanhas';
  end if;

  delete from public.campanhas where id = p_id;
end;
$function$;
