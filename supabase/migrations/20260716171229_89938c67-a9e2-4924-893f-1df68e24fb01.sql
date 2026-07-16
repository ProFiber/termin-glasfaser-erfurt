
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS fol_id text,
  ADD COLUMN IF NOT EXISTS telekom_bid text,
  ADD COLUMN IF NOT EXISTS naechster_schritt text,
  ADD COLUMN IF NOT EXISTS telekom_kommentar text,
  ADD COLUMN IF NOT EXISTS wartegrund text,
  ADD COLUMN IF NOT EXISTS wartegrund_kommentar text,
  ADD COLUMN IF NOT EXISTS wiedervorlage date,
  ADD COLUMN IF NOT EXISTS hausstich_status text,
  ADD COLUMN IF NOT EXISTS hausstich_datum date,
  ADD COLUMN IF NOT EXISTS storniert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact2_name text,
  ADD COLUMN IF NOT EXISTS contact2_mobil text,
  ADD COLUMN IF NOT EXISTS contact2_festnetz text,
  ADD COLUMN IF NOT EXISTS contact2_email text,
  ADD COLUMN IF NOT EXISTS contact3_name text,
  ADD COLUMN IF NOT EXISTS contact3_mobil text,
  ADD COLUMN IF NOT EXISTS contact3_festnetz text,
  ADD COLUMN IF NOT EXISTS contact3_email text,
  ADD COLUMN IF NOT EXISTS eig_strasse text,
  ADD COLUMN IF NOT EXISTS eig_hnr text,
  ADD COLUMN IF NOT EXISTS eig_plz text,
  ADD COLUMN IF NOT EXISTS eig_ort text;

CREATE INDEX IF NOT EXISTS contacts_fol_id_idx ON public.contacts (fol_id) WHERE fol_id IS NOT NULL;

-- Bot-Import: matcht per kls_id, überschreibt/setzt Portal-Info und Kontaktdaten.
-- Eigentümer-Name/Mobil/Festnetz/Email werden nur gesetzt, wenn im Kontakt noch leer
-- (schützt manuelle Eingaben). contact2/3, Kommentare, Wartegrund, FoL etc. werden immer überschrieben (read-only Portal-Info).
CREATE OR REPLACE FUNCTION public.bulk_import_bot_contacts(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  matched int := 0;
  unmatched int := 0;
  v_kls text;
  v_bid text;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    v_kls := nullif(rec->>'kls_id','');
    IF v_kls IS NULL THEN unmatched := unmatched + 1; CONTINUE; END IF;

    SELECT bid INTO v_bid FROM contacts WHERE kls_id = v_kls LIMIT 1;
    IF v_bid IS NULL THEN
      unmatched := unmatched + 1;
      INSERT INTO import_log(quelle, strasse, hnr, status, details)
      VALUES ('bot_export', coalesce(rec->>'strasse',''), coalesce(rec->>'hnr',''), 'no_match_kls', rec);
      CONTINUE;
    END IF;

    UPDATE contacts SET
      -- Owner Kontakt (Name/Mobil/Festnetz/Email): nur wenn leer
      name = CASE WHEN coalesce(name,'')='' AND coalesce(rec->>'name','')<>'' THEN rec->>'name' ELSE name END,
      mobil = CASE WHEN coalesce(mobil,'')='' AND coalesce(rec->>'mobil','')<>'' THEN rec->>'mobil' ELSE mobil END,
      festnetz = CASE WHEN coalesce(festnetz,'')='' AND coalesce(rec->>'festnetz','')<>'' THEN rec->>'festnetz' ELSE festnetz END,
      email = CASE WHEN coalesce(email,'')='' AND coalesce(rec->>'email','')<>'' THEN rec->>'email' ELSE email END,
      -- Read-only Portal-Info: immer überschreiben (auch mit leer)
      fol_id = nullif(rec->>'fol_id',''),
      telekom_bid = nullif(rec->>'telekom_bid',''),
      naechster_schritt = nullif(rec->>'naechster_schritt',''),
      telekom_kommentar = nullif(rec->>'telekom_kommentar',''),
      wartegrund = nullif(rec->>'wartegrund',''),
      wartegrund_kommentar = nullif(rec->>'wartegrund_kommentar',''),
      wiedervorlage = nullif(rec->>'wiedervorlage','')::date,
      hausstich_status = nullif(rec->>'hausstich_status',''),
      hausstich_datum = nullif(rec->>'hausstich_datum','')::date,
      storniert = coalesce((rec->>'storniert')::boolean, false),
      contact2_name = nullif(rec->>'contact2_name',''),
      contact2_mobil = nullif(rec->>'contact2_mobil',''),
      contact2_festnetz = nullif(rec->>'contact2_festnetz',''),
      contact2_email = nullif(rec->>'contact2_email',''),
      contact3_name = nullif(rec->>'contact3_name',''),
      contact3_mobil = nullif(rec->>'contact3_mobil',''),
      contact3_festnetz = nullif(rec->>'contact3_festnetz',''),
      contact3_email = nullif(rec->>'contact3_email',''),
      eig_strasse = nullif(rec->>'eig_strasse',''),
      eig_hnr = nullif(rec->>'eig_hnr',''),
      eig_plz = nullif(rec->>'eig_plz',''),
      eig_ort = nullif(rec->>'eig_ort','')
    WHERE bid = v_bid;
    matched := matched + 1;
  END LOOP;

  RETURN jsonb_build_object('matched', matched, 'unmatched', unmatched);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_bot_contacts(jsonb) TO authenticated, anon;
