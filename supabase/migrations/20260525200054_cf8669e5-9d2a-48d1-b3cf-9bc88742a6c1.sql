
ALTER TABLE public.call_states
  ADD COLUMN IF NOT EXISTS umsatz_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zusatz_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS erledigt_datum date,
  ADD COLUMN IF NOT EXISTS aufmass_am date,
  ADD COLUMN IF NOT EXISTS gutschrift_am date,
  ADD COLUMN IF NOT EXISTS avis_am date,
  ADD COLUMN IF NOT EXISTS verguetet_am date;

CREATE INDEX IF NOT EXISTS idx_call_states_erledigt_datum ON public.call_states(erledigt_datum);
CREATE INDEX IF NOT EXISTS idx_call_states_verguetet_am ON public.call_states(verguetet_am);

CREATE TABLE IF NOT EXISTS public.umsatz_ziele (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE,
  ziel_eur numeric(12,2) NOT NULL,
  arbeitstage_pro_monat integer NOT NULL DEFAULT 22,
  saturday_buffer boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.umsatz_ziele ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read umsatz_ziele" ON public.umsatz_ziele FOR SELECT USING (true);
CREATE POLICY "Public insert umsatz_ziele" ON public.umsatz_ziele FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update umsatz_ziele" ON public.umsatz_ziele FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.umsatz_ziele (scope, ziel_eur, arbeitstage_pro_monat, saturday_buffer)
VALUES ('monat', 100000, 22, true)
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle text NOT NULL,
  bid text,
  strasse text,
  hnr text,
  status text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read import_log" ON public.import_log FOR SELECT USING (true);
CREATE POLICY "Public insert import_log" ON public.import_log FOR INSERT WITH CHECK (true);
