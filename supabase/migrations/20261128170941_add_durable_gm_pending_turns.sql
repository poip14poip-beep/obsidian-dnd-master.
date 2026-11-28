-- Durable server-side pause between preparing a player roll and resolving the same action.
-- Applied to the production Supabase project as migration 20261128170941.
CREATE TABLE IF NOT EXISTS public.gm_pending_turns (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_id uuid NOT NULL UNIQUE,
  player_action text NOT NULL CHECK (length(player_action) BETWEEN 1 AND 12000),
  turn_payload jsonb NOT NULL CHECK (jsonb_typeof(turn_payload) = 'object'),
  prepared_roll jsonb NOT NULL CHECK (jsonb_typeof(prepared_roll) = 'object'),
  challenge jsonb,
  completed_rolls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_rolls) = 'array'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gm_pending_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gm_pending_turns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gm_pending_turns TO service_role;

CREATE OR REPLACE FUNCTION public.obsidian_get_gm_pending_turn(p_owner_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT to_jsonb(p)
  FROM public.gm_pending_turns AS p
  WHERE p.owner_id = p_owner_id AND p.expires_at > now()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.obsidian_save_gm_pending_turn(
  p_owner_id uuid,
  p_pending_id uuid,
  p_player_action text,
  p_turn_payload jsonb,
  p_prepared_roll jsonb,
  p_challenge jsonb,
  p_completed_rolls jsonb,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF p_owner_id IS NULL OR p_pending_id IS NULL
     OR p_player_action IS NULL OR length(p_player_action) NOT BETWEEN 1 AND 12000
     OR p_turn_payload IS NULL OR jsonb_typeof(p_turn_payload) <> 'object'
     OR p_prepared_roll IS NULL OR jsonb_typeof(p_prepared_roll) <> 'object'
     OR p_challenge IS NULL OR jsonb_typeof(p_challenge) <> 'object'
     OR p_challenge->>'userId' <> p_owner_id::text
     OR p_challenge->>'roller' <> 'PLAYER'
     OR length(coalesce(p_challenge->>'nonce', '')) NOT BETWEEN 1 AND 80
     OR p_expires_at IS NULL OR p_expires_at <= now()
     OR p_expires_at > now() + interval '24 hours' THEN
    RETURN false;
  END IF;
  IF p_completed_rolls IS NULL OR jsonb_typeof(p_completed_rolls) <> 'array'
     OR jsonb_array_length(p_completed_rolls) > 5 THEN
    RETURN false;
  END IF;

  INSERT INTO public.gm_pending_turns (
    owner_id, pending_id, player_action, turn_payload, prepared_roll,
    challenge, completed_rolls, expires_at, updated_at
  )
  VALUES (
    p_owner_id, p_pending_id, p_player_action, p_turn_payload, p_prepared_roll,
    p_challenge, p_completed_rolls, p_expires_at, now()
  )
  ON CONFLICT (owner_id) DO UPDATE SET
    pending_id = EXCLUDED.pending_id,
    player_action = EXCLUDED.player_action,
    turn_payload = EXCLUDED.turn_payload,
    prepared_roll = EXCLUDED.prepared_roll,
    challenge = EXCLUDED.challenge,
    completed_rolls = EXCLUDED.completed_rolls,
    expires_at = EXCLUDED.expires_at,
    updated_at = now()
  WHERE public.gm_pending_turns.expires_at <= now()
     OR public.gm_pending_turns.player_action = EXCLUDED.player_action;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obsidian_record_gm_pending_roll(
  p_owner_id uuid,
  p_pending_id uuid,
  p_nonce text,
  p_completed_roll jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF p_owner_id IS NULL OR p_pending_id IS NULL
     OR p_nonce IS NULL OR length(p_nonce) NOT BETWEEN 1 AND 80
     OR p_completed_roll IS NULL OR jsonb_typeof(p_completed_roll) <> 'object' THEN
    RETURN false;
  END IF;

  UPDATE public.gm_pending_turns
  SET completed_rolls = completed_rolls || jsonb_build_array(p_completed_roll),
      challenge = NULL,
      updated_at = now()
  WHERE owner_id = p_owner_id
    AND pending_id = p_pending_id
    AND challenge->>'nonce' = p_nonce
    AND expires_at > now()
    AND jsonb_array_length(completed_rolls) < 5;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obsidian_clear_gm_pending_turn(
  p_owner_id uuid,
  p_pending_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.gm_pending_turns
  WHERE owner_id = p_owner_id
    AND (p_pending_id IS NULL OR pending_id = p_pending_id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.obsidian_get_gm_pending_turn(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obsidian_save_gm_pending_turn(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obsidian_record_gm_pending_roll(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obsidian_clear_gm_pending_turn(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obsidian_get_gm_pending_turn(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.obsidian_save_gm_pending_turn(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.obsidian_record_gm_pending_roll(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.obsidian_clear_gm_pending_turn(uuid, uuid) TO service_role;
