ALTER TABLE call_states ADD COLUMN IF NOT EXISTS klarfall boolean NOT NULL DEFAULT false;
ALTER TABLE call_states ADD COLUMN IF NOT EXISTS klarfall_notiz text NOT NULL DEFAULT '';