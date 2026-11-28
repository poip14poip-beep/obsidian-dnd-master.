create or replace function public.obsidian_api_upsert_gm_base(
  p_source_kind text, p_title text, p_content text, p_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path to 'obsidian', 'public'
as $function$
declare v_version integer;
begin
  if p_source_kind not in ('OBSIDIAN_MASTER_PROMPT','SRD_5_2_1','EKDRASIL_WORLD_BIBLE','CHARACTER_GENERATION_GUIDE')
     or p_title is null or length(trim(p_title)) = 0
     or p_content is null or length(trim(p_content)) = 0
     or length(p_content) > 2500000 then
    raise exception 'invalid base document';
  end if;
  insert into obsidian.gm_base_documents(source_kind,title,content,sha256)
  values(p_source_kind,trim(p_title),p_content,p_sha256)
  on conflict(source_kind) do update set
    title=excluded.title, content=excluded.content, sha256=excluded.sha256,
    version=obsidian.gm_base_documents.version+1, updated_at=now()
  returning version into v_version;
  return jsonb_build_object('source_kind',p_source_kind,'version',v_version);
end;
$function$;
