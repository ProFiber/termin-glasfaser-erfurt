
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS auftragsquelle text NOT NULL DEFAULT 'gf_plus';

CREATE OR REPLACE FUNCTION public.bulk_import_contacts(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO public.contacts (bid,strasse,hnr,hnr_zusatz,plz,ort,name,email,mobil,festnetz,typ,we,ge,zustimmung,lat,lng,auskundung_von,auskundung_bis,nvt,auskundung_erforderlich,auskundung_status,auskundung_erfolgt,auskundung_ergebnis,auftrag_erstellt_am,auftragsquelle)
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
    nullif(rec->>'auskundung_bis','')::timestamptz,
    coalesce(rec->>'nvt',''),
    coalesce((rec->>'auskundung_erforderlich')::boolean, false),
    coalesce(rec->>'auskundung_status',''),
    coalesce((rec->>'auskundung_erfolgt')::boolean, false),
    coalesce(rec->>'auskundung_ergebnis',''),
    nullif(rec->>'auftrag_erstellt_am','')::timestamptz,
    coalesce(nullif(rec->>'auftragsquelle',''), 'gf_plus')
  FROM jsonb_array_elements(payload) rec
  ON CONFLICT (bid) DO UPDATE SET
    strasse = EXCLUDED.strasse, hnr = EXCLUDED.hnr, hnr_zusatz = EXCLUDED.hnr_zusatz,
    plz = EXCLUDED.plz, ort = EXCLUDED.ort,
    name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE contacts.name END,
    email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE contacts.email END,
    mobil = CASE WHEN EXCLUDED.mobil <> '' THEN EXCLUDED.mobil ELSE contacts.mobil END,
    festnetz = CASE WHEN EXCLUDED.festnetz <> '' THEN EXCLUDED.festnetz ELSE contacts.festnetz END,
    typ = CASE WHEN EXCLUDED.typ <> '' THEN EXCLUDED.typ ELSE contacts.typ END,
    we = CASE WHEN EXCLUDED.we > 0 THEN EXCLUDED.we ELSE contacts.we END,
    ge = CASE WHEN EXCLUDED.ge > 0 THEN EXCLUDED.ge ELSE contacts.ge END,
    zustimmung = CASE WHEN EXCLUDED.zustimmung <> '' THEN EXCLUDED.zustimmung ELSE contacts.zustimmung END,
    lat = coalesce(EXCLUDED.lat, contacts.lat),
    lng = coalesce(EXCLUDED.lng, contacts.lng),
    auskundung_von = coalesce(EXCLUDED.auskundung_von, contacts.auskundung_von),
    auskundung_bis = coalesce(EXCLUDED.auskundung_bis, contacts.auskundung_bis),
    nvt = CASE WHEN EXCLUDED.nvt <> '' THEN EXCLUDED.nvt ELSE contacts.nvt END,
    auskundung_erforderlich = EXCLUDED.auskundung_erforderlich,
    auskundung_status = EXCLUDED.auskundung_status,
    auskundung_erfolgt = EXCLUDED.auskundung_erfolgt,
    auskundung_ergebnis = CASE WHEN EXCLUDED.auskundung_ergebnis <> '' THEN EXCLUDED.auskundung_ergebnis ELSE contacts.auskundung_ergebnis END,
    auftrag_erstellt_am = coalesce(EXCLUDED.auftrag_erstellt_am, contacts.auftrag_erstellt_am);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;

-- Bereits vorhandene synthetische "OHNE-…"-Kontakte auf 'bulk' setzen
UPDATE public.contacts SET auftragsquelle = 'bulk' WHERE bid LIKE 'OHNE-%';
