import assert from 'node:assert/strict';

/** Runs only against the disposable database created by test-migration.mjs. */
export async function checkCollection(db, { a, b, outside, unverified, anonymous, popupId, input }) {
  const c = '66666666-6666-4666-8666-666666666666';
  await db.query(`insert into auth.users values ($1,'three@usc.edu',now(),false)`, [c]);
  const zero = '00000000-0000-4000-8000-000000000000';
  for (const [at, expected] of [
    ['2026-01-15T13:59:59Z','night'], ['2026-01-15T14:00:00Z','morning'],
    ['2026-01-15T18:59:59Z','morning'], ['2026-01-15T19:00:00Z','day'],
    ['2026-01-16T00:59:59Z','day'], ['2026-01-16T01:00:00Z','night'],
    ['2026-06-15T13:00:00Z','morning'], ['2026-06-15T18:00:00Z','day'],
    ['2026-06-16T00:00:00Z','night'], ['2026-11-01T08:30:00Z','night'],
    ['2026-11-01T09:30:00Z','night'],
  ]) {
    const result = await db.query('select public.campus_spot_variant($1) as variant', [at]);
    assert.equal(result.rows[0].variant, expected, at);
  }
  await db.exec(`set timezone = 'Asia/Tokyo'`);
  assert.equal((await db.query(`select public.campus_spot_variant('2026-01-15T14:00:00Z') as variant`)).rows[0].variant, 'morning');
  await db.exec(`set timezone = 'UTC'`);
  console.log('PASS: morning/day/night boundaries, daylight saving and database timezone independence');

  await db.exec(`insert into public.spots values ('__test_spot__','Test fixture',0,0,'study','Test only','Test only','book');
    insert into public.org_drops values
    ('__test_org__','Test org','Test event',0,0,now()-interval '1 hour',now()+interval '1 hour','flag'),
    ('__future_org__','Test org','Future event',0,0,now()+interval '1 hour',now()+interval '2 hours','flag'),
    ('__past_org__','Test org','Past event',0,0,now()-interval '2 hours',now()-interval '1 hour','flag');`);
  const expired = (await db.query(`select id from public.popups where brand = 'Expired'`)).rows[0].id;
  const catchSticker = async (actor, source, id, lat = 0, lng = 0) => (await db.query(
    'select public.catch_sticker($1,$2,$3,$4,$5) as result',[actor,source,id,lat,lng])).rows[0].result;
  const confirm = async (actor, id = popupId, lat = input.lat, lng = input.lng) => (await db.query(
    'select public.confirm_popup($1,$2,$3,$4) as result',[actor,id,lat,lng])).rows[0].result;
  const count = async () => (await db.query('select count(*)::int as n from public.catches')).rows[0].n;
  const originalCount = await count();
  await db.exec('set role service_role');
  for (const [source,id,reason] of [
    ['spot','missing','not_found'], ['popup',zero,'not_found'], ['org','missing','not_found'],
    ['popup',expired,'expired'], ['org','__future_org__','not_started'],
    ['org','__past_org__','expired'], ['quest','anything','quest_not_available'],
  ]) assert.deepEqual(await catchSticker(a,source,id), {ok:false,reason});
  const latitudeAtMeters = meters => meters / 6_371_000 * 180 / Math.PI;
  assert.deepEqual(await catchSticker(a,'spot','__test_spot__',latitudeAtMeters(50.01)), {ok:false,reason:'too_far'});
  assert.equal(await count(), originalCount);
  const first = await catchSticker(a,'spot','__test_spot__',latitudeAtMeters(49.99));
  assert.equal(first.ok,true);
  assert.equal(first.already_caught,false);
  assert.equal(first.sticker.key,'book');
  assert.equal(first.sticker.source,'spot');
  assert.equal(first.sticker.variant,first.variant);
  assert.equal('lat' in first,false);
  const retried = await Promise.all(Array.from({length:5},()=>catchSticker(a,'spot','__test_spot__')));
  assert.ok(retried.every(result=>result.ok && result.already_caught));
  assert.equal(await count(), originalCount+1);
  const currentHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',hourCycle:'h23'}).format(new Date()));
  assert.equal(first.variant,currentHour>=6 && currentHour<11 ? 'morning' : currentHour>=11 && currentHour<17 ? 'day' : 'night');
  const popupCatch = await catchSticker(a,'popup',popupId,input.lat,input.lng);
  assert.equal(popupCatch.ok,true);
  assert.equal(popupCatch.variant,'special');
  assert.deepEqual(popupCatch.sticker,input.sticker);
  const orgCatch = await catchSticker(a,'org','__test_org__');
  assert.equal(orgCatch.ok,true);
  assert.deepEqual(orgCatch.sticker,{key:'flag',name:'Test event',source:'org',variant:'special'});
  assert.equal(await count(),originalCount+3);
  console.log('PASS: real catch RPC enforces the 50 m boundary, source availability, authoritative awards and repeat protection');

  for (const actor of [outside,unverified,anonymous,null]) {
    await assert.rejects(catchSticker(actor,'spot','__test_spot__'), /Verified USC/);
    await assert.rejects(confirm(actor), /Verified USC/);
  }
  for (const lat of [null,91,NaN,Infinity]) {
    await assert.rejects(catchSticker(a,'spot','__test_spot__',lat),/Invalid catch/);
    await assert.rejects(confirm(a,popupId,lat),/Invalid confirmation/);
  }
  await assert.rejects(catchSticker(a,'invalid','__test_spot__'),/Invalid catch/);
  console.log('PASS: privileged RPCs independently reject invalid positions, unverified/anonymous users and outsiders');

  const before = await confirm(a); // Initial reporter was backfilled by the upgrade.
  assert.equal(before.ok,true);
  assert.equal(before.already_confirmed,true);
  assert.equal(before.confirmations,1);
  assert.deepEqual(await confirm(b,popupId,35,-118),{ok:false,reason:'too_far'});
  const second = await confirm(b);
  assert.equal(second.already_confirmed,false);
  assert.equal(second.confirmations,2);
  assert.equal(Date.parse(second.expires_at)-Date.parse(before.expires_at),30*60_000);
  const repeats = await Promise.all(Array.from({length:5},()=>confirm(b)));
  assert.ok(repeats.every(result=>result.already_confirmed && result.expires_at===second.expires_at && result.confirmations===2));
  const third = await confirm(c);
  assert.equal(third.confirmations,3);
  assert.equal(Date.parse(third.expires_at)-Date.parse(second.expires_at),30*60_000);
  assert.deepEqual(await confirm(b,expired,34,-118),{ok:false,reason:'expired'});
  assert.deepEqual(await confirm(b,zero),{ok:false,reason:'not_found'});
  const created = (await db.query('select public.create_popup($1::jsonb) as result',[
    JSON.stringify({...input,brand:'New fixture',reporter_id:c})])).rows[0].result;
  const reporterRetry = await confirm(c,created.id);
  assert.equal(reporterRetry.already_confirmed,true);
  assert.equal(reporterRetry.confirmations,1);
  console.log('PASS: confirmation extends by exactly 30 minutes once per account, counts reporters once and never revives expired pins');

  await db.exec('reset role');
  const columns = (await db.query(`select column_name from information_schema.columns
    where table_schema='public' and table_name in ('catches','popup_confirmations') and column_name in ('lat','lng')`)).rows;
  assert.equal(columns.length,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.popup_confirmations'),/permission denied/);
  await assert.rejects(catchSticker(a,'spot','__test_spot__'),/permission denied/);
  await assert.rejects(confirm(a),/permission denied/);
  await assert.rejects(db.query(`update public.popups set confirmations=999`),/permission denied/);
  await assert.rejects(db.query(`insert into public.popup_confirmations(popup_id,user_id) values ($1,$2)`,[popupId,b]),/permission denied/);
  assert.equal((await db.query(`select count(*)::int as n from public.catches where user_id <> $1`,[a])).rows[0].n,0);
  await db.exec('reset role; set role anon');
  await assert.rejects(catchSticker(a,'spot','__test_spot__'),/permission denied/);
  await assert.rejects(confirm(a),/permission denied/);
  await db.exec('reset role');
  assert.deepEqual((await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).rows,[{tablename:'popups'}]);
  console.log('PASS: confirmation identities remain private, browsers cannot forge writes, and no visit coordinates are stored');
}
