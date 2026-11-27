-- Incremental migration for the live Obsidian schema.
-- The original schema migrations are still being recovered; this patch assumes
-- the existing obsidian tables and ownership constraints are already present.

CREATE OR REPLACE FUNCTION public.obsidian_api_import_campaign_state(
  p_actor uuid,
  p_campaign_id uuid,
  p_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_campaign obsidian.campaigns%ROWTYPE;
  v_campaign_input record;
  v_world_input record;
  v_character_input record;
  v_hash text;
  v_status text;
  v_last_turn bigint;
  v_source_count integer := 0;
  v_location_count integer := 0;
  v_faction_count integer := 0;
  v_npc_count integer := 0;
  v_knowledge_count integer := 0;
  v_fact_count integer := 0;
  v_event_count integer := 0;
  v_draft_count integer := 0;
  v_session_count integer := 0;
  v_audit_count integer := 0;
BEGIN
  IF p_actor IS NULL OR p_campaign_id IS NULL OR p_state IS NULL OR jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CAMPAIGN_IMPORT_INPUT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_state) AS item(key)
    WHERE item.key NOT IN (
      'campaign', 'sources', 'world_state', 'player_character_state', 'npcs',
      'npc_knowledge', 'factions', 'locations', 'timeline_events', 'canon_facts',
      'turn_drafts', 'session_log', 'audit_log'
    )
  ) THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_HAS_UNKNOWN_TOP_LEVEL_KEYS';
  END IF;

  IF jsonb_typeof(p_state->'campaign') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'world_state') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'player_character_state') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_state->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'npcs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'npc_knowledge') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'factions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'locations') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'timeline_events') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'canon_facts') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'turn_drafts') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'session_log') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'audit_log') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_COLLECTION_SHAPE_INVALID';
  END IF;

  SELECT * INTO v_campaign
  FROM obsidian.campaigns
  WHERE id = p_campaign_id AND owner_id = p_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND_OR_NOT_OWNED';
  END IF;

  v_hash := encode(extensions.digest(convert_to(p_state::text, 'UTF8'), 'sha256'), 'hex');
  IF v_campaign.settings->'relational_import'->>'sha256' = v_hash THEN
    RETURN jsonb_build_object(
      'ok', true,
      'campaign_id', p_campaign_id,
      'idempotent', true,
      'import_sha256', v_hash,
      'last_confirmed_turn', v_campaign.last_confirmed_turn
    );
  END IF;

  IF EXISTS (SELECT 1 FROM obsidian.sources WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.world_state WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.player_character_state WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.npcs WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.factions WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.locations WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.timeline_events WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.canon_facts WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.turn_drafts WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.session_log WHERE campaign_id = p_campaign_id)
    OR EXISTS (SELECT 1 FROM obsidian.audit_log WHERE campaign_id = p_campaign_id)
  THEN
    RAISE EXCEPTION 'CAMPAIGN_RELATIONAL_STATE_ALREADY_INITIALIZED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'sources') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'locations') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'factions') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'npcs') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'timeline_events') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'canon_facts') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'turn_drafts') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'session_log') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_state->'audit_log') AS item(value)
    WHERE nullif(item.value->>'campaign_id', '') IS NULL
       OR (item.value->>'campaign_id')::uuid <> p_campaign_id
  ) THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_ROW_CAMPAIGN_MISMATCH';
  END IF;

  IF nullif(p_state->'world_state'->>'campaign_id', '')::uuid IS DISTINCT FROM p_campaign_id
    OR nullif(p_state->'player_character_state'->>'campaign_id', '')::uuid IS DISTINCT FROM p_campaign_id
  THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_SINGLETON_CAMPAIGN_MISMATCH';
  END IF;

  IF coalesce((p_state->'world_state'->'state_value') ? 'player_character_state', false) THEN
    RAISE EXCEPTION 'PLAYER_CHARACTER_MUST_REMAIN_IN_SEPARATE_TABLE';
  END IF;

  SELECT * INTO v_campaign_input
  FROM jsonb_to_record(p_state->'campaign') AS x(
    title text,
    status text,
    campaign_date timestamptz,
    current_location_id uuid,
    last_confirmed_turn bigint,
    settings jsonb
  );

  SELECT * INTO v_world_input
  FROM jsonb_to_record(p_state->'world_state') AS x(
    campaign_id uuid,
    state_key text,
    state_value jsonb,
    status text,
    source_id uuid,
    justification text
  );

  SELECT * INTO v_character_input
  FROM jsonb_to_record(p_state->'player_character_state') AS x(
    id uuid,
    campaign_id uuid,
    character_name text,
    character_data jsonb,
    source_id uuid,
    verified_at timestamptz
  );

  IF nullif(btrim(v_campaign_input.title), '') IS NULL
    OR v_campaign_input.status IS NULL
    OR v_campaign_input.status NOT IN ('preparation', 'ready', 'active')
    OR v_world_input.state_key IS DISTINCT FROM 'world_state_snapshot'
    OR jsonb_typeof(v_world_input.state_value) IS DISTINCT FROM 'object'
    OR v_character_input.id IS NULL
    OR jsonb_typeof(v_character_input.character_data) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_REQUIRED_FIELDS_INVALID';
  END IF;

  INSERT INTO obsidian.sources (
    id, campaign_id, owner_id, title, source_type, version_label,
    sha256, source_uri, content_status, notes
  )
  SELECT x.id, p_campaign_id, p_actor, x.title, x.source_type, x.version_label,
         x.sha256, x.source_uri, x.content_status, x.notes
  FROM jsonb_to_recordset(p_state->'sources') AS x(
    id uuid, campaign_id uuid, title text, source_type text, version_label text,
    sha256 text, source_uri text, content_status text, notes text
  );
  GET DIAGNOSTICS v_source_count = ROW_COUNT;

  INSERT INTO obsidian.locations (
    id, campaign_id, owner_id, name, parent_location_id, geography, source_id
  )
  SELECT x.id, p_campaign_id, p_actor, x.name, x.parent_location_id,
         coalesce(x.geography, '{}'::jsonb), x.source_id
  FROM jsonb_to_recordset(p_state->'locations') AS x(
    id uuid, campaign_id uuid, name text, parent_location_id uuid,
    geography jsonb, source_id uuid
  );
  GET DIAGNOSTICS v_location_count = ROW_COUNT;

  INSERT INTO obsidian.factions (
    id, campaign_id, owner_id, name, faction_state, source_id
  )
  SELECT x.id, p_campaign_id, p_actor, x.name,
         coalesce(x.faction_state, '{}'::jsonb), x.source_id
  FROM jsonb_to_recordset(p_state->'factions') AS x(
    id uuid, campaign_id uuid, name text, faction_state jsonb, source_id uuid
  );
  GET DIAGNOSTICS v_faction_count = ROW_COUNT;

  INSERT INTO obsidian.world_state (
    campaign_id, owner_id, state_key, state_value, status, source_id, justification
  )
  VALUES (
    p_campaign_id, p_actor, v_world_input.state_key, v_world_input.state_value,
    v_world_input.status, v_world_input.source_id, v_world_input.justification
  );

  INSERT INTO obsidian.player_character_state (
    id, campaign_id, owner_id, character_name, character_data, source_id, verified_at
  )
  VALUES (
    v_character_input.id, p_campaign_id, p_actor, v_character_input.character_name,
    v_character_input.character_data, v_character_input.source_id, v_character_input.verified_at
  );

  INSERT INTO obsidian.npcs (
    id, campaign_id, owner_id, canonical_name, current_location_id, npc_state, source_id
  )
  SELECT x.id, p_campaign_id, p_actor, x.canonical_name, x.current_location_id,
         coalesce(x.npc_state, '{}'::jsonb), x.source_id
  FROM jsonb_to_recordset(p_state->'npcs') AS x(
    id uuid, campaign_id uuid, canonical_name text, current_location_id uuid,
    npc_state jsonb, source_id uuid
  );
  GET DIAGNOSTICS v_npc_count = ROW_COUNT;

  INSERT INTO obsidian.npc_knowledge (
    id, npc_id, owner_id, knowledge, status, source_id, acquisition_reason, acquired_at
  )
  SELECT x.id, x.npc_id, p_actor, x.knowledge, x.status, x.source_id,
         x.acquisition_reason, x.acquired_at
  FROM jsonb_to_recordset(p_state->'npc_knowledge') AS x(
    id uuid, npc_id uuid, knowledge text, status text, source_id uuid,
    acquisition_reason text, acquired_at timestamptz
  );
  GET DIAGNOSTICS v_knowledge_count = ROW_COUNT;

  INSERT INTO obsidian.timeline_events (
    id, campaign_id, owner_id, event_time, time_precision, description, status, source_id
  )
  SELECT x.id, p_campaign_id, p_actor, x.event_time, x.time_precision,
         x.description, x.status, x.source_id
  FROM jsonb_to_recordset(p_state->'timeline_events') AS x(
    id uuid, campaign_id uuid, event_time timestamptz, time_precision text,
    description text, status text, source_id uuid
  );
  GET DIAGNOSTICS v_event_count = ROW_COUNT;

  INSERT INTO obsidian.canon_facts (
    id, campaign_id, owner_id, fact_class, status, statement, source_id,
    justification, valid_from, valid_until
  )
  SELECT x.id, p_campaign_id, p_actor, x.fact_class, x.status, x.statement,
         x.source_id, x.justification, x.valid_from, x.valid_until
  FROM jsonb_to_recordset(p_state->'canon_facts') AS x(
    id uuid, campaign_id uuid, fact_class text, status text, statement text,
    source_id uuid, justification text, valid_from timestamptz, valid_until timestamptz
  );
  GET DIAGNOSTICS v_fact_count = ROW_COUNT;

  INSERT INTO obsidian.turn_drafts (
    id, campaign_id, owner_id, proposed_turn, player_action, gm_resolution,
    pending_changes, status
  )
  SELECT x.id, p_campaign_id, p_actor, x.proposed_turn, x.player_action,
         x.gm_resolution, coalesce(x.pending_changes, '{}'::jsonb), x.status
  FROM jsonb_to_recordset(p_state->'turn_drafts') AS x(
    id uuid, campaign_id uuid, proposed_turn bigint, player_action text,
    gm_resolution text, pending_changes jsonb, status text
  );
  GET DIAGNOSTICS v_draft_count = ROW_COUNT;

  INSERT INTO obsidian.session_log (
    id, campaign_id, owner_id, turn_number, occurred_at, player_action,
    gm_resolution, state_delta, source_draft_id, payload_sha256
  )
  SELECT x.id, p_campaign_id, p_actor, x.turn_number, x.occurred_at,
         x.player_action, x.gm_resolution, coalesce(x.state_delta, '{}'::jsonb),
         x.source_draft_id, x.payload_sha256
  FROM jsonb_to_recordset(p_state->'session_log') AS x(
    id uuid, campaign_id uuid, turn_number bigint, occurred_at timestamptz,
    player_action text, gm_resolution text, state_delta jsonb,
    source_draft_id uuid, payload_sha256 text
  );
  GET DIAGNOSTICS v_session_count = ROW_COUNT;

  INSERT INTO obsidian.audit_log (
    id, campaign_id, owner_id, action, entity_type, entity_id, details, created_at
  )
  SELECT x.id, p_campaign_id, p_actor, x.action, x.entity_type, x.entity_id,
         coalesce(x.details, '{}'::jsonb), x.created_at
  FROM jsonb_to_recordset(p_state->'audit_log') AS x(
    id uuid, campaign_id uuid, action text, entity_type text,
    entity_id uuid, details jsonb, created_at timestamptz
  );
  GET DIAGNOSTICS v_audit_count = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM obsidian.player_character_state pc
    LEFT JOIN obsidian.sources s
      ON s.id = pc.source_id AND s.campaign_id = pc.campaign_id AND s.owner_id = pc.owner_id
    WHERE pc.campaign_id = p_campaign_id AND pc.owner_id = p_actor
      AND pc.source_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.factions f
    LEFT JOIN obsidian.sources s
      ON s.id = f.source_id AND s.campaign_id = f.campaign_id AND s.owner_id = f.owner_id
    WHERE f.campaign_id = p_campaign_id AND f.owner_id = p_actor
      AND f.source_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.locations l
    LEFT JOIN obsidian.sources s
      ON s.id = l.source_id AND s.campaign_id = l.campaign_id AND s.owner_id = l.owner_id
    WHERE l.campaign_id = p_campaign_id AND l.owner_id = p_actor
      AND l.source_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.locations l
    LEFT JOIN obsidian.locations parent
      ON parent.id = l.parent_location_id AND parent.campaign_id = l.campaign_id AND parent.owner_id = l.owner_id
    WHERE l.campaign_id = p_campaign_id AND l.owner_id = p_actor
      AND l.parent_location_id IS NOT NULL AND parent.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.npcs n
    LEFT JOIN obsidian.sources s
      ON s.id = n.source_id AND s.campaign_id = n.campaign_id AND s.owner_id = n.owner_id
    LEFT JOIN obsidian.locations l
      ON l.id = n.current_location_id AND l.campaign_id = n.campaign_id AND l.owner_id = n.owner_id
    WHERE n.campaign_id = p_campaign_id AND n.owner_id = p_actor
      AND ((n.source_id IS NOT NULL AND s.id IS NULL)
        OR (n.current_location_id IS NOT NULL AND l.id IS NULL))
  ) OR EXISTS (
    SELECT 1 FROM obsidian.npc_knowledge k
    LEFT JOIN obsidian.npcs n
      ON n.id = k.npc_id AND n.campaign_id = p_campaign_id AND n.owner_id = k.owner_id
    LEFT JOIN obsidian.sources s
      ON s.id = k.source_id AND s.campaign_id = p_campaign_id AND s.owner_id = k.owner_id
    WHERE k.owner_id = p_actor
      AND ((n.id IS NULL) OR (k.source_id IS NOT NULL AND s.id IS NULL))
  ) OR EXISTS (
    SELECT 1 FROM obsidian.canon_facts f
    LEFT JOIN obsidian.sources s
      ON s.id = f.source_id AND s.campaign_id = f.campaign_id AND s.owner_id = f.owner_id
    WHERE f.campaign_id = p_campaign_id AND f.owner_id = p_actor
      AND f.source_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.timeline_events e
    LEFT JOIN obsidian.sources s
      ON s.id = e.source_id AND s.campaign_id = e.campaign_id AND s.owner_id = e.owner_id
    WHERE e.campaign_id = p_campaign_id AND e.owner_id = p_actor
      AND e.source_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM obsidian.session_log sl
    LEFT JOIN obsidian.turn_drafts d
      ON d.id = sl.source_draft_id AND d.campaign_id = sl.campaign_id AND d.owner_id = sl.owner_id
    WHERE sl.campaign_id = p_campaign_id AND sl.owner_id = p_actor
      AND sl.source_draft_id IS NOT NULL AND d.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_CROSS_CAMPAIGN_REFERENCE';
  END IF;

  SELECT coalesce(max(turn_number), 0) INTO v_last_turn
  FROM obsidian.session_log
  WHERE campaign_id = p_campaign_id AND owner_id = p_actor;

  IF v_last_turn IS DISTINCT FROM coalesce(v_campaign_input.last_confirmed_turn, 0)
    OR (SELECT count(*) FROM obsidian.session_log WHERE campaign_id = p_campaign_id AND owner_id = p_actor) <> v_last_turn
  THEN
    RAISE EXCEPTION 'CAMPAIGN_IMPORT_SESSION_LOG_SEQUENCE_INVALID';
  END IF;

  v_status := v_campaign_input.status;
  IF v_status = 'active' THEN
    IF v_character_input.verified_at IS NULL
      OR v_campaign_input.current_location_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM obsidian.sources
        WHERE campaign_id = p_campaign_id AND owner_id = p_actor
          AND source_type = 'master_rules' AND content_status = 'verified'
      )
      OR NOT EXISTS (
        SELECT 1 FROM obsidian.sources
        WHERE campaign_id = p_campaign_id AND owner_id = p_actor
          AND source_type = 'world_canon' AND content_status = 'verified'
      )
      OR NOT EXISTS (
        SELECT 1 FROM obsidian.sources
        WHERE campaign_id = p_campaign_id AND owner_id = p_actor
          AND source_type = 'player_character' AND content_status = 'verified'
      )
    THEN
      RAISE EXCEPTION 'CAMPAIGN_IMPORT_NOT_READY_FOR_ACTIVE_STATUS';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM obsidian.locations
      WHERE id = v_campaign_input.current_location_id
        AND campaign_id = p_campaign_id AND owner_id = p_actor
    ) THEN
      RAISE EXCEPTION 'CAMPAIGN_IMPORT_CURRENT_LOCATION_NOT_FOUND';
    END IF;
  END IF;

  UPDATE obsidian.campaigns
  SET title = v_campaign_input.title,
      status = v_status,
      campaign_date = coalesce(v_campaign_input.campaign_date, campaign_date, now()),
      current_location_id = v_campaign_input.current_location_id,
      last_confirmed_turn = v_last_turn,
      settings = coalesce(settings, '{}'::jsonb) || coalesce(v_campaign_input.settings, '{}'::jsonb) ||
        jsonb_build_object('relational_import', jsonb_build_object(
          'sha256', v_hash,
          'imported_at', now(),
          'schema_version', 1
        )),
      updated_at = now()
  WHERE id = p_campaign_id AND owner_id = p_actor;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'idempotent', false,
    'import_sha256', v_hash,
    'status', v_status,
    'last_confirmed_turn', v_last_turn,
    'counts', jsonb_build_object(
      'sources', v_source_count,
      'locations', v_location_count,
      'factions', v_faction_count,
      'npcs', v_npc_count,
      'npc_knowledge', v_knowledge_count,
      'canon_facts', v_fact_count,
      'timeline_events', v_event_count,
      'turn_drafts', v_draft_count,
      'session_log', v_session_count,
      'audit_log', v_audit_count
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.obsidian_api_import_campaign_state(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obsidian_api_import_campaign_state(uuid, uuid, jsonb) TO service_role;
