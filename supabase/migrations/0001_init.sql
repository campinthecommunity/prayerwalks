-- Prayer Walk Dashboard -- initial schema
--
-- Design: every visitor (using the public "anon" key) can INSERT and SELECT
-- freely on these tables -- that's what makes "anyone with the link can add a
-- pin or photo, and everyone sees it" possible. Nobody using the anon key can
-- UPDATE or DELETE anything (no policy grants it, and Row Level Security
-- defaults to deny). Deletions only happen through the admin-action Edge
-- Function, which authenticates with the project's service-role key (which
-- bypasses RLS) only after independently checking the admin passphrase.

create extension if not exists "pgcrypto";

-- ---------- locations ----------
create table if not exists public.locations (
  id           bigint primary key,           -- client-supplied Date.now() id, shared with stories.id
  name         text not null,
  church       text not null default 'Church not specified',
  participants integer not null default 1,
  x            double precision,
  y            double precision,
  lon          double precision,
  lat          double precision,
  near_city    text,
  created_at   timestamptz not null default now()
);

alter table public.locations enable row level security;

create policy "public can read locations"
  on public.locations for select
  using (true);

create policy "public can insert locations"
  on public.locations for insert
  with check (true);

-- No update/delete policy for anon on purpose -- see note above.

-- ---------- stories ----------
create table if not exists public.stories (
  id           bigint primary key references public.locations(id) on delete cascade,
  location     text not null,
  church       text not null default 'Church not specified',
  story        text not null,
  participants integer not null default 1,
  display_date text,
  created_at   timestamptz not null default now()
);

alter table public.stories enable row level security;

create policy "public can read stories"
  on public.stories for select
  using (true);

create policy "public can insert stories"
  on public.stories for insert
  with check (true);

-- ---------- photos ----------
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  image_path   text not null,   -- path inside the "photos" Storage bucket
  caption      text,
  church       text,
  display_date text,
  created_at   timestamptz not null default now()
);

alter table public.photos enable row level security;

create policy "public can read photos"
  on public.photos for select
  using (true);

create policy "public can insert photos"
  on public.photos for insert
  with check (true);

-- ---------- Storage bucket for photos ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Anyone can read photo files (the bucket is public), and anyone can upload
-- new ones; nobody can overwrite or delete an existing object with the anon
-- key -- deletion goes through the admin-action Edge Function's service-role
-- client instead, same as the database rows above.
create policy "public can read photo files"
  on storage.objects for select
  using (bucket_id = 'photos');

create policy "public can upload photo files"
  on storage.objects for insert
  with check (bucket_id = 'photos');
