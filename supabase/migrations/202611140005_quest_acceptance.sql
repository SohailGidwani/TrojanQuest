-- Apply after 001-004. Quest definitions remain authored JSON, not an editable quests table.
begin;

create table public.quest_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null check (char_length(quest_id) between 1 and 120),
  accepted_at timestamptz not null default clock_timestamp(),
  quest_definition jsonb not null check (jsonb_typeof(quest_definition)='object'
    and quest_definition ?& array['id','title','blurb','spot_ids','reward_sticker_key']
    and jsonb_typeof(quest_definition->'id')='string'
    and quest_definition->>'id'=quest_id),
  primary key (user_id,quest_id)
);
create index quest_acceptances_user_time_idx on public.quest_acceptances(user_id,accepted_at desc);
alter table public.quest_acceptances enable row level security;
revoke all on public.quest_acceptances from public,anon,authenticated,service_role;
grant select on public.quest_acceptances to authenticated;
grant select,insert on public.quest_acceptances to service_role;
create policy quest_acceptances_read_own on public.quest_acceptances for select to authenticated
  using ((select public.is_verified_usc_user()) and user_id=(select auth.uid()));

create function public.list_quest_acceptances(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  select coalesce(jsonb_agg(jsonb_build_object('quest_id',q.quest_id,'accepted_at',q.accepted_at)
    order by q.accepted_at desc,q.quest_id),'[]'::jsonb)
    into result from public.quest_acceptances q where q.user_id=p_user_id;
  return result;
end;
$$;
revoke all on function public.list_quest_acceptances(uuid) from public,anon,authenticated;
grant execute on function public.list_quest_acceptances(uuid) to service_role;

-- p_quest comes only from the server's authored file, never from a request body.
create function public.accept_authored_quest(p_user_id uuid,p_quest jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  id text;
  stop_ids text[];
  definition public.stickers;
  accepted public.quest_acceptances;
  matched integer;
  inserted integer;
  availability text;
  action_at timestamptz;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_quest is null or jsonb_typeof(p_quest) is distinct from 'object'
    or jsonb_typeof(p_quest->'id') is distinct from 'string'
    or jsonb_typeof(p_quest->'title') is distinct from 'string'
    or jsonb_typeof(p_quest->'blurb') is distinct from 'string'
    or jsonb_typeof(p_quest->'reward_sticker_key') is distinct from 'string'
    or jsonb_typeof(p_quest->'spot_ids') is distinct from 'array' then
    raise exception 'Invalid quest definition' using errcode = '22023';
  end if;
  id := p_quest->>'id';
  if char_length(id) not between 1 and 120 or id<>btrim(id) or id ~ '[[:cntrl:]]'
    or char_length(btrim(p_quest->>'title')) not between 1 and 200
    or char_length(p_quest->>'blurb')>2000
    or (p_quest->>'reward_sticker_key') !~ '^[a-z0-9-]{1,60}$'
    or jsonb_array_length(p_quest->'spot_ids') not between 3 and 5 then
    raise exception 'Invalid quest definition' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_quest->'spot_ids') x where jsonb_typeof(x) <> 'string') then
    raise exception 'Invalid quest stops' using errcode = '22023';
  end if;
  stop_ids := array(select jsonb_array_elements_text(p_quest->'spot_ids'));
  if (select count(distinct s) from unnest(stop_ids) s)<>cardinality(stop_ids)
    or exists(select 1 from unnest(stop_ids) s where char_length(s) not between 1 and 120
      or s<>btrim(s) or s ~ '[[:cntrl:]]') then
    raise exception 'Invalid quest stops' using errcode = '22023';
  end if;

  select * into accepted from public.quest_acceptances q where q.user_id=p_user_id and q.quest_id=id;
  if found then
    return jsonb_build_object('quest_id',accepted.quest_id,'accepted_at',accepted.accepted_at,'already_accepted',true);
  end if;
  -- Same spot-then-catalogue lock order as collection and seed imports.
  perform s.id from public.spots s where s.id=any(stop_ids) order by s.id for share;
  get diagnostics matched = row_count;
  if matched<>cardinality(stop_ids) then
    raise exception 'Quest spots are not seeded' using errcode = 'PT503';
  end if;
  perform d.key from public.stickers d where d.key=p_quest->>'reward_sticker_key'
    or d.key in(select s.sticker_key from public.spots s where s.id=any(stop_ids)) order by d.key for share;
  if exists(select 1 from public.spots s where s.id=any(stop_ids)
    and not exists(select 1 from public.stickers d where d.key=s.sticker_key)) then
    raise exception 'Quest stop stickers are not seeded' using errcode = 'PT503';
  end if;
  select * into definition from public.stickers where key=p_quest->>'reward_sticker_key';
  if not found then raise exception 'Quest reward is not seeded' using errcode = 'PT503'; end if;
  action_at := clock_timestamp();
  availability := public.sticker_availability(definition.rarity,definition.available_from,definition.available_until,action_at);
  if availability='upcoming' then raise exception 'Quest reward is upcoming' using errcode = 'PT409'; end if;
  if availability='ended' then raise exception 'Quest reward has ended' using errcode = 'PT410'; end if;

  insert into public.quest_acceptances(user_id,quest_id,accepted_at,quest_definition)
    values(p_user_id,id,action_at,jsonb_build_object('id',id,'title',p_quest->>'title','blurb',p_quest->>'blurb',
      'spot_ids',p_quest->'spot_ids','reward_sticker_key',p_quest->>'reward_sticker_key'))
    on conflict(user_id,quest_id) do nothing returning * into accepted;
  get diagnostics inserted = row_count;
  if inserted=0 then
    select * into accepted from public.quest_acceptances q where q.user_id=p_user_id and q.quest_id=id;
  end if;
  return jsonb_build_object('quest_id',accepted.quest_id,'accepted_at',accepted.accepted_at,'already_accepted',inserted=0);
end;
$$;
revoke all on function public.accept_authored_quest(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.accept_authored_quest(uuid,jsonb) to service_role;

-- Acceptance does not change catches, grant rewards, or decide order/photo-proof semantics.
commit;
