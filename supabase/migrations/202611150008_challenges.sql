-- Challenges are always pending until a separately provisioned team reviewer approves.
-- No org, membership or reviewer is self-provisioned by these RPCs.
begin;

create function public.valid_challenge_palette(p jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when p is null or p='null'::jsonb then true
    when jsonb_typeof(p)<>'array' then false
    when jsonb_array_length(p)<>3 then false
    else not exists(select 1 from jsonb_array_elements(p) v
      where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^#[0-9a-fA-F]{6}$') end;
$$;
create function public.valid_challenge_sticker(p jsonb,p_max integer) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p)='object' and jsonb_typeof(p->'name')='string'
    and char_length(btrim(p->>'name')) between 1 and p_max
    and jsonb_typeof(p->'lore')='string' and char_length(p->>'lore')<=400
    and p->>'art' in ('book','bowl','leaf','star','bubble','bolt','heart','flag')
    and public.valid_challenge_palette(p->'colors'),false);
$$;
alter table public.stickers add column colors jsonb check(public.valid_challenge_palette(colors));

create table public.orgs (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(btrim(name)) between 1 and 80),
  approved boolean not null default false
);
create table public.org_members (
  org_id uuid not null references public.orgs(id), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','member')), primary key(org_id,user_id)
);
create table public.challenge_reviewers (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.challenges (
  id uuid primary key default gen_random_uuid(), author_kind text not null check(author_kind in ('student','org')),
  author_user_id uuid not null references auth.users(id), org_id uuid references public.orgs(id),
  "by" text not null check(char_length(btrim("by")) between 1 and 80),
  title text not null check(char_length(btrim(title)) between 1 and 60),
  blurb text not null check(char_length(blurb)<=280),
  reward jsonb not null check(public.valid_challenge_sticker(reward,40) and reward->>'rarity' in ('common','rare','epic')),
  status text not null default 'pending' check(status in ('pending','live','rejected','archived')),
  starts_at timestamptz not null default clock_timestamp(), ends_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(), reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz, review_note text check(char_length(review_note)<=400),
  check((author_kind='org')=(org_id is not null)),
  check(ends_at>starts_at and ends_at-starts_at<=case when author_kind='org' then interval '30 days' else interval '7 days' end)
);
create table public.challenge_stops (
  challenge_id uuid not null references public.challenges(id), position integer not null check(position between 1 and 8),
  name text not null check(char_length(btrim(name)) between 1 and 60), lore text not null check(char_length(lore)<=400),
  place jsonb not null, spot_id text not null,
  art text not null check(art in ('book','bowl','leaf','star','bubble','bolt','heart','flag')),
  colors jsonb check(public.valid_challenge_palette(colors)),
  primary key(challenge_id,position), unique(challenge_id,spot_id), unique(challenge_id,place)
);
create index challenge_stops_spot_idx on public.challenge_stops(spot_id);
create index challenges_listing_idx on public.challenges(status,ends_at);
create index challenges_author_idx on public.challenges(author_user_id,created_at);
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.challenge_reviewers enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_stops enable row level security;
revoke all on public.orgs,public.org_members,public.challenge_reviewers,public.challenges,public.challenge_stops
  from public,anon,authenticated,service_role;

create function public.challenge_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('id',c.id,'title',c.title,'blurb',c.blurb,'author',c.author_kind,
    'author_user_id',c.author_user_id,'org_id',c.org_id,'by',c."by",'status',c.status,'reward',c.reward,
    'created_at',c.created_at,'starts_at',c.starts_at,'ends_at',c.ends_at,'review_note',c.review_note,
    'stops',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name',s.name,'lore',s.lore,
      'place',s.place,'art',s.art,'colors',s.colors)) order by s.position)
      from public.challenge_stops s where s.challenge_id=c.id),'[]'::jsonb)))
  from public.challenges c where c.id=p_id;
$$;
create function public.list_challenge_orgs(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_verified_usc_actor(p_user_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role) order by o.name,o.id)
    from public.orgs o join public.org_members m on m.org_id=o.id where o.approved and m.user_id=p_user_id),'[]'::jsonb);
end;
$$;
create function public.list_challenges(p_user_id uuid,p_review boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_review is null then raise exception 'Invalid review filter' using errcode='22023'; end if;
  if p_review and not exists(select 1 from public.challenge_reviewers where user_id=p_user_id) then
    raise exception 'Reviewer required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(public.challenge_json(c.id) order by c.created_at desc,c.id)
    from public.challenges c where case when p_review then c.status='pending' else
      (c.status='live' and c.starts_at<=now() and c.ends_at>now()) or c.author_user_id=p_user_id end),'[]'::jsonb);
end;
$$;

create function public.create_challenge(p_user_id uuid,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid; author text; org uuid; display text; days integer; s jsonb; pos integer:=0; sid text;
  lat double precision; lng double precision; at_time timestamptz;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if jsonb_typeof(p_draft) is distinct from 'object' or jsonb_typeof(p_draft->'stops') is distinct from 'array'
    or jsonb_typeof(p_draft->'title') is distinct from 'string' or jsonb_typeof(p_draft->'blurb') is distinct from 'string'
    or jsonb_typeof(p_draft->'days') is distinct from 'number' then
    raise exception 'Invalid challenge draft' using errcode='22023';
  end if;
  author:=p_draft->>'author';
  if author is null or author not in ('student','org') or jsonb_array_length(p_draft->'stops') not between 1 and 8
    or not public.valid_challenge_sticker(p_draft->'reward',40)
    or coalesce(p_draft->'reward'->>'rarity','') not in ('common','rare','epic')
    or (p_draft->>'days') !~ '^(1|3|7|14|30)$' then
    raise exception 'Invalid challenge fields' using errcode='22023';
  end if;
  days:=(p_draft->>'days')::integer;
  if author='student' and (days>7 or p_draft->>'org_id' is not null) then
    raise exception 'Invalid student duration or org' using errcode='22023';
  end if;
  select display_name into display from public.profiles where user_id=p_user_id;
  if not found then raise exception 'Save a profile first' using errcode='PT409'; end if;
  if author='org' then
    org:=(p_draft->>'org_id')::uuid;
    select o.name into display from public.orgs o join public.org_members m on m.org_id=o.id
      where o.id=org and o.approved and m.user_id=p_user_id and m.role='admin' for share of o,m;
    if not found then raise exception 'Approved org admin required' using errcode='42501'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('challenge-author:'||p_user_id::text,0));
  if (select count(*) from public.challenges where author_user_id=p_user_id and status in ('pending','live') and ends_at>clock_timestamp())>=30 then
    raise exception 'Too many open challenges' using errcode='PT429';
  end if;
  at_time:=clock_timestamp();
  insert into public.challenges(author_kind,author_user_id,org_id,"by",title,blurb,reward,starts_at,ends_at)
    values(author,p_user_id,org,display,btrim(p_draft->>'title'),p_draft->>'blurb',p_draft->'reward',
      at_time,at_time+days*interval '1 day') returning id into cid;
  for s in select value from jsonb_array_elements(p_draft->'stops') loop
    pos:=pos+1;
    if not public.valid_challenge_sticker(s,60) then raise exception 'Invalid stop sticker' using errcode='22023'; end if;
    if s->'place'->>'kind'='campus' then
      sid:=s->'place'->>'spot_id';
      perform 1 from public.spots where id=sid and id not like 'cq-%' for share;
      if not found then raise exception 'Official place not found' using errcode='PT404'; end if;
    elsif s->'place'->>'kind'='point' then
      if jsonb_typeof(s->'place'->'lat') is distinct from 'number' or jsonb_typeof(s->'place'->'lng') is distinct from 'number' then
        raise exception 'Invalid pin' using errcode='22023';
      end if;
      lat:=(s->'place'->>'lat')::double precision; lng:=(s->'place'->>'lng')::double precision;
      if lat not between -90 and 90 or lng not between -180 and 180
        or public.campus_distance_meters(lat,lng,34.0205,-118.2856)>1500 then
        raise exception 'Pin outside campus area' using errcode='22023';
      end if;
      sid:='cq-'||cid::text||'-'||pos;
    else raise exception 'Invalid place kind' using errcode='22023'; end if;
    insert into public.challenge_stops(challenge_id,position,name,lore,place,spot_id,art,colors)
      values(cid,pos,btrim(s->>'name'),s->>'lore',s->'place',sid,s->>'art',s->'colors');
  end loop;
  return public.challenge_json(cid);
end;
$$;

create function public.review_challenge(p_user_id uuid,p_id uuid,p_review jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.challenges; s public.challenge_stops; state text;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if not exists(select 1 from public.challenge_reviewers where user_id=p_user_id) then
    raise exception 'Reviewer required' using errcode='42501'; end if;
  state:=p_review->>'status';
  if state is null or state not in ('live','rejected') or char_length(coalesce(p_review->>'reason',''))>400 then
    raise exception 'Invalid review' using errcode='22023'; end if;
  select * into c from public.challenges where id=p_id for update;
  if not found then raise exception 'Challenge not found' using errcode='PT404'; end if;
  if c.author_user_id=p_user_id then raise exception 'Another reviewer must review your challenge' using errcode='42501'; end if;
  if c.status=state then return public.challenge_json(p_id); end if;
  if c.status<>'pending' then raise exception 'Challenge already reviewed' using errcode='PT409'; end if;
  if c.ends_at<=clock_timestamp() then raise exception 'Challenge expired' using errcode='PT410'; end if;
  if state='live' then
    for s in select * from public.challenge_stops where challenge_id=p_id order by position loop
      if s.place->>'kind'='point' then
        insert into public.stickers(key,name,rarity,tags,art,lore,colors)
          values(s.spot_id,s.name,'common',array['challenge',lower(c."by")],s.art,s.lore,s.colors);
        insert into public.spots(id,name,lat,lng,category,card_text,tip,sticker_key)
          values(s.spot_id,s.name,(s.place->>'lat')::double precision,(s.place->>'lng')::double precision,
            'hangout',coalesce(nullif(s.lore,''),c.title),'Part of a limited-time challenge.',s.spot_id);
      else
        perform 1 from public.spots where id=s.spot_id for share;
        if not found then raise exception 'Place no longer available' using errcode='PT404'; end if;
      end if;
    end loop;
    insert into public.stickers(key,name,rarity,tags,art,lore,colors)
      values('cq-'||p_id::text||'-reward',c.reward->>'name',c.reward->>'rarity',array['challenge',lower(c."by")],
        c.reward->>'art',c.reward->>'lore',c.reward->'colors');
  end if;
  update public.challenges set status=state,reviewed_by=p_user_id,reviewed_at=clock_timestamp(),review_note=p_review->>'reason' where id=p_id;
  return public.challenge_json(p_id);
end;
$$;
create function public.archive_challenge(p_user_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.challenges;
begin
  perform public.require_verified_usc_actor(p_user_id);
  select * into c from public.challenges where id=p_id for update;
  if not found then raise exception 'Challenge not found' using errcode='PT404'; end if;
  if c.author_user_id<>p_user_id then raise exception 'Author required' using errcode='42501'; end if;
  update public.challenges set status='archived' where id=p_id;
  -- Never delete earned catches, spots or catalogue entries.
  return public.challenge_json(p_id);
end;
$$;

create or replace function public.require_live_challenge_quest(p_quest_id text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.challenges;
begin
  if p_quest_id not like 'cq-%' then return; end if;
  select * into c from public.challenges where id::text=substring(p_quest_id from 4) for share;
  if not found then raise exception 'Challenge not found' using errcode='PT404'; end if;
  if c.status<>'live' or c.ends_at<=clock_timestamp() then
    raise exception 'Challenge not live' using errcode='PT410'; end if;
  if c.starts_at>clock_timestamp() then raise exception 'Challenge not started' using errcode='PT409'; end if;
end;
$$;
create function public.accept_challenge(p_user_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare qid text:='cq-'||p_id::text; c public.challenges; definition jsonb; saved public.quest_acceptances; inserted integer;
begin
  perform public.require_verified_usc_actor(p_user_id);
  perform public.lock_quest_parties(qid);
  perform public.require_live_challenge_quest(qid);
  select * into c from public.challenges where id=p_id;
  definition:=jsonb_build_object('id',qid,'title',c.title,'blurb',c.blurb,
    'spot_ids',(select jsonb_agg(s.spot_id order by s.position) from public.challenge_stops s where s.challenge_id=p_id),
    'reward_sticker_key',qid||'-reward');
  insert into public.quest_acceptances(user_id,quest_id,quest_definition) values(p_user_id,qid,definition)
    on conflict(user_id,quest_id) do nothing returning * into saved;
  get diagnostics inserted=row_count;
  if inserted=0 then select * into saved from public.quest_acceptances where user_id=p_user_id and quest_id=qid; end if;
  return jsonb_build_object('quest_id',qid,'accepted_at',saved.accepted_at,'already_accepted',inserted=0);
end;
$$;

-- Parties can accept challenge snapshots with 1–8 stops without weakening authored-quest validation.
alter function public.accept_authored_quest(uuid,jsonb) rename to accept_authored_quest_catalogue;
revoke all on function public.accept_authored_quest_catalogue(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.accept_authored_quest(p_user_id uuid,p_quest jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_quest->>'id' like 'cq-%' then
    return public.accept_challenge(p_user_id,substring(p_quest->>'id' from 4)::uuid);
  end if;
  return public.accept_authored_quest_catalogue(p_user_id,p_quest);
end;
$$;
alter function public.require_open_quest_party(uuid,text) rename to require_open_quest_party_catalogue;
create function public.require_open_quest_party(p_owner_id uuid,p_quest_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.require_live_challenge_quest(p_quest_id);
  return public.require_open_quest_party_catalogue(p_owner_id,p_quest_id);
end;
$$;
alter function public.list_quest_invites(uuid) rename to list_quest_invites_catalogue;
revoke all on function public.list_quest_invites_catalogue(uuid) from public,anon,authenticated,service_role;
create function public.list_quest_invites(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return coalesce((select jsonb_agg(x) from jsonb_array_elements(public.list_quest_invites_catalogue(p_user_id)) x
    where x->>'quest_id' not like 'cq-%' or exists(select 1 from public.challenges c
      where c.id::text=substring(x->>'quest_id' from 4) and c.status='live' and c.starts_at<=now() and c.ends_at>now())),'[]'::jsonb);
end;
$$;
create function public.guard_challenge_catch() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  if new.source='quest' then perform public.require_live_challenge_quest(new.source_id);
  elsif new.source='spot' and new.source_id like 'cq-%' then
    select challenge_id into cid from public.challenge_stops where spot_id=new.source_id;
    if not found then raise exception 'Challenge stop not found' using errcode='PT404'; end if;
    perform public.require_live_challenge_quest('cq-'||cid::text);
  end if;
  return new;
end;
$$;
create trigger catches_challenge_guard before insert on public.catches for each row execute function public.guard_challenge_catch();

revoke all on function public.challenge_json(uuid),public.valid_challenge_palette(jsonb),public.valid_challenge_sticker(jsonb,integer),
 public.create_challenge(uuid,jsonb),public.review_challenge(uuid,uuid,jsonb),public.archive_challenge(uuid,uuid),
 public.list_challenges(uuid,boolean),public.list_challenge_orgs(uuid),public.accept_challenge(uuid,uuid),
 public.accept_authored_quest(uuid,jsonb),public.require_open_quest_party(uuid,text),public.list_quest_invites(uuid),
 public.guard_challenge_catch() from public,anon,authenticated;
grant execute on function public.create_challenge(uuid,jsonb),public.review_challenge(uuid,uuid,jsonb),public.archive_challenge(uuid,uuid),
 public.list_challenges(uuid,boolean),public.list_challenge_orgs(uuid),public.accept_challenge(uuid,uuid),
 public.accept_authored_quest(uuid,jsonb),public.list_quest_invites(uuid) to service_role;
-- Constraint helpers also run during existing service-role catalogue imports.
grant execute on function public.valid_challenge_palette(jsonb),public.valid_challenge_sticker(jsonb,integer) to service_role;

-- Preserve optional palettes through the existing server-only catalogue importer too.
alter function public.seed_sticker_catalogue(jsonb,jsonb) rename to seed_sticker_catalogue_without_colors;
revoke all on function public.seed_sticker_catalogue_without_colors(jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.seed_sticker_catalogue(p_stickers jsonb,p_spots jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if jsonb_typeof(p_stickers) is distinct from 'array' then raise exception 'Invalid catalogue' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_stickers) s where not public.valid_challenge_palette(s->'colors')) then
    raise exception 'Invalid sticker palette' using errcode='22023';
  end if;
  result:=public.seed_sticker_catalogue_without_colors(p_stickers,p_spots);
  update public.stickers s set colors=nullif(v.value->'colors','null'::jsonb)
    from jsonb_array_elements(p_stickers) v where s.key=v.value->>'key';
  return result;
end;
$$;
revoke all on function public.seed_sticker_catalogue(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.seed_sticker_catalogue(jsonb,jsonb) to service_role;
commit;
