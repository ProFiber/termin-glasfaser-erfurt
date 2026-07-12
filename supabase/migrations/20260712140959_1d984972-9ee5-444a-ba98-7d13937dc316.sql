
CREATE OR REPLACE FUNCTION public.bulk_fill_contact_info(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt int := 0;
BEGIN
  WITH data AS (
    SELECT (r->>'bid')::text AS bid,
           coalesce(r->>'name','') AS name,
           coalesce(r->>'mobil','') AS mobil,
           coalesce(r->>'festnetz','') AS festnetz
    FROM jsonb_array_elements(payload) r
  ), upd AS (
    UPDATE contacts c SET
      name = CASE WHEN coalesce(c.name,'')='' AND d.name<>'' THEN d.name ELSE c.name END,
      mobil = CASE WHEN coalesce(c.mobil,'')='' AND d.mobil<>'' THEN d.mobil ELSE c.mobil END,
      festnetz = CASE WHEN coalesce(c.festnetz,'')='' AND d.festnetz<>'' THEN d.festnetz ELSE c.festnetz END
    FROM data d WHERE c.bid = d.bid
      AND ((coalesce(c.name,'')='' AND d.name<>'')
        OR (coalesce(c.mobil,'')='' AND d.mobil<>'')
        OR (coalesce(c.festnetz,'')='' AND d.festnetz<>''))
    RETURNING 1
  )
  SELECT count(*) INTO cnt FROM upd;
  RETURN cnt;
END $$;
