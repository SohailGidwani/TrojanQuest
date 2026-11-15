-- Persist automated screening; it supplements, never replaces, independent team review.
begin;
alter table public.challenges add column ai_screen jsonb check (
  ai_screen is null or (jsonb_typeof(ai_screen)='object'
    and ai_screen->>'status' in ('passed','flagged','unavailable')
    and jsonb_typeof(ai_screen->'reason')='string'
    and char_length(ai_screen->>'reason') between 1 and 400));

alter function public.challenge_json(uuid) rename to challenge_json_without_screen;
revoke all on function public.challenge_json_without_screen(uuid) from public,anon,authenticated,service_role;
create function public.challenge_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.challenge_json_without_screen(p_id) || jsonb_strip_nulls(jsonb_build_object('ai_screen',c.ai_screen))
  from public.challenges c where c.id=p_id;
$$;
revoke all on function public.challenge_json(uuid) from public,anon,authenticated,service_role;

create function public.record_challenge_screen(p_user_id uuid,p_id uuid,p_screen jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.challenges;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if jsonb_typeof(p_screen) is distinct from 'object'
    or coalesce(p_screen->>'status','') not in ('passed','flagged','unavailable')
    or jsonb_typeof(p_screen->'reason') is distinct from 'string'
    or char_length(p_screen->>'reason') not between 1 and 400 then
    raise exception 'Invalid screening record' using errcode='22023';
  end if;
  select * into c from public.challenges where id=p_id for update;
  if not found then raise exception 'Challenge not found' using errcode='PT404'; end if;
  if c.author_user_id<>p_user_id and not exists(select 1 from public.challenge_reviewers where user_id=p_user_id) then
    raise exception 'Author or reviewer required' using errcode='42501';
  end if;
  if c.status<>'pending' then raise exception 'Challenge is not pending' using errcode='PT409'; end if;
  update public.challenges set ai_screen=jsonb_build_object('status',p_screen->>'status','reason',p_screen->>'reason','checked_at',clock_timestamp()) where id=p_id;
  return public.challenge_json(p_id);
end;
$$;
revoke all on function public.record_challenge_screen(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_challenge_screen(uuid,uuid,jsonb) to service_role;

alter function public.review_challenge(uuid,uuid,jsonb) rename to review_challenge_manual;
revoke all on function public.review_challenge_manual(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.review_challenge(p_user_id uuid,p_id uuid,p_review jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.challenges;
begin
  perform public.require_verified_usc_actor(p_user_id);
  if not exists(select 1 from public.challenge_reviewers where user_id=p_user_id) then
    raise exception 'Reviewer required' using errcode='42501';
  end if;
  select * into c from public.challenges where id=p_id for update;
  if not found then raise exception 'Challenge not found' using errcode='PT404'; end if;
  if p_review->>'status'='live' and c.status='pending' and coalesce(c.ai_screen->>'status','')<>'passed' then
    raise exception 'Automated screening must pass before approval' using errcode='PT409';
  end if;
  return public.review_challenge_manual(p_user_id,p_id,p_review);
end;
$$;
revoke all on function public.review_challenge(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.review_challenge(uuid,uuid,jsonb) to service_role;
commit;
