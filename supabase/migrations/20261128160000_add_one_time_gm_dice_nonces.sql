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

CREATE OR REPLACE FUNCTION public.obsidian_consume_gm_dice_nonce(
  p_user_id uuid,
  p_nonce text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer;
BEGIN
  IF p_user_id IS NULL OR p_nonce IS NULL OR length(p_nonce) NOT BETWEEN 1 AND 80
     OR p_expires_at IS NULL OR p_expires_at <= now()
     OR p_expires_at > now() + interval '3 minutes' THEN
    RETURN false;
  END IF;

  DELETE FROM public.gm_dice_nonce_consumptions
  WHERE expires_at < now() - interval '5 minutes';

  INSERT INTO public.gm_dice_nonce_consumptions (user_id, nonce, expires_at)
  VALUES (p_user_id, p_nonce, p_expires_at)
  ON CONFLICT (user_id, nonce) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.obsidian_consume_gm_dice_nonce(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obsidian_consume_gm_dice_nonce(uuid, text, timestamptz) TO service_role;
