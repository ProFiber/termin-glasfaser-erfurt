DELETE FROM public.call_states WHERE bid IN (SELECT bid FROM public.contacts WHERE ort <> 'An der Schmücke');
DELETE FROM public.doku_states WHERE bid IN (SELECT bid FROM public.contacts WHERE ort <> 'An der Schmücke');
DELETE FROM public.contacts WHERE ort <> 'An der Schmücke';