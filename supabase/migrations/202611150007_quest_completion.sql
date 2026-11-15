-- Trusted completion writer. Each traveller needs their OWN recorded visits;
-- party membership never substitutes for a visit. Existing visits count, matching the client.
begin;

create function public.require_live_challenge_quest(p_quest_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_quest_id like 'cq-%' then raise exception 'Challenge not available' using errcode='PT404'; end if;
end;
$$;
revoke all on function public.require_live_challenge_quest(text) from public,anon,authenticated,service_role;

create function public.complete_accepted_quest(p_user_id uuid,p_quest_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare definition jsonb; reward public.stickers; saved public.catches; already boolean;
begin
  perform public.require_verified_usc_actor(p_user_id);
  perform public.lock_quest_parties(p_quest_id);
  perform public.require_live_challenge_quest(p_quest_id);
  select q.quest_definition into definition from public.quest_acceptances q
    where q.user_id=p_user_id and q.quest_id=p_quest_id for share;
  if not found then raise exception 'Accept the quest first' using errcode='PT409'; end if;
  select * into saved from public.catches c where c.user_id=p_user_id and c.source='quest' and c.source_id=p_quest_id;
  already:=found;
  if not already then
    if jsonb_typeof(definition->'spot_ids') is distinct from 'array'
      or jsonb_array_length(definition->'spot_ids') not between 1 and 8 then
      raise exception 'Invalid saved quest' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements_text(definition->'spot_ids') s(id)
      where not exists(select 1 from public.catches c where c.user_id=p_user_id
        and c.source='spot' and c.source_id=s.id)) then
      raise exception 'Visit every required stop first' using errcode='PT409';
    end if;
  end if;
  select * into reward from public.stickers s where s.key=definition->>'reward_sticker_key' for share;
  if not found then raise exception 'Reward not seeded' using errcode='PT503'; end if;
  if not already then
    -- Existing party trigger owns the one-time roll, cap, copies and freeze.
    insert into public.catches(user_id,source,source_id,variant)
      values(p_user_id,'quest',p_quest_id,'special') returning * into saved;
  end if;
  return jsonb_build_object('quest_id',p_quest_id,'already_completed',already,
    'catch',jsonb_build_object('id',saved.id,'source',saved.source,'source_id',saved.source_id,
      'variant',saved.variant,'caught_at',saved.caught_at,'rarity',saved.rarity,'copies',saved.copies,'party_size',saved.party_size),
    'sticker',jsonb_strip_nulls(to_jsonb(reward))||jsonb_build_object('source','quest','variant','special','rarity',saved.rarity));
end;
$$;
revoke all on function public.complete_accepted_quest(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_accepted_quest(uuid,text) to service_role;
commit;
