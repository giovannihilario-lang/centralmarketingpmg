-- 38-RLS-PORTAL-FORNECEDOR-NFE-PEDIDOS.sql
--
-- Achado crítico #2 da revisão de segurança (2026-09-08), adiado até agora:
-- as tabelas notas_fiscais e pedidos_fornecedor tinham RLS de leitura
-- `USING (true)` liberada pra `anon` — ou seja, qualquer pessoa na
-- internet, sem login nenhum, podia ler notas fiscais e pedidos de
-- QUALQUER fornecedor via chamada direta à API REST do Supabase (com
-- só a chave publishable, que é pública).
--
-- A intenção original (ver comentário em public/fornecedores.html,
-- "Leitura pública é mantida porque os dashboards por slug são
-- compartilháveis") era permitir que /fornecedor/[slug].html mostrasse o
-- dashboard de UM fornecedor específico via link compartilhável, sem
-- exigir login do fornecedor. O problema é que a RLS não amarra a leitura
-- ao slug — ela libera a tabela inteira. Um visitante que soubesse (ou
-- adivinhasse) qualquer fornecedor_id via API via curl/DevTools via a
-- própria tabela, sem precisar nem saber um slug válido.
--
-- Correção: duas funções SECURITY DEFINER que resolvem o slug pra
-- fornecedor_id internamente e devolvem só as linhas daquele fornecedor
-- (mesmo padrão de RPC já usado no resto do projeto). RLS de leitura
-- direta nas duas tabelas passa a exigir sessão autenticada do PMG
-- Connect (fornecedores.html, uso interno, já exige login) — anon perde
-- acesso direto à tabela e só enxerga dados através das RPCs abaixo,
-- que nunca devolvem mais que um fornecedor por vez.

CREATE OR REPLACE FUNCTION public.portal_pedidos_fornecedor_v1(p_slug text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS SETOF public.pedidos_fornecedor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fornecedor_id bigint;
begin
  select id into v_fornecedor_id from public.fornecedores where slug = p_slug;
  if v_fornecedor_id is null then
    raise exception 'Fornecedor não encontrado';
  end if;

  return query
    select *
    from public.pedidos_fornecedor
    where fornecedor_id = v_fornecedor_id
    order by data asc
    limit greatest(1, least(p_limit, 5000))
    offset greatest(0, p_offset);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_pedidos_fornecedor_v1(text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_notas_fiscais_v1(p_slug text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS SETOF public.notas_fiscais
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fornecedor_id bigint;
begin
  select id into v_fornecedor_id from public.fornecedores where slug = p_slug;
  if v_fornecedor_id is null then
    raise exception 'Fornecedor não encontrado';
  end if;

  return query
    select *
    from public.notas_fiscais
    where fornecedor_id = v_fornecedor_id
    limit greatest(1, least(p_limit, 5000))
    offset greatest(0, p_offset);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_notas_fiscais_v1(text, integer, integer) TO anon, authenticated;

DROP POLICY IF EXISTS "leitura_publica_pedidos" ON public.pedidos_fornecedor;
CREATE POLICY "leitura_autenticada_pedidos" ON public.pedidos_fornecedor
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "leitura_publica_nfe" ON public.notas_fiscais;
CREATE POLICY "leitura_autenticada_nfe" ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
