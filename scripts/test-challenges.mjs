import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Disposable PostgreSQL only. Never loads .env or connects to hosted Supabase.
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite');
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222',
  reviewer='33333333-3333-4333-8333-333333333333', outsider='44444444-4444-4444-8444-444444444444';
const call=async(name,...args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
const fails=(p,code)=>assert.rejects(p,e=>e.code===code);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(x=>x.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file,migrations),'utf8'));
  }
  for(const [id,email] of [[a,'a@usc.edu'],[b,'b@usc.edu'],[reviewer,'reviewer@usc.edu'],[outsider,'x@example.com']])
    await db.query('insert into auth.users values($1,$2,now(),false)',[id,email]);
  await db.query('insert into public.challenge_reviewers values($1)',[reviewer]);
  await db.exec(`insert into public.stickers(key,name,rarity,tags,art) values
    ('test-stop','Test stop','common','{}','book'),('test-reward','Reward','rare','{}','star');
    insert into public.spots values
    ('test-one','One',34.0205,-118.2856,'study','Place','Tip','test-stop'),
    ('test-two','Two',34.0205,-118.2856,'study','Place','Tip','test-stop'),
    ('test-three','Three',34.0205,-118.2856,'study','Place','Tip','test-stop');`);
  await db.exec('set role service_role');
  await call('seed_sticker_catalogue',JSON.stringify([{key:'colored-fixture',name:'Color fixture',rarity:'common',tags:[],art:'book',colors:['#112233','#AABBCC','#000000']}]),null);
  assert.deepEqual((await db.query("select colors from public.stickers where key='colored-fixture'")).rows[0].colors,['#112233','#AABBCC','#000000']);
  await fails(call('seed_sticker_catalogue',JSON.stringify([{key:'invalid-color',name:'Invalid',rarity:'common',tags:[],colors:['#bad']}]),null),'22023');
  for(const id of [a,b,reviewer]) await call('save_traveller_profile',id,'Fixture student');
  const authored={id:'test-tour',title:'Tour',blurb:'Fixture',spot_ids:['test-one','test-two','test-three'],reward_sticker_key:'test-reward'};
  await call('accept_authored_quest',a,JSON.stringify(authored));
  await fails(call('complete_accepted_quest',a,'test-tour'),'PT409');
  for(const spot of authored.spot_ids) await call('catch_sticker',a,'spot',spot,34.0205,-118.2856);
  const completed=await call('complete_accepted_quest',a,'test-tour');
  assert.equal(completed.already_completed,false);assert.equal(completed.catch.rarity,'rare');
  assert.deepEqual((await call('complete_accepted_quest',a,'test-tour')).catch,completed.catch);
  await call('accept_authored_quest',b,JSON.stringify(authored));
  await fails(call('complete_accepted_quest',b,'test-tour'),'PT409');
  console.log('PASS: authored completion requires own visits; retry persists the original outcome');

  const draft={title:'Local challenge',blurb:'Fixture',author:'student',days:1,
    stops:[{name:'Pinned stop',lore:'A place',art:'book',colors:['#112233','#AABBCC','#000000'],place:{kind:'point',lat:34.0205,lng:-118.2856}}],
    reward:{name:'Challenge reward',lore:'Earned',art:'star',rarity:'epic',colors:['#112233','#AABBCC','#000000']}};
  const create=async(d=draft)=>call('create_challenge',a,JSON.stringify(d));
  await fails(call('create_challenge',outsider,JSON.stringify(draft)),'42501');
  await fails(create({...draft,days:30}),'22023');
  await fails(create({...draft,stops:[]}),'22023');
  await fails(create({...draft,stops:Array(9).fill(draft.stops[0])}),'22023');
  await fails(create({...draft,reward:{...draft.reward,rarity:'legendary'}}),'22023');
  await fails(create({...draft,stops:[{...draft.stops[0],place:{kind:'point',lat:0,lng:0}}]}),'22023');
  await fails(create({...draft,stops:[{...draft.stops[0],place:{kind:'campus',spot_id:'missing'}}]}),'PT404');
  await fails(create({...draft,author:'org',org_id:a,days:30}),'42501');
  const c=await create(), qid='cq-'+c.id;
  assert.equal(c.status,'pending');assert.equal(c.by,'Fixture student');
  assert.equal((await call('list_challenges',b,false)).length,0);
  assert.equal((await call('list_challenges',a,false)).length,1);
  await fails(call('list_challenges',a,true),'42501');
  await fails(call('review_challenge',a,c.id,JSON.stringify({status:'live'})),'42501');
  await fails(call('accept_challenge',b,c.id),'PT410');
  assert.equal((await call('list_challenges',reviewer,true)).length,1);
  await call('review_challenge',reviewer,c.id,JSON.stringify({status:'live'}));
  assert.equal((await call('list_challenges',b,false)).length,1);
  await call('accept_challenge',a,c.id);
  assert.equal((await call('accept_challenge',a,c.id)).already_accepted,true);
  // A one-stop challenge can also be joined through the existing party API.
  const friend=await call('read_traveller_profile',b);
  await call('add_traveller_friend',a,friend.friend_code);
  await call('invite_to_quest',a,qid,b);await call('respond_quest_invite',b,qid,a,true);
  await fails(call('complete_accepted_quest',b,qid),'PT409');
  const pin=qid+'-1';
  assert.equal((await call('catch_sticker',a,'spot',pin,0,0)).reason,'too_far');
  const caught=await call('catch_sticker',a,'spot',pin,34.0205,-118.2856);
  assert.equal(caught.ok,true);assert.deepEqual(caught.sticker.colors,draft.stops[0].colors);
  const reward=await call('complete_accepted_quest',a,qid);
  assert.equal(reward.catch.party_size,1);assert.ok(['epic','legendary'].includes(reward.catch.rarity));
  assert.deepEqual(reward.sticker.colors,draft.reward.colors);
  assert.deepEqual((await call('complete_accepted_quest',a,qid)).catch,reward.catch);
  await fails(call('archive_challenge',b,c.id),'42501');
  await call('archive_challenge',a,c.id);
  await fails(call('accept_challenge',b,c.id),'PT410');
  await fails(call('complete_accepted_quest',b,qid),'PT410');
  await fails(call('catch_sticker',b,'spot',pin,34.0205,-118.2856),'PT410');
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as n from public.catches where user_id=$1 and source_id=$2",[a,qid])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.stickers where key=$1',[qid+'-reward'])).rows[0].n,1);
  console.log('PASS: pending review, private visibility, challenge acceptance/parties, GPS, colors, one-time reward and archive retention');

  const org=(await db.query("insert into public.orgs(name,approved) values('Approved fixture org',true) returning id")).rows[0].id;
  await db.query("insert into public.org_members values($1,$2,'member')",[org,a]);
  await db.exec('set role service_role');
  await fails(create({...draft,author:'org',org_id:org,days:30}),'42501');
  await db.exec('reset role');await db.query("update public.org_members set role='admin' where org_id=$1",[org]);
  await db.exec('set role service_role');
  const oc=await create({...draft,author:'org',org_id:org,days:30});assert.equal(oc.by,'Approved fixture org');
  await call('review_challenge',reviewer,oc.id,JSON.stringify({status:'live'}));
  await db.exec('reset role');
  await db.query("update public.challenges set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=$1",[oc.id]);
  await db.exec('set role service_role');
  await fails(call('accept_challenge',b,oc.id),'PT410');
  await fails(call('catch_sticker',b,'spot','cq-'+oc.id+'-1',34.0205,-118.2856),'PT410');
  await db.exec('reset role; set role authenticated');
  await fails(call('create_challenge',a,JSON.stringify(draft)),'42501');
  await fails(db.query('select * from public.challenges'),'42501');
  await fails(db.query("insert into public.challenge_reviewers values($1)",[a]),'42501');
  await fails(call('complete_accepted_quest',a,'test-tour'),'42501');
  await db.exec('reset role; set role anon');
  await fails(call('list_challenges',a,false),'42501');
  console.log('PASS: provisioned org-admin membership, expiry and browser privilege boundaries');
} finally { await db.close(); }
