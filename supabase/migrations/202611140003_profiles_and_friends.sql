-- Apply after the foundation and collection migrations. No location fields are added.
begin;

-- Lookup is case-insensitive, including any pre-existing mixed-case codes.
-- Existing normalized duplicates must be reconciled before applying this index.
create unique index profiles_friend_code_normalized_idx on public.profiles(upper(btrim(friend_code)));

create function public.require_verified_usc_actor(p_user_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$') then
    raise exception 'Verified USC account required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_verified_usc_actor(uuid) from public, anon, authenticated;
grant execute on function public.require_verified_usc_actor(uuid) to service_role;

create function public.read_traveller_profile(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  select jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'friend_code',upper(btrim(p.friend_code)))
    into result from public.profiles p where p.user_id = p_user_id;
  return result;
end;
$$;
revoke all on function public.read_traveller_profile(uuid) from public, anon, authenticated;
grant execute on function public.read_traveller_profile(uuid) to service_role;

create function public.save_traveller_profile(p_user_id uuid, p_display_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  saved public.profiles;
  attempts integer := 0;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80
    or p_display_name ~ '[[:cntrl:]]' then
    raise exception 'Invalid display name' using errcode = '22023';
  end if;
  loop
    attempts := attempts + 1;
    begin
      -- The default generates the code. Renaming never replaces an existing code.
      insert into public.profiles(user_id,display_name) values (p_user_id,btrim(p_display_name))
        on conflict (user_id) do update set display_name = excluded.display_name returning * into saved;
      exit;
    exception when unique_violation then
      -- A random code collision gets a new default on the next insertion attempt.
      if attempts >= 5 then raise exception 'Profile unavailable; retry' using errcode = 'PT503'; end if;
    end;
  end loop;
  return jsonb_build_object('user_id',saved.user_id,'display_name',saved.display_name,'friend_code',upper(btrim(saved.friend_code)));
end;
$$;
revoke all on function public.save_traveller_profile(uuid,text) from public, anon, authenticated;
grant execute on function public.save_traveller_profile(uuid,text) to service_role;

create function public.list_traveller_friends(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,
    'friend_code',upper(btrim(p.friend_code))) order by lower(p.display_name),p.user_id),'[]'::jsonb)
    into result from public.friends f join public.profiles p on p.user_id = f.friend_id
    join auth.users u on u.id = p.user_id
    where f.user_id = p_user_id and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$';
  return result;
end;
$$;
revoke all on function public.list_traveller_friends(uuid) from public, anon, authenticated;
grant execute on function public.list_traveller_friends(uuid) to service_role;

create function public.add_traveller_friend(p_user_id uuid, p_friend_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if p_friend_code is null or upper(btrim(p_friend_code)) !~ '^[A-Z0-9]{6,64}$' then
    raise exception 'Invalid friend code' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = p_user_id for share;
  if not found then raise exception 'Create profile first' using errcode = 'PT409'; end if;
  select p.* into target from public.profiles p join auth.users u on u.id = p.user_id
    where upper(btrim(p.friend_code)) = upper(btrim(p_friend_code))
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$' for share of p;
  if not found then raise exception 'Friend not found' using errcode = 'PT404'; end if;
  if target.user_id = p_user_id then raise exception 'Cannot add self' using errcode = 'PT400'; end if;
  -- The shared code grants a directed book link; do not silently add the reverse.
  insert into public.friends(user_id,friend_id) values (p_user_id,target.user_id) on conflict do nothing;
  return jsonb_build_object('user_id',target.user_id,'display_name',target.display_name,'friend_code',upper(btrim(target.friend_code)));
end;
$$;
revoke all on function public.add_traveller_friend(uuid,text) from public, anon, authenticated;
grant execute on function public.add_traveller_friend(uuid,text) to service_role;

create function public.read_friend_catches(p_user_id uuid, p_friend_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_verified_usc_actor(p_user_id);
  -- Authorization and book read share a transaction. Knowing a user UUID is insufficient.
  perform 1 from public.friends f join public.profiles p on p.user_id = f.friend_id
    join auth.users u on u.id = p.user_id
    where f.user_id = p_user_id and f.friend_id = p_friend_id
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and lower(u.email) ~ '^[^@[:space:]]+@usc[.]edu$' for share of f;
  if not found then raise exception 'Friend not found' using errcode = 'PT404'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'source',c.source,'source_id',c.source_id,
    'variant',c.variant,'caught_at',c.caught_at) order by c.caught_at desc,c.id),'[]'::jsonb)
    into result from public.catches c where c.user_id = p_friend_id;
  return result;
end;
$$;
revoke all on function public.read_friend_catches(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_friend_catches(uuid,uuid) to service_role;

-- RLS stays own-row-only. All cross-user book access goes through the checked server RPC.
commit;
