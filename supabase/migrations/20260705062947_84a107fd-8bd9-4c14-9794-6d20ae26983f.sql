
ALTER TABLE public.call_states
  ADD COLUMN IF NOT EXISTS pruefung_status text NOT NULL DEFAULT 'offen',
  ADD COLUMN IF NOT EXISTS pruefung_nachforderung text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pruefung_notiz text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS eingereicht_am date;

CREATE OR REPLACE FUNCTION public.mark_eingereicht(bids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int := 0;
BEGIN
  UPDATE call_states
     SET pruefung_status = 'eingereicht',
         eingereicht_am = coalesce(eingereicht_am, current_date),
         updated_at = now()
   WHERE bid = ANY(bids)
     AND pruefung_status IN ('offen', 'eingereicht')
     AND avis_am IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_eingereicht(text[]) TO anon, authenticated, service_role;
