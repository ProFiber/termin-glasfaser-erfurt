CREATE TEMP TABLE _out_of_scope AS
SELECT c.bid FROM public.contacts c
LEFT JOIN public.call_states cs ON cs.bid = c.bid
WHERE c.nvt ~ '^2V80(2[2-9]|30|4[4-9]|5[0-9])$'
  AND coalesce(cs.status::text,'offen') <> 'erledigt';

DELETE FROM public.doku_states d USING _out_of_scope o WHERE d.bid = o.bid;
DELETE FROM public.call_states s USING _out_of_scope o WHERE s.bid = o.bid;
DELETE FROM public.contacts c USING _out_of_scope o WHERE c.bid = o.bid;