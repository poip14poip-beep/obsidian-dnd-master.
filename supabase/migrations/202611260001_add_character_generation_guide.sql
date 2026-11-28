alter table obsidian.gm_base_documents drop constraint if exists gm_base_documents_source_kind_check;
alter table obsidian.gm_base_documents add constraint gm_base_documents_source_kind_check
  check (source_kind = any (array[
    'OBSIDIAN_MASTER_PROMPT'::text,
    'SRD_5_2_1'::text,
    'EKDRASIL_WORLD_BIBLE'::text,
    'CHARACTER_GENERATION_GUIDE'::text
  ]));