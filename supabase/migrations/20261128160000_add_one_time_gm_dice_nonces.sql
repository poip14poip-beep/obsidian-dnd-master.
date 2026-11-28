-- One-time consumption of signed game-master dice proofs.
-- The Edge Function calls this RPC with the service-role credential only.
CREATE TABLE IF NOT EXISTS public.gm_dice_nonce_consumptions (
  user_id uuid NOT NULL,
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 1 AND 80),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nonce)
);

ALTER TABLE public.gm_dice_nonce_consumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gm_dice_nonce_consumptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gm_dice_nonce_consumptions TO service_role;

-- Leave any legacy helper untouched; the new plural RPC is used by the current engine.
CREATE OR REPLACE FUNCTION public.obsidian_consume_gm_dice_nonces(
  p_user_id uuid,
  p_nonces text[],
  p_expires_at timestamptz[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expected integer;
  v_inserted integer;
BEGIN
  v_expected := cardinality(p_nonces);
  IF p_user_id IS NULL OR p_nonces IS NULL OR p_expires_at IS NULL
     OR v_expected < 1 OR v_expected > 5
     OR cardinality(p_expires_at) <> v_expected
     OR EXISTS (SELECT 1 FROM unnest(p_nonces) AS vals(nonce) WHERE nonce IS NULL OR length(nonce) NOT BETWEEN 1 AND 80)
     OR (SELECT count(DISTINCT nonce) FROM unnest(p_nonces) AS vals(nonce)) <> v_expected
     OR EXISTS (SELECT 1 FROM unnest(p_expires_at) AS vals(expires_at) WHERE expires_at IS NULL OR expires_at <= now() OR expires_at > now() + interval '3 minutes') THEN
    RETURN false;
  END IF;

  DELETE FROM public.gm_dice_nonce_consumptions
  WHERE expires_at < now() - interval '5 minutes';

  INSERT INTO public.gm_dice_nonce_consumptions (user_id, nonce, expires_at)
  SELECT p_user_id, item.nonce, item.expires_at
  FROM unnest(p_nonces, p_expires_at) AS item(nonce, expires_at)
  ON CONFLICT (user_id, nonce) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_expected THEN
    RAISE EXCEPTION 'DICE_NONCE_REPLAY';
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.obsidian_consume_gm_dice_nonces(uuid, text[], timestamptz[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obsidian_consume_gm_dice_nonces(uuid, text[], timestamptz[]) TO service_role;
