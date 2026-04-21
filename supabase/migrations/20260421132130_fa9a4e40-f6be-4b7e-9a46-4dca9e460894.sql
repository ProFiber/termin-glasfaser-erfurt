
CREATE OR REPLACE FUNCTION public.bulk_import_contacts(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO public.contacts (bid,strasse,hnr,hnr_zusatz,plz,ort,name,email,mobil,festnetz,typ,we,ge,zustimmung,lat,lng)
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
    nullif(rec->>'lng','')::double precision
  FROM jsonb_array_elements(payload) rec
  ON CONFLICT (bid) DO UPDATE SET
    strasse = EXCLUDED.strasse, hnr = EXCLUDED.hnr, hnr_zusatz = EXCLUDED.hnr_zusatz,
    plz = EXCLUDED.plz, ort = EXCLUDED.ort, name = EXCLUDED.name, email = EXCLUDED.email,
    mobil = EXCLUDED.mobil, festnetz = EXCLUDED.festnetz, typ = EXCLUDED.typ,
    we = EXCLUDED.we, ge = EXCLUDED.ge, zustimmung = EXCLUDED.zustimmung,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_contacts(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_contacts(jsonb) TO postgres, service_role;
