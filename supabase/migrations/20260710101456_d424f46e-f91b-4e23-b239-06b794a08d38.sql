ALTER TABLE public.doku_states
  ADD COLUMN IF NOT EXISTS gf_plus BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.doku_states.gf_plus IS
  'Ob das Objekt im Telekom Glasfaser-Plus-Portal enthalten ist (Excel-Spalte GF+ im "Alle GF+ HA"-Sheet). false = Objekt gebaut, aber kein Telekom-Auftrag vorhanden -> Eigentümer muss Auftrag auslösen.';

-- RPC erweitern: gf_plus aus Excel-Import übernehmen
CREATE OR REPLACE FUNCTION public.bulk_import_call_states_from_excel(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      umsatz_eur, zusatz_eur, eingereicht_am, aufmass_am, gutschrift_nr, avis_am, verguetet_am,
      fotos_erhalten, protokoll_erhalten, notiz)
    VALUES (
      v_bid,
      coalesce((rec->>'status')::call_status, 'offen'),
      nullif(rec->>'erledigt_datum','')::date,
      coalesce((rec->>'grabenlaenge')::int, 0),
      coalesce((rec->>'umsatz_eur')::numeric, 0),
      coalesce((rec->>'zusatz_eur')::numeric, 0),
      nullif(rec->>'eingereicht_am','')::date,
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
      eingereicht_am = nullif(rec->>'eingereicht_am','')::date,
      aufmass_am = nullif(rec->>'aufmass_am','')::date,
      gutschrift_nr = CASE WHEN coalesce(rec->>'gutschrift_nr','') <> '' THEN rec->>'gutschrift_nr' ELSE call_states.gutschrift_nr END,
      avis_am = coalesce(nullif(rec->>'avis_am','')::date, call_states.avis_am),
      verguetet_am = coalesce(nullif(rec->>'verguetet_am','')::date, call_states.verguetet_am),
      fotos_erhalten = coalesce((rec->>'foto')::boolean, call_states.fotos_erhalten),
      protokoll_erhalten = coalesce((rec->>'protokoll')::boolean, call_states.protokoll_erhalten),
      notiz = CASE WHEN call_states.notiz = '' AND coalesce(rec->>'bemerkung','') <> '' THEN rec->>'bemerkung' ELSE call_states.notiz END,
      updated_at = now();
    cnt_cs := cnt_cs + 1;

    INSERT INTO doku_states (bid, foto, protokoll, sharepoint, gf_plus)
    VALUES (v_bid,
            coalesce((rec->>'foto')::boolean,false),
            coalesce((rec->>'protokoll')::boolean,false),
            coalesce((rec->>'sharepoint')::boolean,false),
            coalesce((rec->>'gf_plus')::boolean,true))
    ON CONFLICT (bid) DO UPDATE SET
      foto = coalesce((rec->>'foto')::boolean, doku_states.foto),
      protokoll = coalesce((rec->>'protokoll')::boolean, doku_states.protokoll),
      sharepoint = coalesce((rec->>'sharepoint')::boolean, doku_states.sharepoint),
      gf_plus = coalesce((rec->>'gf_plus')::boolean, doku_states.gf_plus),
      updated_at = now();
    cnt_doku := cnt_doku + 1;
  END LOOP;

  RETURN jsonb_build_object('call_states', cnt_cs, 'doku_states', cnt_doku, 'no_match_logs', cnt_log);
END;
$function$;