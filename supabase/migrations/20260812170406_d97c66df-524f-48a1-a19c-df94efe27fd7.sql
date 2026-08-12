ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS auftrag_status text,
  ADD COLUMN IF NOT EXISTS auftrag_typ text,
  ADD COLUMN IF NOT EXISTS bestellnummer text,
  ADD COLUMN IF NOT EXISTS installation_faellig date;