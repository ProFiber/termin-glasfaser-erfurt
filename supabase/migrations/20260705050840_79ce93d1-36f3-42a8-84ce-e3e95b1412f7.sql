ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS kls_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_kls_id_unique ON public.contacts(kls_id) WHERE kls_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_kls_id_idx ON public.contacts(kls_id);