-- Apply after migrations 001-003. Authored editions are separate from AI popup art.
begin;

create table public.stickers (
  key text primary key check (key ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  rarity text not null check (rarity in ('common','rare','epic','legendary','exclusive')),
  tags text[] not null default '{}' check (cardinality(tags) <= 30 and array_position(tags,null) is null),
  image text check (char_length(image) <= 255 and image ~* '^[a-z0-9_][a-z0-9_.-]*[.](svg|png|webp)$'),
  art text check (art in ('bubble','star','book','bowl','leaf','bolt','heart','flag')),
  lore text check (char_length(lore) <= 500),
  available_from timestamptz check (isfinite(available_from)),
  available_until timestamptz check (isfinite(available_until)),
  check ((rarity = 'exclusive' and available_until is not null) or
    (rarity <> 'exclusive' and available_from is null and available_until is null)),
  check (available_from is null or available_from < available_until)
);
alter table public.stickers enable row level security;
revoke all on public.stickers from public, anon, authenticated, service_role;
grant select on public.stickers to authenticated;
grant select,insert,update on public.stickers to service_role;
create policy stickers_read_usc on public.stickers for select to authenticated
  using ((select public.is_verified_usc_user()));

create function public.protect_sticker_edition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key is distinct from old.key then
    raise exception 'Sticker keys cannot be renamed' using errcode = '22023';
  end if;
  if old.rarity = 'exclusive' and (new.rarity <> 'exclusive' or
    (old.available_until <= clock_timestamp() and
      (new.available_until is null or new.available_until > old.available_until))) then
    raise exception 'Exclusive edition cannot be reopened or lose exclusivity' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_sticker_edition() from public,anon,authenticated;
create trigger protect_sticker_edition before update on public.stickers
  for each row execute function public.protect_sticker_edition();

create function public.sticker_availability(p_rarity text, p_from timestamptz,
  p_until timestamptz, p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select case when p_rarity <> 'exclusive' then 'available'
    when p_until is null or p_at is null then 'ended'
    when p_at >= p_until then 'ended'
    when p_at < p_from then 'upcoming' else 'available' end;
$$;
revoke all on function public.sticker_availability(text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sticker_availability(text,timestamptz,timestamptz,timestamptz) to service_role;

-- One transaction for validated definitions and their spots. Never deletes absent rows.
create function public.seed_sticker_catalogue(p_stickers jsonb, p_spots jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare sticker_count integer; spot_count integer := 0;
begin
  if p_stickers is null or jsonb_typeof(p_stickers) <> 'array' or jsonb_array_length(p_stickers) = 0 then
    raise exception 'Expected a nonempty sticker array' using errcode = '22023';
  end if;
  if p_spots is not null and jsonb_typeof(p_spots) <> 'array' then
    raise exception 'Expected a spots array' using errcode = '22023';
  end if;
  -- Match catch's spot-then-definition lock order when updating existing places.
  if p_spots is not null then
    perform s.id from public.spots s where s.id in (select x.id from jsonb_to_recordset(p_spots) as x(id text))
      order by s.id for update;
  end if;
  insert into public.stickers(key,name,rarity,tags,image,art,lore,available_from,available_until)
    select x.key,x.name,x.rarity,x.tags,x.image,x.art,x.lore,x.available_from,x.available_until
    from jsonb_to_recordset(p_stickers) as x(key text,name text,rarity text,tags text[],image text,
      art text,lore text,available_from timestamptz,available_until timestamptz) order by x.key
    on conflict (key) do update set name=excluded.name,rarity=excluded.rarity,tags=excluded.tags,
      image=excluded.image,art=excluded.art,lore=excluded.lore,
      available_from=excluded.available_from,available_until=excluded.available_until;
  get diagnostics sticker_count = row_count;
  if p_spots is not null then
    if exists (select 1 from jsonb_to_recordset(p_spots) as s(sticker_key text)
      where not exists (select 1 from public.stickers d where d.key=s.sticker_key)) then
      raise exception 'Spot refers to a missing sticker' using errcode = '22023';
    end if;
    insert into public.spots(id,name,lat,lng,category,card_text,tip,sticker_key)
      select x.id,x.name,x.lat,x.lng,x.category,x.card_text,x.tip,x.sticker_key
      from jsonb_to_recordset(p_spots) as x(id text,name text,lat double precision,lng double precision,
        category text,card_text text,tip text,sticker_key text) order by x.id
      on conflict (id) do update set name=excluded.name,lat=excluded.lat,lng=excluded.lng,
        category=excluded.category,card_text=excluded.card_text,tip=excluded.tip,sticker_key=excluded.sticker_key;
    get diagnostics spot_count = row_count;
  end if;
  return jsonb_build_object('stickers',sticker_count,'spots',spot_count);
end;
$$;
revoke all on function public.seed_sticker_catalogue(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.seed_sticker_catalogue(jsonb,jsonb) to service_role;

create or replace function public.catch_sticker(p_user_id uuid, p_source text, p_source_id text,
  p_lat double precision, p_lng double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  spot public.spots;
  popup public.popups;
  org public.org_drops;
  definition public.stickers;
  sticker_key text;
  target_lat double precision;
  target_lng double precision;
  variant_name text;
  award jsonb;
  action_at timestamptz;
  inserted integer;
  availability text;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_source is null or p_source not in ('spot','popup','org','quest')
    or p_source_id is null or char_length(btrim(p_source_id)) not between 1 and 120 then
    raise exception 'Invalid catch input' using errcode = '22023';
  end if;
  if p_source = 'quest' then return jsonb_build_object('ok',false,'reason','quest_not_available'); end if;

  if p_source = 'spot' then
    select * into spot from public.spots where id=p_source_id for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    target_lat := spot.lat; target_lng := spot.lng; sticker_key := spot.sticker_key;
  elsif p_source = 'popup' then
    select * into popup from public.popups where id=p_source_id::uuid for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    target_lat := popup.lat; target_lng := popup.lng;
  else
    select * into org from public.org_drops where id=p_source_id for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    target_lat := org.lat; target_lng := org.lng; sticker_key := org.sticker_key;
  end if;

  if p_source <> 'popup' then
    select * into definition from public.stickers where key=sticker_key for share;
    if not found then raise exception 'Missing sticker catalogue definition' using errcode = 'PT503'; end if;
    if p_source = 'org' and definition.rarity <> 'exclusive' then
      raise exception 'Org drops require an exclusive sticker definition' using errcode = 'PT503';
    end if;
  end if;
  -- Read the clock after acquiring source AND catalogue locks, never from the request.
  action_at := clock_timestamp();
  if p_source = 'popup' then
    if popup.status <> 'live' or popup.expires_at <= action_at then
      return jsonb_build_object('ok',false,'reason','expired');
    end if;
    variant_name := 'special';
    award := popup.sticker || jsonb_build_object('rarity','exclusive',
      'available_from',popup.created_at,'available_until',popup.expires_at);
  else
    availability := public.sticker_availability(definition.rarity,
      case when p_source='org' then greatest(org.starts_at,definition.available_from) else definition.available_from end,
      case when p_source='org' then least(org.ends_at,definition.available_until) else definition.available_until end,action_at);
    if availability = 'upcoming' then return jsonb_build_object('ok',false,'reason','not_started'); end if;
    if availability = 'ended' then return jsonb_build_object('ok',false,'reason','expired'); end if;
    variant_name := case when p_source='spot' then public.campus_spot_variant(action_at) else 'special' end;
    award := jsonb_strip_nulls(to_jsonb(definition)) || jsonb_build_object('source',p_source,'variant',variant_name);
    if p_source = 'org' then
      award := award || jsonb_build_object('available_from',greatest(org.starts_at,definition.available_from),
        'available_until',least(org.ends_at,definition.available_until));
    end if;
  end if;
  if public.campus_distance_meters(p_lat,p_lng,target_lat,target_lng) > 50 then
    return jsonb_build_object('ok',false,'reason','too_far');
  end if;
  insert into public.catches(user_id,source,source_id,variant,caught_at)
    values(p_user_id,p_source,p_source_id,variant_name,action_at)
    on conflict(user_id,source,source_id,variant) do nothing;
  get diagnostics inserted = row_count;
  return jsonb_build_object('ok',true,'sticker',award,'variant',variant_name,'already_caught',inserted=0);
end;
$$;
revoke all on function public.catch_sticker(uuid,text,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.catch_sticker(uuid,text,text,double precision,double precision) to service_role;

commit;
