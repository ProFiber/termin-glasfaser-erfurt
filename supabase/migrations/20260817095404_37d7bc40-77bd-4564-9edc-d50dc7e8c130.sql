ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS storniert_telekom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storniert_intern boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storno_grund text;

UPDATE public.contacts SET
  storniert_telekom = (storniert AND coalesce(auftrag_status,'') IN ('Abgebrochen','CANCELED','Canceled')),
  storniert_intern  = (storniert AND coalesce(auftrag_status,'') NOT IN ('Abgebrochen','CANCELED','Canceled'));

CREATE OR REPLACE FUNCTION public.sync_storno_flags()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.storniert := coalesce(NEW.storniert_telekom,false) OR coalesce(NEW.storniert_intern,false);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacts_storno_sync ON public.contacts;
CREATE TRIGGER contacts_storno_sync BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.sync_storno_flags();

-- Bot-Import darf internen Storno nicht mehr überschreiben
CREATE OR REPLACE FUNCTION public.bulk_import_bot_contacts(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      name = CASE WHEN coalesce(name,'')='' AND coalesce(rec->>'name','')<>'' THEN rec->>'name' ELSE name END,
      mobil = CASE WHEN coalesce(mobil,'')='' AND coalesce(rec->>'mobil','')<>'' THEN rec->>'mobil' ELSE mobil END,
      festnetz = CASE WHEN coalesce(festnetz,'')='' AND coalesce(rec->>'festnetz','')<>'' THEN rec->>'festnetz' ELSE festnetz END,
      email = CASE WHEN coalesce(email,'')='' AND coalesce(rec->>'email','')<>'' THEN rec->>'email' ELSE email END,
      fol_id = nullif(rec->>'fol_id',''),
      telekom_bid = nullif(rec->>'telekom_bid',''),
      naechster_schritt = nullif(rec->>'naechster_schritt',''),
      telekom_kommentar = nullif(rec->>'telekom_kommentar',''),
      wartegrund = nullif(rec->>'wartegrund',''),
      wartegrund_kommentar = nullif(rec->>'wartegrund_kommentar',''),
      wiedervorlage = nullif(rec->>'wiedervorlage','')::date,
      hausstich_status = nullif(rec->>'hausstich_status',''),
      hausstich_datum = nullif(rec->>'hausstich_datum','')::date,
      storniert_telekom = coalesce((rec->>'storniert')::boolean, false),
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
$function$;

-- Auftrags-Import (Order.csv): Telekom-Storno pflegen, internen Storno behalten
CREATE OR REPLACE FUNCTION public.bulk_import_orders(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec jsonb;
  v_bid text;
  upd int := 0;
  ins int := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    SELECT bid INTO v_bid FROM contacts
     WHERE kls_id = rec->>'kls_id' OR bid = 'KLS-' || (rec->>'kls_id') OR bid = rec->>'kls_id'
     LIMIT 1;

    IF v_bid IS NULL THEN
      INSERT INTO contacts (bid, strasse, hnr, hnr_zusatz, plz, ort, name, nvt,
        zustimmung, kls_id, fol_id, telekom_bid, naechster_schritt, auftrag_status,
        auftrag_typ, bestellnummer, installation_faellig, storniert_telekom, auftragsquelle)
      VALUES ('KLS-' || (rec->>'kls_id'),
        coalesce(rec->>'strasse',''), coalesce(rec->>'hnr',''), coalesce(rec->>'hnr_zusatz',''),
        coalesce(rec->>'plz',''), coalesce(rec->>'ort',''), coalesce(rec->>'name',''),
        coalesce(rec->>'nvt',''), coalesce(rec->>'zustimmung',''),
        nullif(rec->>'kls_id',''), nullif(rec->>'fol_id',''), nullif(rec->>'telekom_bid',''),
        nullif(rec->>'naechster_schritt',''), nullif(rec->>'auftrag_status',''),
        nullif(rec->>'auftrag_typ',''), nullif(rec->>'bestellnummer',''),
        nullif(rec->>'installation_faellig','')::date,
        coalesce((rec->>'storniert')::boolean, false), 'gf_plus')
      ON CONFLICT (bid) DO NOTHING;
      ins := ins + 1;
    ELSE
      UPDATE contacts SET
        name = CASE WHEN coalesce(name,'') = '' AND coalesce(rec->>'name','') <> '' THEN rec->>'name' ELSE name END,
        kls_id = coalesce(kls_id, nullif(rec->>'kls_id','')),
        fol_id = coalesce(nullif(rec->>'fol_id',''), fol_id),
        telekom_bid = coalesce(nullif(rec->>'telekom_bid',''), telekom_bid),
        auftrag_status = nullif(rec->>'auftrag_status',''),
        auftrag_typ = nullif(rec->>'auftrag_typ',''),
        bestellnummer = coalesce(nullif(rec->>'bestellnummer',''), bestellnummer),
        installation_faellig = coalesce(nullif(rec->>'installation_faellig','')::date, installation_faellig),
        storniert_telekom = CASE WHEN rec ? 'storniert'
          THEN coalesce((rec->>'storniert')::boolean, false)
          ELSE storniert_telekom END
      WHERE bid = v_bid;
      upd := upd + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', upd, 'inserted', ins);
END;
$function$;