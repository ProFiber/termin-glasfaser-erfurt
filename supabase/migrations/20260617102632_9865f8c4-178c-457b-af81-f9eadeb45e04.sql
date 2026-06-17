ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS auskundung_erforderlich boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auskundung_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auskundung_erfolgt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auskundung_ergebnis text NOT NULL DEFAULT '';