import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkCollection } from './test-collection.mjs';
import { checkFriends } from './test-friends.mjs';

// Optional test dependency, kept outside the team's application lockfile.
// Pass a module path when PGlite is installed in a separate tooling directory.
const { PGlite } = await import(process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : '@electric-sql/pglite');

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202611140001_backend_foundation.sql', import.meta.url), 'utf8'));
  console.log('PASS: migration applies to PostgreSQL');
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const outside = '33333333-3333-4333-8333-333333333333';
  const unverified = '44444444-4444-4444-8444-444444444444';
  const anonymous = '55555555-5555-4555-8555-555555555555';
  await db.query(`insert into auth.users values
    ($1,'one@usc.edu',now(),false), ($2,'two@usc.edu',now(),false),
    ($3,'person@gmail.com',now(),false), ($4,'unverified@usc.edu',null,false),
    ($5,'anonymous@usc.edu',now(),true)`, [a,b,outside,unverified,anonymous]);
  await db.exec(`insert into public.spots values ('leavey','Leavey',34,-118,'study','Study','Tip','book')`);
  await db.query(`insert into public.catches(user_id,source,source_id,variant) values
    ($1,'spot','leavey','day'),($2,'spot','leavey','day')`, [a,b]);
  await db.query(`insert into public.profiles(user_id,display_name) values ($1,'One'),($2,'Two')`, [a,b]);
  const input = { lat:34.0257, lng:-118.2856, brand:'Bubble', freebies:['Samples'],
    sticker:{key:'bubble',name:'Bubbles',source:'popup',variant:'special',colors:['#FFFFFF','#FF0000'],lore:'Samples!'},
    expires_at:new Date(Date.now()+60*60_000).toISOString(), confirmations:1,status:'live', reporter_id:a };
  await db.exec('set role service_role');
  const created = (await db.query('select public.create_popup($1::jsonb) as result', [JSON.stringify(input)])).rows[0].result;
  assert.ok(created.id);
  assert.equal('reporter_id' in created, false);
  assert.ok(Date.parse(created.expires_at)-Date.parse(created.created_at) <= 30*60_000);
  const duplicate = (await db.query('select public.create_popup($1::jsonb) as result', [JSON.stringify({...input, brand:' BUBBLE ',reporter_id:b})])).rows[0].result;
  assert.equal(duplicate.id, created.id);
  const counts = (await db.query('select (select count(*) from public.popups)::int as pins,(select count(*) from public.reports)::int as reports')).rows[0];
  assert.deepEqual(counts, {pins:1,reports:1});
  const nearby = async (lat,lng,since,brand) => (await db.query(
    'select public.find_nearby_popup($1,$2,100,$3,$4) as result',[lat,lng,since,brand])).rows[0].result;
  const since = new Date(Date.now()-2*3600_000).toISOString();
  assert.equal((await nearby(input.lat,input.lng,since,' bubble ')).id,created.id);
  assert.equal(await nearby(35,-118,since,'Bubble'),null);
  assert.equal(await nearby(input.lat,input.lng,since,'Other'),null);
  await assert.rejects(db.query('select public.create_popup($1::jsonb)',[JSON.stringify({...input,reporter_id:outside})]),/Verified USC/);
  console.log('PASS: real RPC creation, normalized-brand deduplication, distance, private report and expiry cap');
  await db.exec('reset role');
  // Apply the upgrade after a pre-existing report to check reporter backfill too.
  await db.exec(await readFile(new URL('../supabase/migrations/202611140002_collection_and_confirmation.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.popups(lat,lng,brand,sticker,created_at,expires_at) values
    (34,-118,'Old',$1::jsonb,now()-interval '3 hours',now()+interval '1 hour'),
    (34,-118,'Expired',$1::jsonb,now()-interval '1 hour',now()-interval '1 minute')`,[JSON.stringify(input.sticker)]);
  await db.exec('set role service_role');
  assert.equal(await nearby(34,-118,since,'Old'),null);
  assert.equal(await nearby(34,-118,since,'Expired'),null);
  await db.exec('reset role');
  console.log('PASS: expired and older-than-two-hours pins do not merge');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as n from public.spots')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.catches')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n,1);
  await assert.rejects(db.query('select * from public.reports'),/permission denied/);
  await assert.rejects(db.query('select public.create_popup($1::jsonb)',[JSON.stringify(input)]),/permission denied/);
  await assert.rejects(db.query(`insert into public.catches(user_id,source,source_id,variant) values ($1,'spot','x','day')`,[a]),/permission denied/);
  console.log('PASS: RLS isolates collections/profiles and blocks direct browser writes, reports and privileged RPCs');
  for (const id of [outside,unverified,anonymous]) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from public.spots')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.popups')).rows[0].n,0);
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.spots'),/permission denied/);
  await db.exec('reset role');
  const published = (await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).rows;
  assert.deepEqual(published,[{tablename:'popups'}]);
  console.log('PASS: outsiders, unverified and anonymous accounts denied; Realtime publishes only popups');
  await checkCollection(db, { a, b, outside, unverified, anonymous, popupId: created.id, input });
  await db.exec(await readFile(new URL('../supabase/migrations/202611140003_profiles_and_friends.sql', import.meta.url), 'utf8'));
  await checkFriends(db, { a, b, outside, unverified, anonymous });
} finally { await db.close(); }
