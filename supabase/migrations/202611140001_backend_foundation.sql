-- Apply once with Supabase migrations or the SQL editor. No existing data is deleted.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  friend_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_at timestamptz not null default now()
);
create table public.spots (
  id text primary key,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  category text not null check (category in ('study', 'eat', 'hangout', 'chill', 'essentials')),
  card_text text not null,
  tip text not null,
  sticker_key text not null
);
create table public.popups (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  brand text not null check (char_length(btrim(brand)) between 1 and 80),
  brand_normalized text generated always as (lower(btrim(brand))) stored,
  freebies text[] not null default '{}',
  sticker jsonb not null check (
    jsonb_typeof(sticker) = 'object' and
    sticker @> '{"source":"popup","variant":"special"}'::jsonb and
    sticker ?& array['key','name','colors','lore']
  ),
  expires_at timestamptz not null,
  confirmations integer not null default 1 check (confirmations >= 1),
  status text not null default 'live' check (status in ('live', 'expired')),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
-- Identity belongs in private reports, never in the Realtime-published popups row.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  popup_id uuid not null references public.popups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ai_verdict jsonb not null default '{"accepted":true}'::jsonb
);
create table public.org_drops (
  id text primary key,
  org_name text not null,
  event_name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sticker_key text not null,
  check (ends_at > starts_at)
);
create table public.catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('spot', 'popup', 'org', 'quest')),
  source_id text not null,
  variant text not null check (variant in ('morning', 'day', 'night', 'seasonal', 'special')),
  caught_at timestamptz not null default now(),
  unique (user_id, source, source_id, variant)
);
create table public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index popups_brand_live_idx on public.popups (brand_normalized, created_at desc) where status = 'live';
create index popups_expiry_idx on public.popups (expires_at) where status = 'live';
create index reports_popup_idx on public.reports (popup_id);
create index reports_user_idx on public.reports (user_id);
create index catches_user_time_idx on public.catches (user_id, caught_at desc);
create index friends_friend_idx on public.friends (friend_id);

-- Check the current auth record, rather than trusting editable user_metadata.
create function public.is_verified_usc_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
      and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$'
  );
$$;
revoke all on function public.is_verified_usc_user() from public, anon;
grant execute on function public.is_verified_usc_user() to authenticated;

alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.popups enable row level security;
alter table public.reports enable row level security;
alter table public.org_drops enable row level security;
alter table public.catches enable row level security;
alter table public.friends enable row level security;

revoke all on public.profiles, public.spots, public.popups, public.reports,
  public.org_drops, public.catches, public.friends from public, anon, authenticated;
grant select on public.profiles, public.spots, public.popups,
  public.org_drops, public.catches, public.friends to authenticated;
grant all on public.profiles, public.spots, public.popups, public.reports,
  public.org_drops, public.catches, public.friends to service_role;

create policy profiles_read_own on public.profiles for select to authenticated
  using ((select public.is_verified_usc_user()) and user_id = (select auth.uid()));
create policy spots_read_usc on public.spots for select to authenticated
  using ((select public.is_verified_usc_user()));
-- Clients must hide expired pins using expires_at, including between Realtime events.
create policy popups_read_usc on public.popups for select to authenticated
  using ((select public.is_verified_usc_user()));
create policy org_drops_read_usc on public.org_drops for select to authenticated
  using ((select public.is_verified_usc_user()));
create policy catches_read_own on public.catches for select to authenticated
  using ((select public.is_verified_usc_user()) and user_id = (select auth.uid()));
create policy friends_read_own on public.friends for select to authenticated
  using ((select public.is_verified_usc_user()) and user_id = (select auth.uid()));
-- No client write policies: authenticated server routes enforce game rules first.
-- Friend-book sharing will be added with its route, not by exposing all catches.

create function public.campus_distance_meters(a_lat double precision, a_lng double precision,
  b_lat double precision, b_lng double precision) returns double precision
language sql immutable strict set search_path = '' as $$
  select 6371000.0 * 2 * asin(sqrt(least(1.0,
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)
  )));
$$;
revoke all on function public.campus_distance_meters(double precision,double precision,double precision,double precision)
  from public, anon, authenticated;
grant execute on function public.campus_distance_meters(double precision,double precision,double precision,double precision)
  to service_role;

create function public.find_nearby_popup(p_lat double precision, p_lng double precision,
  p_within_meters double precision, p_since timestamptz, p_brand text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(p) - 'brand_normalized' from public.popups p
  where p.brand_normalized = lower(btrim(p_brand)) and p.status = 'live'
    and p.expires_at > now() and p.created_at between p_since and now()
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and p_within_meters > 0 and p_within_meters <= 100
    and public.campus_distance_meters(p_lat, p_lng, p.lat, p.lng) <= p_within_meters
  order by public.campus_distance_meters(p_lat, p_lng, p.lat, p.lng), p.id
  limit 1;
$$;
revoke all on function public.find_nearby_popup(double precision,double precision,double precision,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.find_nearby_popup(double precision,double precision,double precision,timestamptz,text)
  to service_role;

-- Serialize creation by normalized brand and recheck proximity inside the transaction.
-- Concurrent reports cannot create two live pins for the same nearby event.
create function public.create_popup(input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing jsonb;
  inserted public.popups;
  reporter uuid := (input->>'reporter_id')::uuid;
  latitude double precision := (input->>'lat')::double precision;
  longitude double precision := (input->>'lng')::double precision;
  brand_name text := btrim(input->>'brand');
  expiry timestamptz := (input->>'expires_at')::timestamptz;
begin
  if reporter is null or not exists (
    select 1 from auth.users u where u.id = reporter and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false) and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$'
  ) then raise exception 'Verified USC reporter required' using errcode = '42501'; end if;
  if latitude is null or longitude is null or expiry is null or brand_name is null
    or latitude not between -90 and 90 or longitude not between -180 and 180
    or char_length(brand_name) not between 1 and 80 or expiry <= now() then
    raise exception 'Invalid popup input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(brand_name), 0));
  existing := public.find_nearby_popup(latitude, longitude, 100, now() - interval '2 hours', brand_name);
  if existing is not null then return existing; end if;
  insert into public.popups (lat,lng,brand,freebies,sticker,expires_at)
  values (latitude, longitude, brand_name,
    array(select jsonb_array_elements_text(input->'freebies')), input->'sticker', least(expiry, now() + interval '30 minutes'))
  returning * into inserted;
  insert into public.reports (popup_id,user_id) values (inserted.id,reporter);
  return to_jsonb(inserted) - 'brand_normalized';
end;
$$;
revoke all on function public.create_popup(jsonb) from public, anon, authenticated;
grant execute on function public.create_popup(jsonb) to service_role;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'popups') then
    alter publication supabase_realtime add table public.popups;
  end if;
end $$;

commit;
