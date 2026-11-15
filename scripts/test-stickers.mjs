import assert from 'node:assert/strict';

/** Runs only in the disposable database created by test-migration.mjs. */
export async function checkStickers(db, {a,b,outside,unverified,anonymous,popupId}) {
  const now=Date.now();
  const at=offset=>new Date(now+offset).toISOString();
  const hour=3_600_000;
  const definitions=[
    {key:'catalogue-common',name:'Common fixture',rarity:'common',tags:['study'],art:'book',image:'fixture.webp'},
    {key:'catalogue-rare',name:'Rare fixture',rarity:'rare',tags:['library'],art:'book'},
    {key:'catalogue-active',name:'Active fixture',rarity:'exclusive',tags:['event'],art:'flag',available_from:at(-hour),available_until:at(hour)},
    {key:'catalogue-future',name:'Future fixture',rarity:'exclusive',tags:[],available_from:at(hour),available_until:at(2*hour)},
    {key:'catalogue-ended',name:'Ended fixture',rarity:'exclusive',tags:[],available_from:at(-2*hour),available_until:at(-hour)},
    {key:'catalogue-no-start',name:'No start fixture',rarity:'exclusive',tags:[],available_until:at(hour)},
  ];
  const spots=definitions.map(d=>({id:d.key+'-spot',name:'Test only',lat:0,lng:0,category:'study',card_text:'Fixture',tip:'Fixture',sticker_key:d.key}));
  const seed=async (stickers,places=null)=>(await db.query('select public.seed_sticker_catalogue($1::jsonb,$2::jsonb) as result',[
    JSON.stringify(stickers),places===null?null:JSON.stringify(places)])).rows[0].result;
  const catchSticker=async (user,source,id,lat=0,lng=0)=>(await db.query('select public.catch_sticker($1,$2,$3,$4,$5) as result',[user,source,id,lat,lng])).rows[0].result;
  const count=async ()=>(await db.query('select count(*)::int as n from public.catches')).rows[0].n;
  await db.exec('set role service_role');
  assert.deepEqual(await seed(definitions,spots),{stickers:6,spots:6});
  assert.deepEqual(await seed(definitions),{stickers:6,spots:0});
  assert.equal((await db.query('select count(*)::int as n from public.stickers')).rows[0].n,6);
  const commonName=(await db.query("select name from public.stickers where key='catalogue-common'")).rows[0].name;
  const changed={...definitions[0],name:'Should roll back'};
  await assert.rejects(seed([changed],[{...spots[0],sticker_key:'missing'}]),error=>error.code==='22023');
  assert.equal((await db.query("select name from public.stickers where key='catalogue-common'")).rows[0].name,commonName);
  await assert.rejects(seed([changed],[{...spots[0],lat:91}]),error=>error.code==='23514');
  assert.equal((await db.query("select name from public.stickers where key='catalogue-common'")).rows[0].name,commonName);
  for(const bad of [
    {...definitions[0],rarity:'exclusive'}, {...definitions[0],available_until:at(hour)},
    {...definitions[2],available_until:at(-3*hour)}, {...definitions[0],rarity:'fake'},
    {...definitions[0],image:'../outside.svg'}, {...definitions[0],available_from:'infinity'},
  ]) await assert.rejects(seed([bad]),error=>error.code==='23514');
  await assert.rejects(seed([]),error=>error.code==='22023');
  console.log('PASS: catalogue schema, upsert preservation, reference checks and atomic seed rollback');

  for(const [rarity,start,end,time,expected] of [
    ['exclusive','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','2026-10-31T23:59:59Z','upcoming'],
    ['exclusive','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','2026-11-01T00:00:00Z','available'],
    ['exclusive','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','2026-11-30T23:59:59.999Z','available'],
    ['exclusive','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z','2026-12-01T00:00:00Z','ended'],
    ['exclusive',null,'2026-12-01T00:00:00Z','2026-01-01T00:00:00Z','available'],
    ['exclusive',null,'2026-12-01T00:00:00-08:00','2026-12-01T08:00:00Z','ended'],
    ['exclusive',null,null,'2026-11-01T00:00:00Z','ended'],
    ['exclusive','2026-12-01T00:00:00Z','2026-11-01T00:00:00Z','2026-11-15T00:00:00Z','ended'],
    ['rare',null,null,'2026-12-01T00:00:00Z','available'],
  ]) assert.equal((await db.query('select public.sticker_availability($1,$2,$3,$4) as state',[rarity,start,end,time])).rows[0].state,expected);
  console.log('PASS: exclusive start is inclusive, end is exclusive, and timezone offsets are absolute');

  const before=await count();
  for(const [key,reason] of [['catalogue-future','not_started'],['catalogue-ended','expired']]) {
    assert.deepEqual(await catchSticker(a,'spot',key+'-spot'),{ok:false,reason});
    assert.deepEqual(await catchSticker(b,'spot',key+'-spot'),{ok:false,reason});
  }
  assert.equal(await count(),before);
  for(const definition of [definitions[0],definitions[1],definitions[2],definitions[5]]) {
    const result=await catchSticker(a,'spot',definition.key+'-spot');
    assert.equal(result.ok,true);
    assert.equal(result.already_caught,false);
    assert.equal(result.sticker.key,definition.key);
    assert.equal(result.sticker.name,definition.name);
    assert.equal(result.sticker.rarity,definition.rarity);
    assert.deepEqual(result.sticker.tags,definition.tags);
  }
  assert.equal((await catchSticker(a,'spot','catalogue-common-spot')).already_caught,true);
  assert.equal(await count(),before+4);
  assert.deepEqual(await catchSticker(b,'spot','catalogue-common-spot',1,1),{ok:false,reason:'too_far'});
  await db.exec('reset role');
  await db.exec(`insert into public.spots values ('catalogue-missing','Test',0,0,'study','Test','Test','missing')`);
  await db.exec('set role service_role');
  await assert.rejects(catchSticker(a,'spot','catalogue-missing'),error=>error.code==='PT503');
  await assert.rejects(catchSticker(outside,'spot','catalogue-common-spot'),error=>error.code==='42501');
  assert.deepEqual(await catchSticker(a,'quest','anything'),{ok:false,reason:'quest_not_available'});
  console.log('PASS: server decides catalogue metadata and availability; unknown keys fail closed and old collection rules remain');

  const oldCount=await count();
  const closedUntil=at(-1000);
  await seed([{...definitions[2],available_until:closedUntil}]);
  assert.deepEqual(await catchSticker(a,'spot','catalogue-active-spot'),{ok:false,reason:'expired'});
  assert.equal(await count(),oldCount); // Existing award is retained; no new one is added.
  await assert.rejects(seed([{...definitions[2],available_until:at(2*hour)}]),error=>error.code==='PT409');
  await assert.rejects(seed([{...definitions[2],rarity:'common',available_from:undefined,available_until:undefined}]),error=>error.code==='PT409');
  await seed([{...definitions[2],name:'Renamed ended edition',available_until:closedUntil}]);
  assert.deepEqual(await catchSticker(b,'spot','catalogue-active-spot'),{ok:false,reason:'expired'});
  await assert.rejects(db.query("delete from public.stickers where key='catalogue-active'"),/permission denied/);
  await assert.rejects(db.query('truncate public.stickers'),/permission denied/);
  console.log('PASS: owned stickers survive expiry; catalogue reseeding cannot reopen ended editions or downgrade exclusivity');

  await db.exec('reset role');
  await db.exec(`insert into public.org_drops values
    ('catalogue-org','Test','Test event',0,0,now()-interval '1 hour',now()+interval '2 hours','catalogue-no-start'),
    ('catalogue-org-ended','Test','Ended event',0,0,now()-interval '2 hours',now()-interval '1 hour','catalogue-no-start'),
    ('catalogue-org-disjoint','Test','Disjoint event',0,0,now()+interval '1 hour',now()+interval '2 hours','catalogue-ended'),
    ('catalogue-org-bad','Test','Bad config',0,0,now()-interval '1 hour',now()+interval '1 hour','catalogue-common')`);
  await db.exec('set role service_role');
  const org=await catchSticker(a,'org','catalogue-org');
  assert.equal(org.ok,true);
  assert.equal(org.sticker.rarity,'exclusive');
  assert.equal(org.variant,'special');
  assert.equal(Date.parse(org.sticker.available_until),Date.parse(definitions[5].available_until));
  assert.deepEqual(await catchSticker(a,'org','catalogue-org-ended'),{ok:false,reason:'expired'});
  assert.deepEqual(await catchSticker(a,'org','catalogue-org-disjoint'),{ok:false,reason:'expired'});
  await assert.rejects(catchSticker(a,'org','catalogue-org-bad'),error=>error.code==='PT503');
  const pin=(await db.query('select lat,lng,expires_at from public.popups where id=$1',[popupId])).rows[0];
  const popup=await catchSticker(b,'popup',popupId,pin.lat,pin.lng);
  assert.equal(popup.ok,true);
  assert.equal(popup.sticker.rarity,'exclusive');
  assert.equal(Date.parse(popup.sticker.available_until),new Date(pin.expires_at).getTime());
  console.log('PASS: org and catalogue windows both apply; dynamic popup art remains collectible only before pin expiry');

  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as n from public.stickers')).rows[0].n,6);
  await assert.rejects(seed(definitions),/permission denied/);
  await assert.rejects(db.query("update public.stickers set rarity='common'"),/permission denied/);
  await db.exec('reset role');
  for(const user of [outside,unverified,anonymous]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from public.stickers')).rows[0].n,0);
    await db.exec('reset role');
  }
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.stickers'),/permission denied/);
  await db.exec('reset role');
  assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows,[{tablename:'popups'}]);
  console.log('PASS: catalogue reads require verified USC access; seeding/writes are private and Realtime publication is unchanged');
}
