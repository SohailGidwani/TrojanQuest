import assert from 'node:assert/strict';

/** Invoked against the isolated in-memory database, never the shared Supabase project. */
export async function checkFriends(db, { a,b,outside,unverified,anonymous }) {
  const c='66666666-6666-4666-8666-666666666666'; // Created by the collection test.
  const d='77777777-7777-4777-8777-777777777777';
  const e='88888888-8888-4888-8888-888888888888';
  await db.query(`insert into auth.users values ($1,'four@usc.edu',now(),false),($2,'five@usc.edu',now(),false)`,[d,e]);
  const rpc=async (name,args=[]) => {
    const placeholders=args.map((_,i)=>`$${i+1}`).join(',');
    return (await db.query(`select public.${name}(${placeholders}) as result`,args)).rows[0].result;
  };
  const read=id=>rpc('read_traveller_profile',[id]);
  const save=(id,name)=>rpc('save_traveller_profile',[id,name]);
  const list=id=>rpc('list_traveller_friends',[id]);
  const add=(id,code)=>rpc('add_traveller_friend',[id,code]);
  const book=(id,friend)=>rpc('read_friend_catches',[id,friend]);
  const publicKeys=['display_name','friend_code','user_id'];
  await db.exec('set role service_role');
  const original=await read(a);
  assert.deepEqual(Object.keys(original).sort(),publicKeys);
  assert.equal(original.user_id,a);
  assert.equal(await read(c),null);
  assert.deepEqual(await list(c),[]);
  const renamed=await save(a,'  Kartik Test  ');
  assert.equal(renamed.display_name,'Kartik Test');
  assert.equal(renamed.friend_code,original.friend_code);
  const created=await save(c,'नमस्ते 🐎');
  assert.match(created.friend_code,/^[A-F0-9]{12}$/);
  assert.notEqual(created.friend_code,original.friend_code);
  const saves=await Promise.all(Array.from({length:5},()=>save(c,'New name')));
  assert.ok(saves.every(p=>p.friend_code===created.friend_code));
  const bProfile=await save(b,'Beta Test');
  await assert.rejects(add(e,bProfile.friend_code),error=>error.code==='PT409');
  for(const name of ['', ' '.repeat(10), 'x'.repeat(81), 'Name\nOther', 'Name\tOther', null]) {
    await assert.rejects(save(c,name),error=>error.code==='22023');
  }
  console.log('PASS: own profile read/upsert, Unicode names, stable unique codes, validation and missing-profile handling');

  // Force a collision, then a fresh code, without changing the application migration.
  await db.exec('reset role');
  await db.query(`select set_config('test.existing_friend_code',$1,false)`,[bProfile.friend_code]);
  await db.exec(`create sequence public.__test_code_seq;
    create function public.__test_friend_code() returns text language sql volatile as $$
      select case when nextval('public.__test_code_seq')=1 then current_setting('test.existing_friend_code') else 'ABCDEF123456' end;
    $$;
    alter table public.profiles alter column friend_code set default public.__test_friend_code();`);
  await db.exec('set role service_role');
  const collisionRecovered=await save(d,'Collision fixture');
  assert.equal(collisionRecovered.friend_code,'ABCDEF123456');
  await db.exec('reset role');
  await db.exec(`alter table public.profiles alter column friend_code set default current_setting('test.existing_friend_code');`);
  await db.exec('set role service_role');
  await assert.rejects(save(e,'Collision exhausted'),error=>error.code==='PT503');
  assert.equal(await read(e),null);
  await db.exec(`reset role;
    alter table public.profiles alter column friend_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));`);
  await assert.rejects(db.query(`insert into public.profiles(user_id,display_name,friend_code) values ($1,'Duplicate',lower($2))`,[e,bProfile.friend_code]),error=>error.code==='23505');
  await db.exec('set role service_role');
  console.log('PASS: generated code collisions retry, retry exhaustion rolls back, normalized code uniqueness is enforced');

  await assert.rejects(add(a,renamed.friend_code),error=>error.code==='PT400');
  await assert.rejects(add(a,'ZZZZZZZZZZZZ'),error=>error.code==='PT404');
  await assert.rejects(add(a,'bad code'),error=>error.code==='22023');
  await assert.rejects(book(a,b),error=>error.code==='PT404');
  const added=await add(a,`  ${bProfile.friend_code.toLowerCase()}  `);
  assert.deepEqual(added,bProfile);
  await Promise.all(Array.from({length:5},()=>add(a,bProfile.friend_code)));
  assert.deepEqual(await list(a),[bProfile]);
  assert.equal((await db.query('select count(*)::int as n from public.friends where user_id=$1 and friend_id=$2',[a,b])).rows[0].n,1);
  assert.deepEqual(await list(b),[]);
  await assert.rejects(book(b,a),error=>error.code==='PT404');
  await assert.rejects(book(c,b),error=>error.code==='PT404');
  const bBook=await book(a,b);
  assert.ok(bBook.length>0);
  assert.ok(bBook.every(item=>Object.keys(item).sort().join(',')==='caught_at,id,source,source_id,variant'));
  assert.ok(bBook.every(item=>item.source_id==='leavey'));
  await add(a,created.friend_code);
  const sorted=await list(a);
  assert.deepEqual(sorted.map(p=>p.display_name),['Beta Test','New name']);
  assert.deepEqual(await book(a,c),[]);
  await add(b,renamed.friend_code);
  assert.ok((await book(b,a)).length>0);
  console.log('PASS: normalized additions are idempotent and directed; only added friends can read public catch fields');

  // Profiles/friend rows left by an admin must not expose an ineligible target.
  await db.exec('reset role');
  for(const id of [outside,unverified,anonymous]) {
    await db.query(`insert into public.profiles(user_id,display_name) values ($1,'Ineligible fixture')`,[id]);
    await db.query('insert into public.friends(user_id,friend_id) values ($1,$2)',[a,id]);
  }
  const hiddenCodes=(await db.query('select friend_code from public.profiles where user_id=any($1::uuid[])',[[outside,unverified,anonymous]])).rows;
  await db.exec('set role service_role');
  assert.equal((await list(a)).length,2);
  for(const row of hiddenCodes) await assert.rejects(add(a,row.friend_code),error=>error.code==='PT404');
  for(const id of [outside,unverified,anonymous,null]) {
    for(const operation of [()=>read(id),()=>save(id,'Denied'),()=>list(id),()=>add(id,bProfile.friend_code),()=>book(id,b)]) {
      await assert.rejects(operation(),error=>error.code==='42501');
    }
    await assert.rejects(book(a,id),error=>error.code==='PT404');
  }
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[b]);
  await db.exec('set role service_role');
  assert.equal((await list(a)).length,1);
  await assert.rejects(book(a,b),error=>error.code==='PT404');
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[b]);
  console.log('PASS: social RPCs reject ineligible actors and hide unverified, anonymous, non-USC or revoked targets');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('set role authenticated');
  for(const operation of [()=>read(a),()=>save(a,'Forged'),()=>list(a),()=>add(a,bProfile.friend_code),()=>book(a,b)]) {
    await assert.rejects(operation(),/permission denied/);
  }
  assert.equal((await db.query('select count(*)::int as n from public.profiles where user_id=$1',[b])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from public.catches where user_id=$1',[b])).rows[0].n,0);
  await assert.rejects(db.query('insert into public.friends(user_id,friend_id) values ($1,$2)',[c,b]),/permission denied/);
  await assert.rejects(db.query(`update public.profiles set friend_code='FORGED' where user_id=$1`,[a]),/permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(list(a),/permission denied/);
  await assert.rejects(book(a,b),/permission denied/);
  await db.exec('reset role');
  assert.deepEqual((await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).rows,[{tablename:'popups'}]);
  console.log('PASS: browser RLS stays own-only; social RPCs are service-only and friend identities are not published');
}
