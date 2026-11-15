-- Quest parties are private. Only checked, service-only RPCs can change them.
begin;

create table public.quest_parties (
  owner_id uuid not null,
  quest_id text not null,
  frozen_at timestamptz,
  frozen_size smallint check (frozen_size between 0 and 3),
  primary key(owner_id,quest_id),
  foreign key(owner_id,quest_id) references public.quest_acceptances(user_id,quest_id) on delete cascade,
  check ((frozen_at is null) = (frozen_size is null))
);
create table public.quest_party_members (
  owner_id uuid not null,
  quest_id text not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('invited','joined','declined')),
  invited_at timestamptz not null default clock_timestamp(),
  responded_at timestamptz,
  primary key(owner_id,quest_id,member_id),
  foreign key(owner_id,quest_id) references public.quest_parties(owner_id,quest_id) on delete cascade,
  check(owner_id<>member_id)
);
create index quest_party_incoming_idx on public.quest_party_members(member_id,invited_at desc) where status='invited';
create index quest_party_joined_idx on public.quest_party_members(member_id,quest_id) where status='joined';
alter table public.quest_parties enable row level security;
alter table public.quest_party_members enable row level security;
revoke all on public.quest_parties,public.quest_party_members from public,anon,authenticated,service_role;
grant select on public.quest_parties,public.quest_party_members to service_role;

alter table public.catches add column rarity text check(rarity in ('common','rare','epic','legendary','exclusive'));
alter table public.catches add column copies smallint not null default 1 check(copies in (1,2));
alter table public.catches add column party_size smallint not null default 0 check(party_size between 0 and 3);
create unique index catches_one_quest_reward_idx on public.catches(user_id,source_id) where source='quest';

-- Serialize membership and reward grants for a quest, including overlapping parties.
-- This also prevents concurrent invite requests from reserving the fourth seat.
create function public.lock_quest_parties(p_quest_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_quest_id is null or char_length(p_quest_id) not between 1 and 120
    or p_quest_id<>btrim(p_quest_id) or p_quest_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid quest ID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quest-party:'||p_quest_id,0));
end;
$$;

create function public.quest_party_json(p_owner_id uuid,p_quest_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('quest_id',p_quest_id,'owner_id',p_owner_id,'members',
    coalesce((select jsonb_agg(jsonb_build_object('user_id',m.member_id,'display_name',p.display_name,'status',m.status)
      order by m.invited_at,m.member_id) from public.quest_party_members m
      join public.profiles p on p.user_id=m.member_id
      where m.owner_id=p_owner_id and m.quest_id=p_quest_id and m.status in ('invited','joined')),'[]'::jsonb));
$$;

create function public.require_open_quest_party(p_owner_id uuid,p_quest_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare definition jsonb; reward public.stickers; availability text;
begin
  perform public.require_verified_usc_actor(p_owner_id);
  select q.quest_definition into definition from public.quest_acceptances q
    where q.user_id=p_owner_id and q.quest_id=p_quest_id;
  if not found then raise exception 'Accept the quest first' using errcode='PT409'; end if;
  insert into public.quest_parties(owner_id,quest_id) values(p_owner_id,p_quest_id) on conflict do nothing;
  perform 1 from public.quest_parties p where p.owner_id=p_owner_id and p.quest_id=p_quest_id for update;
  if exists(select 1 from public.quest_parties p where p.owner_id=p_owner_id and p.quest_id=p_quest_id and p.frozen_at is not null)
    or exists(select 1 from public.catches c where c.source='quest' and c.source_id=p_quest_id and
      (c.user_id=p_owner_id or c.user_id in(select m.member_id from public.quest_party_members m
        where m.owner_id=p_owner_id and m.quest_id=p_quest_id and m.status='joined'))) then
    raise exception 'Party completed' using errcode='PT410';
  end if;
  select * into reward from public.stickers s where s.key=definition->>'reward_sticker_key';
  if not found then raise exception 'Reward not seeded' using errcode='PT503'; end if;
  availability:=public.sticker_availability(reward.rarity,reward.available_from,reward.available_until,clock_timestamp());
  if availability='upcoming' then raise exception 'Quest not started' using errcode='PT409'; end if;
  if availability='ended' then raise exception 'Quest ended' using errcode='PT410'; end if;
  return definition;
end;
$$;

create function public.read_quest_party(p_user_id uuid,p_quest_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_verified_usc_actor(p_user_id);
  if not exists(select 1 from public.quest_acceptances q where q.user_id=p_user_id and q.quest_id=p_quest_id) then
    raise exception 'Quest not accepted' using errcode='PT404';
  end if;
  return public.quest_party_json(p_user_id,p_quest_id);
end;
$$;

create function public.invite_to_quest(p_user_id uuid,p_quest_id text,p_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing text;
begin
  perform public.require_verified_usc_actor(p_user_id);
  perform public.lock_quest_parties(p_quest_id);
  perform public.require_open_quest_party(p_user_id,p_quest_id);
  if p_user_id=p_member_id then raise exception 'Cannot invite self' using errcode='22023'; end if;
  if not exists(select 1 from public.friends f join public.profiles p on p.user_id=f.friend_id
    join auth.users u on u.id=p.user_id where f.user_id=p_user_id and f.friend_id=p_member_id
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$') then
    raise exception 'Friend not found' using errcode='PT404';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_user_id) then
    raise exception 'Save profile first' using errcode='PT409';
  end if;
  if exists(select 1 from public.catches c where c.user_id=p_member_id and c.source='quest' and c.source_id=p_quest_id) then
    raise exception 'Friend already completed quest' using errcode='PT410';
  end if;
  select m.status into existing from public.quest_party_members m
    where m.owner_id=p_user_id and m.quest_id=p_quest_id and m.member_id=p_member_id;
  if existing in ('invited','joined') then return public.quest_party_json(p_user_id,p_quest_id); end if;
  if (select count(*) from public.quest_party_members m where m.owner_id=p_user_id and m.quest_id=p_quest_id
    and m.status in ('invited','joined'))>=3 then raise exception 'Party full' using errcode='PT409'; end if;
  insert into public.quest_party_members(owner_id,quest_id,member_id,status)
    values(p_user_id,p_quest_id,p_member_id,'invited') on conflict(owner_id,quest_id,member_id)
    do update set status='invited',invited_at=clock_timestamp(),responded_at=null;
  return public.quest_party_json(p_user_id,p_quest_id);
end;
$$;

create function public.respond_quest_invite(p_user_id uuid,p_quest_id text,p_owner_id uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation public.quest_party_members; definition jsonb; accepted jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_accept is null then raise exception 'Response required' using errcode='22023'; end if;
  perform public.lock_quest_parties(p_quest_id);
  select * into invitation from public.quest_party_members m where m.owner_id=p_owner_id
    and m.quest_id=p_quest_id and m.member_id=p_user_id for update;
  if not found then raise exception 'Invitation not found' using errcode='PT404'; end if;
  definition:=public.require_open_quest_party(p_owner_id,p_quest_id);
  if exists(select 1 from public.catches c where c.user_id=p_user_id and c.source='quest' and c.source_id=p_quest_id) then
    raise exception 'Quest already completed' using errcode='PT410';
  end if;
  -- Retries of the same response are safe; a declined invite needs a fresh invitation.
  if (invitation.status='joined' and p_accept) or (invitation.status='declined' and not p_accept) then
    return public.quest_party_json(p_owner_id,p_quest_id);
  end if;
  if invitation.status<>'invited' then raise exception 'Invite already answered' using errcode='PT409'; end if;
  if p_accept then
    if not exists(select 1 from public.friends f where f.user_id=p_owner_id and f.friend_id=p_user_id) then
      raise exception 'Friend not found' using errcode='PT404';
    end if;
    perform public.accept_authored_quest(p_user_id,definition);
    select q.quest_definition into accepted from public.quest_acceptances q where q.user_id=p_user_id and q.quest_id=p_quest_id;
    if accepted->'spot_ids' is distinct from definition->'spot_ids'
      or accepted->>'reward_sticker_key' is distinct from definition->>'reward_sticker_key' then
      raise exception 'Different quest edition already accepted' using errcode='PT409';
    end if;
  end if;
  update public.quest_party_members set status=case when p_accept then 'joined' else 'declined' end,
    responded_at=clock_timestamp() where owner_id=p_owner_id and quest_id=p_quest_id and member_id=p_user_id;
  return public.quest_party_json(p_owner_id,p_quest_id);
end;
$$;

create function public.remove_quest_party_member(p_user_id uuid,p_quest_id text,p_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.require_verified_usc_actor(p_user_id);
  perform public.lock_quest_parties(p_quest_id);
  perform public.require_open_quest_party(p_user_id,p_quest_id);
  delete from public.quest_party_members where owner_id=p_user_id and quest_id=p_quest_id and member_id=p_member_id;
  return public.quest_party_json(p_user_id,p_quest_id);
end;
$$;

create function public.list_quest_invites(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  select coalesce(jsonb_agg(jsonb_build_object('quest_id',m.quest_id,'quest_title',q.quest_definition->>'title',
    'invited_at',m.invited_at,'from',jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,
      'friend_code',upper(btrim(p.friend_code)))) order by m.invited_at desc,m.owner_id),'[]'::jsonb)
    into result from public.quest_party_members m
    join public.quest_parties party on party.owner_id=m.owner_id and party.quest_id=m.quest_id
    join public.quest_acceptances q on q.user_id=m.owner_id and q.quest_id=m.quest_id
    join public.profiles p on p.user_id=m.owner_id join auth.users u on u.id=p.user_id
    join public.stickers s on s.key=q.quest_definition->>'reward_sticker_key'
    where m.member_id=p_user_id and m.status='invited' and party.frozen_at is null
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$'
      and exists(select 1 from public.friends f where f.user_id=m.owner_id and f.friend_id=p_user_id)
      and public.sticker_availability(s.rarity,s.available_from,s.available_until,now())='available'
      and not exists(select 1 from public.catches c where c.source='quest' and c.source_id=m.quest_id
        and (c.user_id in (m.owner_id,p_user_id) or c.user_id in(select joined.member_id from public.quest_party_members joined
          where joined.owner_id=m.owner_id and joined.quest_id=m.quest_id and joined.status='joined')));
  return result;
end;
$$;

-- Internal reward support: largest containing party, not the sum of overlapping groups.
create function public.quest_party_size(p_user_id uuid,p_quest_id text) returns integer
language sql stable security definer set search_path='' as $$
  select coalesce(max(coalesce(p.frozen_size,(select count(*)::smallint from public.quest_party_members m
    where m.owner_id=p.owner_id and m.quest_id=p.quest_id and m.status='joined'))),0)::integer
  from public.quest_parties p where p.quest_id=p_quest_id and (p.owner_id=p_user_id or exists(
    select 1 from public.quest_party_members m where m.owner_id=p.owner_id and m.quest_id=p.quest_id
      and m.member_id=p_user_id and m.status='joined'));
$$;

-- Runs only when a trusted completion implementation actually inserts a quest reward.
-- No new claim route or completion policy is introduced by this migration.
create function public.apply_quest_party_reward() returns trigger
language plpgsql security definer set search_path='' as $$
declare definition jsonb; reward public.stickers; availability text; bump boolean; effective text;
begin
  if new.source<>'quest' then return new; end if;
  perform public.require_verified_usc_actor(new.user_id);
  perform public.lock_quest_parties(new.source_id);
  select q.quest_definition into definition from public.quest_acceptances q where q.user_id=new.user_id and q.quest_id=new.source_id;
  if not found then raise exception 'Quest not accepted' using errcode='PT409'; end if;
  -- Reward retry must not reroll an existing persisted outcome (including INSERT retries).
  if exists(select 1 from public.catches c where c.user_id=new.user_id and c.source='quest' and c.source_id=new.source_id) then
    return null;
  end if;
  select * into reward from public.stickers s where s.key=definition->>'reward_sticker_key' for share;
  if not found then raise exception 'Reward not seeded' using errcode='PT503'; end if;
  availability:=public.sticker_availability(reward.rarity,reward.available_from,reward.available_until,clock_timestamp());
  if availability='upcoming' then raise exception 'Quest not started' using errcode='PT409'; end if;
  if availability='ended' then raise exception 'Quest ended' using errcode='PT410'; end if;
  insert into public.quest_parties(owner_id,quest_id) values(new.user_id,new.source_id) on conflict do nothing;
  new.party_size:=public.quest_party_size(new.user_id,new.source_id);
  -- Freeze every party containing this traveller before recording their independent roll.
  update public.quest_parties p set frozen_at=clock_timestamp(),frozen_size=(
    select count(*)::smallint from public.quest_party_members m where m.owner_id=p.owner_id and m.quest_id=p.quest_id and m.status='joined')
    where p.quest_id=new.source_id and p.frozen_at is null and (p.owner_id=new.user_id or exists(
      select 1 from public.quest_party_members m where m.owner_id=p.owner_id and m.quest_id=p.quest_id and m.member_id=new.user_id and m.status='joined'));
  bump:=new.party_size>=3 or (new.party_size>0 and random()<case new.party_size when 1 then .25 else .75 end);
  effective:=case when bump then case reward.rarity when 'common' then 'rare' when 'rare' then 'epic'
    when 'epic' then 'legendary' else reward.rarity end else reward.rarity end;
  new.rarity:=effective;
  new.copies:=case when new.party_size=3 and random()<.5 then 2 else 1 end;
  new.variant:='special';
  return new;
end;
$$;
create trigger catches_quest_party_reward before insert on public.catches for each row execute function public.apply_quest_party_reward();

create function public.protect_quest_reward_outcome() returns trigger
language plpgsql set search_path='' as $$
begin
  if (old.source='quest' or new.source='quest') and new is distinct from old then
    raise exception 'Quest reward outcomes are immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger catches_quest_reward_immutable before update on public.catches
  for each row execute function public.protect_quest_reward_outcome();

revoke all on function public.lock_quest_parties(text),public.quest_party_json(uuid,text),public.require_open_quest_party(uuid,text),
  public.quest_party_size(uuid,text),public.apply_quest_party_reward(),public.protect_quest_reward_outcome(),public.read_quest_party(uuid,text),
  public.invite_to_quest(uuid,text,uuid),public.respond_quest_invite(uuid,text,uuid,boolean),
  public.remove_quest_party_member(uuid,text,uuid),public.list_quest_invites(uuid) from public,anon,authenticated;
grant execute on function public.read_quest_party(uuid,text),public.invite_to_quest(uuid,text,uuid),
  public.respond_quest_invite(uuid,text,uuid,boolean),public.remove_quest_party_member(uuid,text,uuid),
  public.list_quest_invites(uuid) to service_role;

-- Include the immutable outcome in friend books; authorization stays directed and private.
create or replace function public.read_friend_catches(p_user_id uuid,p_friend_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  perform 1 from public.friends f join public.profiles p on p.user_id=f.friend_id join auth.users u on u.id=p.user_id
    where f.user_id=p_user_id and f.friend_id=p_friend_id and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$' for share of f;
  if not found then raise exception 'Friend not found' using errcode='PT404'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'source',c.source,'source_id',c.source_id,'variant',c.variant,'caught_at',c.caught_at)
    ||case when c.source='quest' then jsonb_strip_nulls(jsonb_build_object('rarity',c.rarity,'copies',c.copies,'party_size',c.party_size)) else '{}'::jsonb end
    order by c.caught_at desc,c.id),'[]'::jsonb) into result from public.catches c where c.user_id=p_friend_id;
  return result;
end;
$$;
commit;
