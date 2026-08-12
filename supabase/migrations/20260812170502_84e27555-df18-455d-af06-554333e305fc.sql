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
        auftrag_typ, bestellnummer, installation_faellig, storniert, auftragsquelle)
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
        installation_faellig = coalesce(nullif(rec->>'installation_faellig','')::date, installation_faellig)
      WHERE bid = v_bid;
      upd := upd + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', upd, 'inserted', ins);
END;
$function$;