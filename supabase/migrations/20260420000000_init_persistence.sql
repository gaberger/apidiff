-- APIDIFF persistence schema.
--
-- Mirrors the three secondary ports:
--   - IntegrationStoragePort -> integrations
--   - SchemaUrlRegistryPort  -> schema_urls
--   - SchemaCachePort        -> schema_cache
--
-- Column names use snake_case. Adapters translate to the camelCase domain shape.
--
-- RLS POSTURE (2026-04-20): anon has full CRUD. This is safe-by-default because
-- enabling RLS lets us tighten later by adding a user_id column + auth.uid()
-- policies without a table rebuild. TODO(auth): when authentication is added,
-- replace the "anon-all" policies with owner-scoped policies keyed on user_id.

begin;

create table if not exists public.integrations (
  id             text primary key,
  name           text not null,
  slug           text,
  category       text,
  color          text,
  logo_url       text,
  base_url       text,
  changelog_url  text,
  versions       jsonb,
  comparisons    jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.schema_urls (
  id                     text primary key,
  url                    text not null unique,
  label                  text,
  owner_integration_id   text references public.integrations(id) on delete set null,
  added_at               timestamptz not null default now(),
  last_fetched_at        timestamptz
);

create index if not exists schema_urls_owner_idx
  on public.schema_urls(owner_integration_id);

create table if not exists public.schema_cache (
  url          text primary key,
  content      text not null,
  fetched_at   bigint not null,
  expires_at   bigint not null,
  size_bytes   integer not null
);

create index if not exists schema_cache_expires_at_idx
  on public.schema_cache(expires_at);

-- updated_at trigger for integrations
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integrations_touch_updated_at on public.integrations;
create trigger integrations_touch_updated_at
  before update on public.integrations
  for each row execute function public.touch_updated_at();

-- Enable RLS on every table. Permissive policies for anon until auth lands.
alter table public.integrations enable row level security;
alter table public.schema_urls  enable row level security;
alter table public.schema_cache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='integrations' and policyname='anon_all') then
    create policy anon_all on public.integrations
      for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='schema_urls' and policyname='anon_all') then
    create policy anon_all on public.schema_urls
      for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='schema_cache' and policyname='anon_all') then
    create policy anon_all on public.schema_cache
      for all to anon using (true) with check (true);
  end if;
end $$;

commit;
