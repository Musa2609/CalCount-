-- User favourites
create table if not exists public.user_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, food_id)
);

alter table public.user_favourites enable row level security;

drop policy if exists "user_favourites_owner_all" on public.user_favourites;
create policy "user_favourites_owner_all" on public.user_favourites
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists user_favourites_user_idx on public.user_favourites (user_id);