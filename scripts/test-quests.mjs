import assert from 'node:assert/strict';

/** Runs only against the disposable test database. Never targets hosted Supabase. */
export async function checkQuestAcceptance(db,{a,b,outside,unverified,anonymous}) {
  const c='66666666-6666-4666-8666-666666666666';
  const quest={id:'__accept_test__',title:'Test fixture',blurb:'Acceptance test only',
    spot_ids:['catalogue-common-spot','catalogue-rare-spot','catalogue-no-start-spot'],reward_sticker_key:'catalogue-rare'};
  const accept=async (user,definition=quest)=>(await db.query('select public.accept_authored_quest($1,$2::jsonb) as result',[
    user,JSON.stringify(definition)])).rows[0].result;
  const list=async user=>(await db.query('select public.list_quest_acceptances($1) as result',[user])).rows[0].result;
  const count=async table=>(await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
  await db.exec('set role service_role');
  const catchesBefore=await count('catches');
  assert.deepEqual(await list(a),[]);
  const before=Date.now();
  const first=await accept(a);
  assert.equal(first.quest_id,quest.id);
  assert.equal(first.already_accepted,false);
  assert.ok(Date.parse(first.accepted_at)>=before-1000 && Date.parse(first.accepted_at)<=Date.now()+1000);
  assert.deepEqual(Object.keys(first).sort(),['accepted_at','already_accepted','quest_id']);
  const retries=await Promise.all(Array.from({length:5},()=>accept(a)));
  assert.ok(retries.every(item=>item.already_accepted && item.accepted_at===first.accepted_at));
  const updated={...quest,title:'Changed later',spot_ids:['missing-1','missing-2','missing-3'],reward_sticker_key:'missing-reward'};
  assert.deepEqual(await accept(a,updated),{...first,already_accepted:true});
  const saved=(await db.query('select quest_definition from public.quest_acceptances where user_id=$1 and quest_id=$2',[a,quest.id])).rows[0];
  assert.deepEqual(saved.quest_definition,quest);
  const other=await accept(b);
  assert.equal(other.already_accepted,false);
  assert.deepEqual(await list(a),[{quest_id:quest.id,accepted_at:first.accepted_at}]);
  assert.deepEqual(await list(c),[]);
  assert.equal(await count('quest_acceptances'),2);
  assert.equal(await count('catches'),catchesBefore);
  console.log('PASS: server-timed acceptance, account isolation, duplicate protection, immutable snapshots and no reward side effects');

  for(const actor of [outside,unverified,anonymous,null]) {
    await assert.rejects(accept(actor),error=>error.code==='42501');
    await assert.rejects(list(actor),error=>error.code==='42501');
  }
  for(const bad of [null,[],{}, {...quest,id:''}, {...quest,id:' bad '}, {...quest,title:''},
    {...quest,blurb:42}, {...quest,spot_ids:[]}, {...quest,spot_ids:['one','two']},
    {...quest,spot_ids:['one','one','two']}, {...quest,spot_ids:['one','two',3]},
    {...quest,spot_ids:['one','two',null]}, {...quest,reward_sticker_key:'Bad Key'}]) {
    await assert.rejects(accept(c,bad),error=>error.code==='22023');
  }
  assert.equal(await count('quest_acceptances'),2);
  await assert.rejects(accept(c,{...quest,id:'missing-stop',spot_ids:['missing','catalogue-common-spot','catalogue-rare-spot']}),error=>error.code==='PT503');
  await assert.rejects(accept(c,{...quest,id:'missing-reward',reward_sticker_key:'missing-reward'}),error=>error.code==='PT503');
  await db.exec('reset role');
  await db.exec("insert into public.spots values ('quest-unmapped-stop','Test',0,0,'study','Test','Test','missing-sticker')");
  await db.exec('set role service_role');
  await assert.rejects(accept(c,{...quest,id:'missing-stop-sticker',spot_ids:['quest-unmapped-stop','catalogue-common-spot','catalogue-rare-spot']}),error=>error.code==='PT503');
  assert.equal(await count('quest_acceptances'),2);
  console.log('PASS: acceptance rejects invalid actors/definitions and missing seeded spots, stop art or reward definitions');

  await assert.rejects(accept(c,{...quest,id:'future-reward',reward_sticker_key:'catalogue-future'}),error=>error.code==='PT409');
  await assert.rejects(accept(c,{...quest,id:'ended-reward',reward_sticker_key:'catalogue-ended'}),error=>error.code==='PT410');
  const futureEnd=new Date(Date.now()+3_600_000).toISOString();
  await db.query(`insert into public.stickers(key,name,rarity,tags,available_until) values
    ('acceptance-temporary','Test only','exclusive','{}',$1)`,[futureEnd]);
  const expiring={...quest,id:'accepted-before-end',reward_sticker_key:'acceptance-temporary'};
  const active=await accept(a,expiring);
  await db.query("update public.stickers set available_until=clock_timestamp()-interval '1 second' where key='acceptance-temporary'");
  assert.deepEqual(await accept(a,expiring),{...active,already_accepted:true});
  await assert.rejects(accept(b,expiring),error=>error.code==='PT410');
  const history=await list(a);
  assert.deepEqual(history.map(item=>item.quest_id),[expiring.id,quest.id]);
  assert.equal(history[0].accepted_at,active.accepted_at);
  assert.equal(await count('catches'),catchesBefore);
  const catchQuest=(await db.query('select public.catch_sticker($1,$2,$3,0,0) as result',[a,'quest',quest.id])).rows[0].result;
  assert.deepEqual(catchQuest,{ok:false,reason:'quest_not_available'});
  console.log('PASS: upcoming/ended rewards block new acceptance, historical acceptance persists, and reward claims stay deferred');

  await assert.rejects(db.query('update public.quest_acceptances set accepted_at=now()'),/permission denied/);
  await assert.rejects(db.query('delete from public.quest_acceptances'),/permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as n from public.quest_acceptances')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from public.quest_acceptances where user_id=$1',[b])).rows[0].n,0);
  await assert.rejects(accept(a),/permission denied/);
  await assert.rejects(list(a),/permission denied/);
  await assert.rejects(db.query('insert into public.quest_acceptances(user_id,quest_id,quest_definition) values ($1,$2,$3::jsonb)',[a,'forged',JSON.stringify({...quest,id:'forged'})]),/permission denied/);
  await db.exec('reset role');
  for(const actor of [outside,unverified,anonymous]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from public.quest_acceptances')).rows[0].n,0);
    await db.exec('reset role');
  }
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.quest_acceptances'),/permission denied/);
  await db.exec('reset role');
  assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows,[{tablename:'popups'}]);
  console.log('PASS: acceptance RLS is own-only, client writes/RPCs are denied, and snapshots/timestamps cannot be overwritten');
}
