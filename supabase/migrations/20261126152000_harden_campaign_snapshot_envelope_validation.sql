-- Tighten envelope validation for append-only campaign snapshots.
create or replace function public.obsidian_api_save_campaign_snapshot(
  p_actor uuid, p_campaign_id uuid, p_parent_revision bigint, p_turn_number bigint, p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_latest_revision bigint := 0;
  v_latest_hash text;
  v_hash text;
  v_row obsidian.campaign_snapshots%rowtype;
  v_collections jsonb;
  v_required_checksums text[] := array[
    'sources','canon_facts','world_state','player_character_state','npcs',
    'factions','locations','timeline_events','turn_drafts','session_log','audit_log'
  ];
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_actor is null or p_campaign_id is null or p_parent_revision is null or p_parent_revision < 0
     or p_turn_number is null or p_turn_number < 0 or p_payload is null or jsonb_typeof(p_payload) <> 'object'
  then raise exception 'INVALID_CAMPAIGN_SNAPSHOT_INPUT'; end if;
  if pg_column_size(p_payload) > 8000000 then raise exception 'CAMPAIGN_SNAPSHOT_TOO_LARGE'; end if;
  if p_payload->>'app' is distinct from 'Obsidian Control'
     or p_payload->>'backupVersion' is distinct from '2'
  then raise exception 'UNSUPPORTED_BACKUP_ENVELOPE'; end if;

  v_collections := p_payload->'collections';
  if v_collections is null or jsonb_typeof(v_collections) <> 'object'
     or jsonb_typeof(v_collections->'sources') <> 'array'
     or jsonb_typeof(v_collections->'canon_facts') <> 'array'
     or jsonb_typeof(v_collections->'world_state') <> 'object'
     or jsonb_typeof(v_collections->'player_character_state') <> 'object'
     or jsonb_typeof(v_collections->'npcs') <> 'array'
     or jsonb_typeof(v_collections->'factions') <> 'array'
     or jsonb_typeof(v_collections->'locations') <> 'array'
     or jsonb_typeof(v_collections->'timeline_events') <> 'array'
     or jsonb_typeof(v_collections->'turn_drafts') <> 'array'
     or jsonb_typeof(v_collections->'session_log') <> 'object'
     or jsonb_typeof(v_collections->'audit_log') <> 'object'
  then raise exception 'INCOMPLETE_CAMPAIGN_SNAPSHOT_COLLECTIONS'; end if;
  if v_collections->'world_state' ? 'player_character_state'
  then raise exception 'PLAYER_CHARACTER_STATE_MUST_REMAIN_SEPARATE'; end if;
  if coalesce((v_collections->'session_log'->>'lastTurnNumber')::bigint, -1) <> p_turn_number
     or jsonb_typeof(v_collections->'session_log'->'entries') <> 'array'
  then raise exception 'SNAPSHOT_TURN_NUMBER_MISMATCH'; end if;
  if jsonb_typeof(p_payload->'checksums') <> 'object'
     or not (p_payload->'checksums' ?& v_required_checksums)
     or jsonb_object_length(p_payload->'checksums') <> cardinality(v_required_checksums)
  then raise exception 'SNAPSHOT_CHECKSUMS_REQUIRED'; end if;

  if not exists (select 1 from obsidian.campaigns c where c.id=p_campaign_id and c.owner_id=p_actor)
  then raise exception 'CAMPAIGN_NOT_FOUND_OR_NOT_OWNED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));
  select s.revision, s.payload_sha256 into v_latest_revision, v_latest_hash
  from obsidian.campaign_snapshots s
  where s.campaign_id=p_campaign_id and s.owner_id=p_actor
  order by s.revision desc limit 1;
  v_latest_revision := coalesce(v_latest_revision, 0);
  v_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');

  if v_latest_revision > 0 and v_latest_hash = v_hash then
    select * into v_row from obsidian.campaign_snapshots
    where campaign_id=p_campaign_id and owner_id=p_actor and revision=v_latest_revision;
    return jsonb_build_object('success',true,'verified',true,'idempotent',true,
      'snapshot_id',v_row.id,'revision',v_row.revision,'parent_revision',v_row.parent_revision,
      'turn_number',v_row.turn_number,'payload_sha256',v_row.payload_sha256,'created_at',v_row.created_at);
  end if;
  if p_parent_revision <> v_latest_revision then
    raise exception 'SNAPSHOT_REVISION_CONFLICT: expected parent %, current revision %',p_parent_revision,v_latest_revision;
  end if;

  insert into obsidian.campaign_snapshots(campaign_id,owner_id,revision,parent_revision,turn_number,payload,payload_sha256)
  values(p_campaign_id,p_actor,v_latest_revision+1,p_parent_revision,p_turn_number,p_payload,v_hash)
  returning * into v_row;
  insert into obsidian.audit_log(campaign_id,owner_id,action,entity_type,entity_id,details)
  values(p_campaign_id,p_actor,'campaign_snapshot_saved','campaign_snapshot',v_row.id,
    jsonb_build_object('revision',v_row.revision,'parent_revision',v_row.parent_revision,
      'turn_number',v_row.turn_number,'payload_sha256',v_hash));

  select * into v_row from obsidian.campaign_snapshots
  where id=v_row.id and campaign_id=p_campaign_id and owner_id=p_actor;
  if not found or v_row.payload_sha256<>v_hash or v_row.payload<>p_payload or v_row.revision<>v_latest_revision+1
  then raise exception 'CAMPAIGN_SNAPSHOT_READ_BACK_MISMATCH'; end if;

  return jsonb_build_object('success',true,'verified',true,'idempotent',false,
    'snapshot_id',v_row.id,'revision',v_row.revision,'parent_revision',v_row.parent_revision,
    'turn_number',v_row.turn_number,'payload_sha256',v_row.payload_sha256,'created_at',v_row.created_at);
end;
$function$;

revoke all on function public.obsidian_api_save_campaign_snapshot(uuid,uuid,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.obsidian_api_save_campaign_snapshot(uuid,uuid,bigint,bigint,jsonb) to service_role;
