import assert from 'node:assert/strict';

/** Disposable PostgreSQL fixtures only. Never creates test users in hosted Supabase. */
export async function checkQuestParties(db,{a,b,outside,unverified,anonymous}) {
  const c='66666666-6666-4666-8666-666666666666';
  const d='77777777-7777-4777-8777-777777777777';
  const e='88888888-8888-4888-8888-888888888888';
  const quest={id:'__party_test__',title:'Party fixture',blurb:'Not a campus quest',
    spot_ids:['catalogue-common-spot','catalogue-rare-spot','catalogue-no-start-spot'],reward_sticker_key:'catalogue-rare'};
  const call=async(name,...args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  const accept=(user,q=quest)=>call('accept_authored_quest',user,JSON.stringify(q));
  const invite=(owner,member,id=quest.id)=>call('invite_to_quest',owner,id,member);
  const respond=(user,owner,yes=true,id=quest.id)=>call('respond_quest_invite',user,id,owner,yes);
  const read=(owner,id=quest.id)=>call('read_quest_party',owner,id);
  const incoming=user=>call('list_quest_invites',user);
  const remove=(owner,member,id=quest.id)=>call('remove_quest_party_member',owner,id,member);
  const expectCode=(promise,code)=>assert.rejects(promise,error=>error.code===code);
  await db.exec('set role service_role');
  for (const user of [a,b,c,d,e]) await call('save_traveller_profile',user,'Party fixture');
  for (const member of [b,c,d,e]) {
    const profile=await call('read_traveller_profile',member);
    await call('add_traveller_friend',a,profile.friend_code);
  }
  await expectCode(invite(a,b),'PT409');
  await accept(a);
  assert.deepEqual(await read(a),{quest_id:quest.id,owner_id:a,members:[]});
  await expectCode(invite(a,a),'22023');
  await expectCode(invite(a,outside),'PT404');
  const original=await invite(a,b);
  assert.equal(original.members[0].status,'invited');
  assert.deepEqual(await invite(a,b),original);
  const notices=await incoming(b);
  assert.equal(notices.length,1); assert.equal(notices[0].quest_title,quest.title);
  assert.deepEqual(Object.keys(notices[0].from).sort(),['display_name','friend_code','user_id']);
  assert.deepEqual(await incoming(c),[]);
  await expectCode(respond(c,a),'PT404');
  await expectCode(read(b),'PT404');
  await respond(b,a,false);
  assert.deepEqual((await read(a)).members,[]);
  assert.deepEqual(await incoming(b),[]);
  await expectCode(respond(b,a,true),'PT409');
  await invite(a,b);
  await respond(b,a);
  assert.equal((await call('list_quest_acceptances',b)).some(row=>row.quest_id===quest.id),true);
  assert.equal((await respond(b,a)).members[0].status,'joined');
  await invite(a,c); await invite(a,d);
  await expectCode(invite(a,e),'PT409');
  assert.equal((await read(a)).members.length,3);
  assert.equal((await remove(a,d)).members.length,2);
  await invite(a,e); await respond(e,a,false);
  await invite(a,d); await respond(c,a); await respond(d,a);
  assert.deepEqual((await read(a)).members.map(row=>row.status),['joined','joined','joined']);
  await expectCode(db.query('insert into public.quest_party_members(owner_id,quest_id,member_id,status) values ($1,$2,$3,\'joined\')',[a,quest.id,e]),'42501');
  console.log('PASS: party invites, private inbox, decline/re-invite, idempotency, auto-acceptance, removal and three-seat limit');

  // Overlap: b owns a smaller party with e, but belongs to a's party of four.
  const ep=await call('read_traveller_profile',e);
  await call('add_traveller_friend',b,ep.friend_code);
  await invite(b,e); await respond(e,b);
  await db.exec('reset role');
  assert.equal(await call('quest_party_size',a,quest.id),3);
  assert.equal(await call('quest_party_size',b,quest.id),3);
  assert.equal(await call('quest_party_size',c,quest.id),3);
  assert.equal(await call('quest_party_size',e,quest.id),1);
  // Emulate ONLY a future trusted completion writer, not a public claim API.
  const grant=async user=>(await db.query(`insert into public.catches(user_id,source,source_id,variant,rarity,copies,party_size)
    values($1,'quest',$2,'day','legendary',2,0) returning id,variant,rarity,copies,party_size`,[user,quest.id])).rows[0];
  const first=await grant(b);
  assert.equal(first.variant,'special'); assert.equal(first.rarity,'epic'); assert.equal(first.party_size,3);
  assert.ok([1,2].includes(first.copies));
  const retry=await grant(b); assert.equal(retry,undefined);
  const saved=(await db.query('select id,variant,rarity,copies,party_size from public.catches where user_id=$1 and source=\'quest\' and source_id=$2',[b,quest.id])).rows;
  assert.deepEqual(saved,[first]);
  await expectCode(db.query('update public.catches set rarity=\'legendary\' where id=$1',[first.id]),'23514');
  assert.equal((await grant(c)).rarity,'epic');
  assert.equal((await grant(d)).party_size,3);
  await db.exec('set role service_role');
  await expectCode(remove(a,c),'PT410');
  await expectCode(invite(a,e),'PT410');
  await expectCode(respond(e,b,false),'PT410');
  assert.deepEqual(await incoming(e),[]);
  const friendBook=await call('read_friend_catches',a,b);
  const reward=friendBook.find(row=>row.source==='quest'&&row.source_id===quest.id);
  assert.equal(reward.rarity,'epic'); assert.equal(reward.party_size,3);
  assert.equal('user_id' in reward,false);
  console.log('PASS: overlapping parties use the largest size, each member rolls independently, rewards persist once and all containing parties freeze');

  // No auto-created acceptance, reward or invitation on failed responses.
  const other={...quest,id:'__party_snapshot__'};
  await accept(a,other); await accept(b,{...other,reward_sticker_key:'catalogue-common'});
  await invite(a,b,other.id);
  await expectCode(respond(b,a,true,other.id),'PT409');
  assert.equal((await read(a,other.id)).members[0].status,'invited');
  const solo={...quest,id:'__party_solo__',reward_sticker_key:'catalogue-common'};
  await accept(a,solo); await invite(a,b,solo.id);
  await db.exec('reset role');
  const soloReward=(await db.query(`insert into public.catches(user_id,source,source_id,variant,copies,rarity,party_size)
    values($1,'quest',$2,'special',2,'legendary',3) returning rarity,copies,party_size`,[a,solo.id])).rows[0];
  assert.deepEqual(soloReward,{rarity:'common',copies:1,party_size:0});
  await db.exec('set role service_role');
  // Invites reserve seats but cannot improve reward odds before acceptance.
  const expired={...quest,id:'__party_ended__',reward_sticker_key:'acceptance-temporary'};
  await expectCode(accept(a,expired),'PT410');
  for(const actor of [outside,unverified,anonymous]) {
    await expectCode(incoming(actor),'42501');
    await expectCode(invite(actor,b),'42501');
    await expectCode(respond(actor,a),'42501');
  }
  await db.exec('reset role');
  for(const role of ['authenticated','anon']) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    await db.exec(`set role ${role}`);
    await expectCode(db.query('select * from public.quest_parties'),'42501');
    await expectCode(db.query('select * from public.quest_party_members'),'42501');
    await expectCode(read(a),'42501');
    await expectCode(invite(a,b),'42501');
    await expectCode(incoming(a),'42501');
    await db.exec('reset role');
  }
  const policies=(await db.query("select relname,relrowsecurity from pg_class where relname in ('quest_parties','quest_party_members') order by relname")).rows;
  assert.equal(policies.length,2); assert.ok(policies.every(row=>row.relrowsecurity));
  assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows,[{tablename:'popups'}]);
  console.log('PASS: snapshot conflicts roll back, invalid actors and direct browser access are denied, RLS enabled and party identities stay off Realtime');
}
