
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS anschluss_typ text;
GRANT UPDATE (anschluss_typ) ON public.contacts TO anon, authenticated;
DROP POLICY IF EXISTS "Public update anschluss_typ" ON public.contacts;
CREATE POLICY "Public update anschluss_typ" ON public.contacts FOR UPDATE USING (true) WITH CHECK (true);
