
ALTER TABLE public.call_states
  ADD COLUMN IF NOT EXISTS gutschrift_nr text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.bulk_import_call_states_from_excel(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  cnt_cs int := 0;
  cnt_doku int := 0;
  cnt_log int := 0;
  v_bid text;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(payload->'rows')
  LOOP
    v_bid := rec->>'bid';
    IF v_bid IS NULL THEN
      INSERT INTO import_log(quelle, strasse, hnr, status, details)
      VALUES ('excel_alle_gf_ha', rec->>'strasse', rec->>'hnr', 'no_match', rec);
      cnt_log := cnt_log + 1;
      CONTINUE;
    END IF;

    INSERT INTO call_states (bid, status, erledigt_datum, grabenlaenge,
      umsatz_eur, zusatz_eur, aufmass_am, gutschrift_nr, avis_am, verguetet_am,
      fotos_erhalten, protokoll_erhalten, notiz)
    VALUES (
      v_bid,
      coalesce((rec->>'status')::call_status, 'offen'),
      nullif(rec->>'erledigt_datum','')::date,
      coalesce((rec->>'grabenlaenge')::int, 0),
      coalesce((rec->>'umsatz_eur')::numeric, 0),
      coalesce((rec->>'zusatz_eur')::numeric, 0),
      nullif(rec->>'aufmass_am','')::date,
      coalesce(rec->>'gutschrift_nr',''),
      nullif(rec->>'avis_am','')::date,
      nullif(rec->>'verguetet_am','')::date,
      coalesce((rec->>'foto')::boolean, false),
      coalesce((rec->>'protokoll')::boolean, false),
      coalesce(rec->>'bemerkung','')
    )
    ON CONFLICT (bid) DO UPDATE SET
      status = CASE WHEN rec->>'status' IS NOT NULL THEN (rec->>'status')::call_status ELSE call_states.status END,
      erledigt_datum = coalesce(nullif(rec->>'erledigt_datum','')::date, call_states.erledigt_datum),
      grabenlaenge = CASE WHEN coalesce((rec->>'grabenlaenge')::int,0) > 0 THEN (rec->>'grabenlaenge')::int ELSE call_states.grabenlaenge END,
      umsatz_eur = CASE WHEN coalesce((rec->>'umsatz_eur')::numeric,0) > 0 THEN (rec->>'umsatz_eur')::numeric ELSE call_states.umsatz_eur END,
      zusatz_eur = CASE WHEN coalesce((rec->>'zusatz_eur')::numeric,0) > 0 THEN (rec->>'zusatz_eur')::numeric ELSE call_states.zusatz_eur END,
      aufmass_am = coalesce(nullif(rec->>'aufmass_am','')::date, call_states.aufmass_am),
      gutschrift_nr = CASE WHEN coalesce(rec->>'gutschrift_nr','') <> '' THEN rec->>'gutschrift_nr' ELSE call_states.gutschrift_nr END,
      avis_am = coalesce(nullif(rec->>'avis_am','')::date, call_states.avis_am),
      verguetet_am = coalesce(nullif(rec->>'verguetet_am','')::date, call_states.verguetet_am),
      fotos_erhalten = call_states.fotos_erhalten OR coalesce((rec->>'foto')::boolean,false),
      protokoll_erhalten = call_states.protokoll_erhalten OR coalesce((rec->>'protokoll')::boolean,false),
      notiz = CASE WHEN call_states.notiz = '' AND coalesce(rec->>'bemerkung','') <> '' THEN rec->>'bemerkung' ELSE call_states.notiz END,
      updated_at = now();
    cnt_cs := cnt_cs + 1;

    IF coalesce((rec->>'foto')::boolean,false) OR coalesce((rec->>'protokoll')::boolean,false) OR coalesce((rec->>'sharepoint')::boolean,false) THEN
      INSERT INTO doku_states (bid, foto, protokoll, sharepoint)
      VALUES (v_bid,
              coalesce((rec->>'foto')::boolean,false),
              coalesce((rec->>'protokoll')::boolean,false),
              coalesce((rec->>'sharepoint')::boolean,false))
      ON CONFLICT (bid) DO UPDATE SET
        foto = doku_states.foto OR EXCLUDED.foto,
        protokoll = doku_states.protokoll OR EXCLUDED.protokoll,
        sharepoint = doku_states.sharepoint OR EXCLUDED.sharepoint,
        updated_at = now();
      cnt_doku := cnt_doku + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('call_states', cnt_cs, 'doku_states', cnt_doku, 'no_match_logs', cnt_log);
END;
$$;

-- Clear old no_match logs to avoid duplicates on re-run
DELETE FROM public.import_log WHERE quelle = 'excel_alle_gf_ha' AND status = 'no_match';
