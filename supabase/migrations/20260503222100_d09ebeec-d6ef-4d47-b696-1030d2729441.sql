create table if not exists public.doku_states (
  bid text primary key,
  foto boolean not null default false,
  protokoll boolean not null default false,
  sharepoint boolean not null default false,
  durchfuehrt_von text not null default '',
  durchfuehrt_am timestamptz,
  notiz text not null default '',
  updated_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.doku_states;

alter table public.doku_states enable row level security;

create policy "Allow all" on public.doku_states
  for all using (true) with check (true);