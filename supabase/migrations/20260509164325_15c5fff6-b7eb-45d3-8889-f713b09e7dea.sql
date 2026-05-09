ALTER TABLE public.call_states
ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS team_status text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS fotos_erhalten boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS protokoll_erhalten boolean NOT NULL DEFAULT false;