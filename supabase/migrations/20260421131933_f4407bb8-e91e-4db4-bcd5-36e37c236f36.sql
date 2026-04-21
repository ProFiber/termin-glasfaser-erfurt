
-- Status enum for call states
CREATE TYPE public.call_status AS ENUM ('offen','angerufen','termin','nichtErreicht','abgelehnt','erledigt');

-- Contacts (Eigentümer/Objekte)
CREATE TABLE public.contacts (
  bid TEXT PRIMARY KEY,
  strasse TEXT NOT NULL DEFAULT '',
  hnr TEXT NOT NULL DEFAULT '',
  hnr_zusatz TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '',
  ort TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  mobil TEXT NOT NULL DEFAULT '',
  festnetz TEXT NOT NULL DEFAULT '',
  typ TEXT NOT NULL DEFAULT '',
  we INTEGER NOT NULL DEFAULT 0,
  ge INTEGER NOT NULL DEFAULT 0,
  zustimmung TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Call states (one row per contact)
CREATE TABLE public.call_states (
  bid TEXT PRIMARY KEY REFERENCES public.contacts(bid) ON DELETE CASCADE,
  status public.call_status NOT NULL DEFAULT 'offen',
  termin_slot TEXT NOT NULL DEFAULT '',
  notiz TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_strasse ON public.contacts(strasse);
CREATE INDEX idx_call_states_status ON public.call_states(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER call_states_touch
  BEFORE UPDATE ON public.call_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: shared team list, no auth required
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "Public read call_states" ON public.call_states FOR SELECT USING (true);
CREATE POLICY "Public insert call_states" ON public.call_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update call_states" ON public.call_states FOR UPDATE USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE public.call_states REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_states;
