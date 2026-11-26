-- Durable, append-only cloud checkpoints for the complete local campaign envelope.
-- The private schema is never exposed to anon/authenticated clients; all access goes
-- through the authenticated obsidian-api Edge Function using the service role.

create table if not exists obsidian.campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references obsidian.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  parent_revision bigint,
  turn_number bigint not null check (turn_number >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint campaign_snapshots_campaign_revision_unique unique (campaign_id, revision)
);

create index if not exists campaign_snapshots_owner_campaign_revision_idx
  on obsidian.campaign_snapshots(owner_id, campaign_id, revision desc);

alter table obsidian.campaign_snapshots enable row level security;
revoke all on table obsidian.campaign_snapshots from public, anon, authenticated;

drop trigger if exists campaign_snapshots_append_only on obsidian.campaign_snapshots;
create trigger campaign_snapshots_append_only
  before update or delete on obsidian.campaign_snapshots
  for each row execute function obsidian.reject_append_only_mutation();

create or replace function public.obsidian_api_save_campaign_snapshot(
  p_actor uuid,
  p_campaign_id uuid,
  p_parent_revision bigint,
  p_turn_number bigint,
  p_payload jsonb
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor is null or p_campaign_id is null or p_parent_revision is null
     or p_parent_revision < 0 or p_turn_number is null or p_turn_number < 0
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_CAMPAIGN_SNAPSHOT_INPUT';
  end if;
  if pg_column_size(p_payload) > 8000000 then
    raise exception 'CAMPAIGN_SNAPSHOT_TOO_LARGE';
  end if;
  if p_payload->>'app' <> 'Obsidian Control'
     or (p_payload->>'backupVersion')::integer <> 2 then
    raise exception 'UNSUPPORTED_BACKUP_ENVELOPE';
  end if;

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
     or jsonb_typeof(v_collections->'audit_log') <> 'object' then
    raise exception 'INCOMPLETE_CAMPAIGN_SNAPSHOT_COLLECTIONS';
  end if;
  if v_collections->'world_state' ? 'player_character_state' then
    raise exception 'PLAYER_CHARACTER_STATE_MUST_REMAIN_SEPARATE';
  end if;
  if coalesce((v_collections->'session_log'->>'lastTurnNumber')::bigint, -1) <> p_turn_number
     or jsonb_typeof(v_collections->'session_log'->'entries') <> 'array' then
    raise exception 'SNAPSHOT_TURN_NUMBER_MISMATCH';
  end if;
  if jsonb_typeof(p_payload->'checksums') <> 'object' then
    raise exception 'SNAPSHOT_CHECKSUMS_REQUIRED';
  end if;

  if not exists (
    select 1 from obsidian.campaigns c
    where c.id = p_campaign_id and c.owner_id = p_actor
  ) then
    raise exception 'CAMPAIGN_NOT_FOUND_OR_NOT_OWNED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));

  select s.revision, s.payload_sha256
    into v_latest_revision, v_latest_hash
  from obsidian.campaign_snapshots s
  where s.campaign_id = p_campaign_id and s.owner_id = p_actor
  order by s.revision desc
  limit 1;
  v_latest_revision := coalesce(v_latest_revision, 0);
  v_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');

  -- Network retries are idempotent: an identical latest payload returns the
  -- existing checkpoint instead of creating duplicate revisions.
  if v_latest_revision > 0 and v_latest_hash = v_hash then
    select * into v_row from obsidian.campaign_snapshots
    where campaign_id = p_campaign_id and owner_id = p_actor
      and revision = v_latest_revision;
    return jsonb_build_object(
      'success', true, 'verified', true, 'idempotent', true,
      'snapshot_id', v_row.id, 'revision', v_row.revision,
      'parent_revision', v_row.parent_revision, 'turn_number', v_row.turn_number,
      'payload_sha256', v_row.payload_sha256, 'created_at', v_row.created_at
    );
  end if;

  if p_parent_revision <> v_latest_revision then
    raise exception 'SNAPSHOT_REVISION_CONFLICT: expected parent %, current revision %',
      p_parent_revision, v_latest_revision;
  end if;

  insert into obsidian.campaign_snapshots(
    campaign_id, owner_id, revision, parent_revision, turn_number, payload, payload_sha256
  ) values (
    p_campaign_id, p_actor, v_latest_revision + 1, p_parent_revision,
    p_turn_number, p_payload, v_hash
  ) returning * into v_row;

  insert into obsidian.audit_log(
    campaign_id, owner_id, action, entity_type, entity_id, details
  ) values (
    p_campaign_id, p_actor, 'campaign_snapshot_saved', 'campaign_snapshot', v_row.id,
    jsonb_build_object(
      'revision', v_row.revision,
      'parent_revision', v_row.parent_revision,
      'turn_number', v_row.turn_number,
      'payload_sha256', v_hash
    )
  );

  select * into v_row from obsidian.campaign_snapshots
  where id = v_row.id and campaign_id = p_campaign_id and owner_id = p_actor;
  if not found or v_row.payload_sha256 <> v_hash
     or v_row.payload <> p_payload or v_row.revision <> v_latest_revision + 1 then
    raise exception 'CAMPAIGN_SNAPSHOT_READ_BACK_MISMATCH';
  end if;

  return jsonb_build_object(
    'success', true, 'verified', true, 'idempotent', false,
    'snapshot_id', v_row.id, 'revision', v_row.revision,
    'parent_revision', v_row.parent_revision, 'turn_number', v_row.turn_number,
    'payload_sha256', v_row.payload_sha256, 'created_at', v_row.created_at
  );
end;
$function$;

create or replace function public.obsidian_api_get_latest_campaign_snapshot(
  p_actor uuid,
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row obsidian.campaign_snapshots%rowtype;
  v_hash text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor is null or p_campaign_id is null then
    raise exception 'ACTOR_AND_CAMPAIGN_REQUIRED';
  end if;
  if not exists (
    select 1 from obsidian.campaigns c
    where c.id = p_campaign_id and c.owner_id = p_actor
  ) then
    raise exception 'CAMPAIGN_NOT_FOUND_OR_NOT_OWNED';
  end if;
  select * into v_row
  from obsidian.campaign_snapshots s
  where s.campaign_id = p_campaign_id and s.owner_id = p_actor
  order by s.revision desc
  limit 1;
  if not found then
    return jsonb_build_object('found', false, 'revision', 0);
  end if;
  v_hash := encode(extensions.digest(convert_to(v_row.payload::text, 'UTF8'), 'sha256'), 'hex');
  if v_hash <> v_row.payload_sha256 then
    raise exception 'CAMPAIGN_SNAPSHOT_CHECKSUM_MISMATCH';
  end if;
  return jsonb_build_object(
    'found', true,
    'snapshot_id', v_row.id,
    'revision', v_row.revision,
    'parent_revision', v_row.parent_revision,
    'turn_number', v_row.turn_number,
    'payload_sha256', v_row.payload_sha256,
    'created_at', v_row.created_at,
    'payload', v_row.payload
  );
end;
$function$;

revoke all on function public.obsidian_api_save_campaign_snapshot(uuid, uuid, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.obsidian_api_get_latest_campaign_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.obsidian_api_save_campaign_snapshot(uuid, uuid, bigint, bigint, jsonb) to service_role;
grant execute on function public.obsidian_api_get_latest_campaign_snapshot(uuid, uuid) to service_role;
