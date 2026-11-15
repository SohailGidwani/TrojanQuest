-- Apply after 202611140001_backend_foundation.sql. No user location history is stored.
begin;

create table public.popup_confirmations (
  popup_id uuid not null references public.popups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (popup_id, user_id)
);
create index popup_confirmations_user_idx on public.popup_confirmations(user_id);
alter table public.popup_confirmations enable row level security;
revoke all on public.popup_confirmations from public, anon, authenticated;
grant all on public.popup_confirmations to service_role;
-- Existing first reporters already account for the initial confirmation count.
insert into public.popup_confirmations(popup_id, user_id)
  select distinct popup_id, user_id from public.reports where user_id is not null
  on conflict do nothing;

create function public.campus_spot_variant(p_at timestamptz) returns text
language sql stable strict set search_path = '' as $$
  select case
    when extract(hour from p_at at time zone 'America/Los_Angeles') >= 6
      and extract(hour from p_at at time zone 'America/Los_Angeles') < 11 then 'morning'
    when extract(hour from p_at at time zone 'America/Los_Angeles') >= 11
      and extract(hour from p_at at time zone 'America/Los_Angeles') < 17 then 'day'
    else 'night' end;
$$;
revoke all on function public.campus_spot_variant(timestamptz) from public, anon, authenticated;
grant execute on function public.campus_spot_variant(timestamptz) to service_role;

create function public.catch_sticker(p_user_id uuid, p_source text, p_source_id text,
  p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  spot public.spots;
  popup public.popups;
  org public.org_drops;
  target_lat double precision;
  target_lng double precision;
  variant_name text;
  award jsonb;
  action_at timestamptz;
  inserted integer;
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$') then
    raise exception 'Verified USC account required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_source is null or p_source not in ('spot','popup','org','quest')
    or p_source_id is null or char_length(btrim(p_source_id)) not between 1 and 120 then
    raise exception 'Invalid catch input' using errcode = '22023';
  end if;
  if p_source = 'quest' then return jsonb_build_object('ok',false,'reason','quest_not_available'); end if;

  -- Lock the source while checking eligibility; the client cannot pick art or a variant.
  if p_source = 'spot' then
    select * into spot from public.spots where id = p_source_id for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    action_at := clock_timestamp();
    target_lat := spot.lat; target_lng := spot.lng;
    variant_name := public.campus_spot_variant(action_at);
    award := jsonb_build_object('key',spot.sticker_key,'name',spot.name,'source','spot','variant',variant_name);
  elsif p_source = 'popup' then
    select * into popup from public.popups where id = p_source_id::uuid for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    action_at := clock_timestamp();
    if popup.status <> 'live' or popup.expires_at <= action_at then
      return jsonb_build_object('ok',false,'reason','expired');
    end if;
    target_lat := popup.lat; target_lng := popup.lng;
    variant_name := 'special';
    award := popup.sticker;
  else
    select * into org from public.org_drops where id = p_source_id for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    action_at := clock_timestamp();
    if org.starts_at > action_at then return jsonb_build_object('ok',false,'reason','not_started'); end if;
    if org.ends_at <= action_at then return jsonb_build_object('ok',false,'reason','expired'); end if;
    target_lat := org.lat; target_lng := org.lng;
    variant_name := 'special';
    award := jsonb_build_object('key',org.sticker_key,'name',org.event_name,'source','org','variant','special');
  end if;
  if public.campus_distance_meters(p_lat,p_lng,target_lat,target_lng) > 50 then
    return jsonb_build_object('ok',false,'reason','too_far');
  end if;
  insert into public.catches(user_id,source,source_id,variant,caught_at)
    values (p_user_id,p_source,p_source_id,variant_name,action_at)
    on conflict (user_id,source,source_id,variant) do nothing;
  get diagnostics inserted = row_count;
  return jsonb_build_object('ok',true,'sticker',award,'variant',variant_name,'already_caught',inserted = 0);
end;
$$;
revoke all on function public.catch_sticker(uuid,text,text,double precision,double precision)
  from public, anon, authenticated;
grant execute on function public.catch_sticker(uuid,text,text,double precision,double precision) to service_role;

create function public.confirm_popup(p_user_id uuid, p_popup_id uuid,
  p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  popup public.popups;
  action_at timestamptz;
  inserted integer;
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$') then
    raise exception 'Verified USC account required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_popup_id is null then raise exception 'Invalid confirmation input' using errcode = '22023'; end if;
  -- Serialize confirmations of this pin so simultaneous students cannot lose an increment.
  select * into popup from public.popups where id = p_popup_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  action_at := clock_timestamp();
  if popup.status <> 'live' or popup.expires_at <= action_at then
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if public.campus_distance_meters(p_lat,p_lng,popup.lat,popup.lng) > 50 then
    return jsonb_build_object('ok',false,'reason','too_far');
  end if;
  insert into public.popup_confirmations(popup_id,user_id,confirmed_at)
    values (p_popup_id,p_user_id,action_at) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.popups set expires_at = expires_at + interval '30 minutes', confirmations = confirmations + 1
      where id = p_popup_id returning * into popup;
  end if;
  return jsonb_build_object('ok',true,'expires_at',popup.expires_at,'confirmations',popup.confirmations,
    'already_confirmed',inserted = 0);
end;
$$;
revoke all on function public.confirm_popup(uuid,uuid,double precision,double precision) from public, anon, authenticated;
grant execute on function public.confirm_popup(uuid,uuid,double precision,double precision) to service_role;

-- Preserve the original AI helper contract and record the reporter's initial confirmation.
create or replace function public.create_popup(input jsonb) returns jsonb
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
  insert into public.popup_confirmations (popup_id,user_id) values (inserted.id,reporter);
  return to_jsonb(inserted) - 'brand_normalized';
end;
$$;
revoke all on function public.create_popup(jsonb) from public, anon, authenticated;
grant execute on function public.create_popup(jsonb) to service_role;

commit;
