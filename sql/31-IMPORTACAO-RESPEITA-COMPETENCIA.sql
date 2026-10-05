-- O casamento de compatibilidade do importador (quando o fingerprint exato
-- não existe) comparava arquivo/aba/fornecedor/categoria/natureza, mas não
-- o mês. Como o fechamento de todo mês usa o mesmo modelo
-- ("Fornecedores 2026.xlsx" / "Planilha1"), a importação de setembro casava
-- com as linhas de agosto do mesmo fornecedor: se agosto já estava
-- confirmado, setembro era recusado ("já foi confirmado por Marcos"); se não
-- estivesse, setembro sobrescrevia agosto. Agora o casamento exige também a
-- mesma data de início (competência). Importações anuais (MKTG) não mudam:
-- reimportar a mesma linha gera a mesma data de início.
create or replace function public.importar_acompanhamentos_v1(p_controle text, p_ano integer, p_nome_arquivo text, p_linhas jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_importacao uuid;
  v_item jsonb;
  v_registro jsonb;
  v_pagamento jsonb;
  v_id uuid;
  v_existente uuid;
  v_criadas integer := 0;
  v_atualizadas integer := 0;
  v_ignoradas integer := 0;
  v_indice integer := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if p_controle not in ('marcos', 'marketing') then raise exception 'Controle invalido'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Linhas de importacao invalidas'; end if;

  insert into public.acompanhamento_importacoes(controle, ano_referencia, nome_arquivo, total_linhas, criado_por)
  values (p_controle, p_ano, coalesce(nullif(trim(p_nome_arquivo), ''), 'planilha.xlsx'), jsonb_array_length(p_linhas), v_ator)
  returning id into v_importacao;

  for v_item in select value from jsonb_array_elements(p_linhas)
  loop
    v_indice := v_indice + 1;
    begin
      v_registro := coalesce(v_item -> 'registro', '{}'::jsonb)
        || jsonb_build_object(
          'controle', p_controle,
          'ano_referencia', coalesce((v_item -> 'registro' ->> 'ano_referencia')::integer, p_ano),
          'origem_importacao', p_nome_arquivo,
          'linha_origem', coalesce((v_item -> 'registro' ->> 'linha_origem')::integer, v_indice + 1)
        );

      if trim(coalesce(v_registro ->> 'titulo', '')) = '' then
        v_ignoradas := v_ignoradas + 1;
        continue;
      end if;

      select r.id into v_existente
      from public.acompanhamento_registros r
      where r.fingerprint = nullif(v_registro ->> 'fingerprint', '')
        and r.arquivado_em is null
      limit 1;

      -- Compatibilidade com as cargas anteriores, cujos fingerprints incluíam
      -- o número físico da linha. A identidade oficial passa a ser semântica:
      -- arquivo/aba + fornecedor + categoria + natureza do detalhamento +
      -- competência (data de início).
      if v_existente is null and coalesce(v_registro -> 'dados_originais' ->> 'aba', '') <> '' then
        select r.id into v_existente
        from public.acompanhamento_registros r
        where r.arquivado_em is null
          and r.controle = p_controle
          and r.ano_referencia = coalesce((v_registro ->> 'ano_referencia')::integer, p_ano)
          and r.data_inicio is not distinct from nullif(v_registro ->> 'data_inicio', '')::date
          and coalesce(r.dados_originais ->> 'arquivo', r.origem_importacao, '') = coalesce(v_registro -> 'dados_originais' ->> 'arquivo', p_nome_arquivo, '')
          and coalesce(r.dados_originais ->> 'aba', '') = coalesce(v_registro -> 'dados_originais' ->> 'aba', '')
          and coalesce(r.fornecedor, '') = coalesce(nullif(trim(v_registro ->> 'fornecedor'), ''), '')
          and r.categoria = coalesce(nullif(trim(v_registro ->> 'categoria'), ''), 'outro')
          and r.natureza = coalesce(nullif(trim(v_registro ->> 'natureza'), ''), 'neutro')
          and (
            (coalesce(nullif(trim(v_registro ->> 'fornecedor'), ''), '') <> '' and coalesce(nullif(trim(v_registro ->> 'categoria'), ''), 'outro') <> 'pendencia')
            or (r.titulo = trim(v_registro ->> 'titulo') and coalesce(r.descricao, '') = coalesce(nullif(trim(v_registro ->> 'descricao'), ''), ''))
          )
          and ('centro-custo' = any(coalesce(r.tags, '{}'::text[]))) = exists (
            select 1 from jsonb_array_elements_text(coalesce(v_registro -> 'tags', '[]'::jsonb)) tag where tag = 'centro-custo'
          )
          and coalesce(r.centro_custo, '') = coalesce(nullif(trim(v_registro ->> 'centro_custo'), ''), '')
        order by r.atualizado_em desc
        limit 1;
      end if;

      v_id := public.salvar_acompanhamento_v1(v_existente, v_registro);
      if v_existente is null then v_criadas := v_criadas + 1;
      else v_atualizadas := v_atualizadas + 1;
      end if;

      if jsonb_typeof(v_item -> 'pagamentos') = 'array' then
        for v_pagamento in select value from jsonb_array_elements(v_item -> 'pagamentos')
        loop
          perform public.salvar_pagamento_acompanhamento_v1(null, v_id, v_pagamento);
        end loop;

        -- Remove somente movimentos gerados por importacao que desapareceram
        -- da nova versao da mesma linha. Pagamentos manuais, sem fingerprint,
        -- permanecem preservados.
        delete from public.acompanhamento_pagamentos ap
        where ap.registro_id = v_id
          and ap.fingerprint like 'pmg-%'
          and not exists (
            select 1
            from jsonb_array_elements(v_item -> 'pagamentos') pagamento_atual
            where pagamento_atual ->> 'fingerprint' = ap.fingerprint
          );
      end if;
    exception when others then
      v_ignoradas := v_ignoradas + 1;
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('linha', v_indice + 1, 'erro', sqlerrm));
    end;
  end loop;

  update public.acompanhamento_importacoes set
    linhas_criadas = v_criadas,
    linhas_atualizadas = v_atualizadas,
    linhas_ignoradas = v_ignoradas,
    erros = v_erros
  where id = v_importacao;

  return jsonb_build_object(
    'importacao_id', v_importacao,
    'criadas', v_criadas,
    'atualizadas', v_atualizadas,
    'ignoradas', v_ignoradas,
    'erros', v_erros
  );
end;
$function$;
