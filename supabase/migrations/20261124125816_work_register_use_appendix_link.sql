-- Point both new and already-open use-change cases to the official annex viewer.
create function pg_temp.work_register_annex_link(b jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce((
    select jsonb_set(b,array['workflow','links',(ordinality-1)::text,'url'],
      to_jsonb('https://www.law.go.kr/LSW/lsBylInfoPLinkR.do?lsNm=건축법시행령&bylNo=0001&bylBrNo=00&bylCls=BE'::text))
    from jsonb_array_elements(b->'workflow'->'links') with ordinality as link(item,ordinality)
    where item->>'url'='https://www.law.go.kr/법령/건축법시행령/별표1' limit 1
  ),b)
$$;

update lv_register.templates set body=pg_temp.work_register_annex_link(body),version=version+1
where id='office2' and owner_id is null and body is distinct from pg_temp.work_register_annex_link(body);

update lv_register.cases set blueprint=pg_temp.work_register_annex_link(blueprint), revision=revision+1
where template_id='office2' and blueprint is distinct from pg_temp.work_register_annex_link(blueprint);
