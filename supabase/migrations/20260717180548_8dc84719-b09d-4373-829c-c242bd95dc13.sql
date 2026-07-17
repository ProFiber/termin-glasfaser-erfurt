-- Neue Portal-Info Spalte für Telekom Bulk-ID
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS bulk_id text;

-- Am Schwimmbad 45 (Gentes)
UPDATE public.contacts SET
  kls_id = '15552745',
  fol_id = '1000004320970',
  telekom_bid = '578446',
  bulk_id = '185593',
  naechster_schritt = 'Termin vereinbaren',
  telekom_kommentar = 'Ausbaustatus: planned | Start 21.04.26 – Ende 31.03.27 | Bauweise: nur Hausanschluss (Vorderhaus) | Projektphase: Nachinstallation'
WHERE bid = 'BULK-GENTES-AM-SCHWIMMBAD-45';

-- Am Schwimmbad 44 (Schiffler)
UPDATE public.contacts SET
  kls_id = '15552744',
  fol_id = '1000004320969',
  telekom_bid = '578445',
  bulk_id = '185592',
  naechster_schritt = 'Termin vereinbaren',
  telekom_kommentar = 'Ausbaustatus: planned | Start 21.04.26 – Ende 31.03.27 | Bauweise: nur Hausanschluss (Vorderhaus) | Projektphase: Nachinstallation'
WHERE bid = 'BULK-SCHIFFLER-AM-SCHWIMMBAD-44';