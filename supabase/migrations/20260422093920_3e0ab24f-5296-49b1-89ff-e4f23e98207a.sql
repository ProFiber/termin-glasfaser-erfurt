
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS auskundung_von timestamptz,
  ADD COLUMN IF NOT EXISTS auskundung_bis timestamptz;

CREATE OR REPLACE FUNCTION public.bulk_import_contacts(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO public.contacts (bid,strasse,hnr,hnr_zusatz,plz,ort,name,email,mobil,festnetz,typ,we,ge,zustimmung,lat,lng,auskundung_von,auskundung_bis)
  SELECT
    (rec->>'bid')::text,
    coalesce(rec->>'strasse',''),
    coalesce(rec->>'hnr',''),
    coalesce(rec->>'hnr_zusatz',''),
    coalesce(rec->>'plz',''),
    coalesce(rec->>'ort',''),
    coalesce(rec->>'name',''),
    coalesce(rec->>'email',''),
    coalesce(rec->>'mobil',''),
    coalesce(rec->>'festnetz',''),
    coalesce(rec->>'typ',''),
    coalesce((rec->>'we')::int, 0),
    coalesce((rec->>'ge')::int, 0),
    coalesce(rec->>'zustimmung',''),
    nullif(rec->>'lat','')::double precision,
    nullif(rec->>'lng','')::double precision,
    nullif(rec->>'auskundung_von','')::timestamptz,
    nullif(rec->>'auskundung_bis','')::timestamptz
  FROM jsonb_array_elements(payload) rec
  ON CONFLICT (bid) DO UPDATE SET
    strasse = EXCLUDED.strasse, hnr = EXCLUDED.hnr, hnr_zusatz = EXCLUDED.hnr_zusatz,
    plz = EXCLUDED.plz, ort = EXCLUDED.ort, name = EXCLUDED.name, email = EXCLUDED.email,
    mobil = EXCLUDED.mobil, festnetz = EXCLUDED.festnetz, typ = EXCLUDED.typ,
    we = EXCLUDED.we, ge = EXCLUDED.ge, zustimmung = EXCLUDED.zustimmung,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng,
    auskundung_von = EXCLUDED.auskundung_von,
    auskundung_bis = EXCLUDED.auskundung_bis;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;
