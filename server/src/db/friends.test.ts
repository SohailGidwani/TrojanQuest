import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createFriendsStore } from './friends.js';

const actor='11111111-1111-4111-8111-111111111111';
const target='22222222-2222-4222-8222-222222222222';
const profile={user_id:actor,display_name:'Kartik',friend_code:'ABCDEF123456'};
function client(fetcher: typeof fetch) {
  return createClient('https://database.example','test-key',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher},
  });
}

test('social RPCs use session IDs and expose only public profile and catch fields', async () => {
  const calls: {name:string;args:unknown}[]=[];
  const db=client(async (url,init)=>{
    const name=String(url).split('/').pop()!;
    calls.push({name,args:JSON.parse(String(init?.body))});
    if(name==='list_traveller_friends') return Response.json([{...profile,email:'private@usc.edu',lat:34}]);
    if(name==='read_friend_catches') return Response.json([{id:'c1',source:'spot',source_id:'leavey',variant:'day',caught_at:'2026-11-15T00:00:00Z',user_id:target,lat:34}]);
    return Response.json({...profile,email:'private@usc.edu',created_at:'private'});
  });
  const store=createFriendsStore(()=>db);
  assert.deepEqual(await store.profile(actor),profile);
  assert.deepEqual(await store.saveProfile(actor,{display_name:' Kartik '}),profile);
  assert.deepEqual(await store.list(actor),[profile]);
  assert.deepEqual(await store.add(actor,' abcdef123456 '),profile);
  assert.deepEqual(await store.catches(actor,target),[{id:'c1',source:'spot',source_id:'leavey',variant:'day',caught_at:'2026-11-15T00:00:00Z'}]);
  assert.deepEqual(calls,[
    {name:'read_traveller_profile',args:{p_user_id:actor}},
    {name:'save_traveller_profile',args:{p_user_id:actor,p_display_name:'Kartik'}},
    {name:'list_traveller_friends',args:{p_user_id:actor}},
    {name:'add_traveller_friend',args:{p_user_id:actor,p_friend_code:'ABCDEF123456'}},
    {name:'read_friend_catches',args:{p_user_id:actor,p_friend_id:target}},
  ]);
});

test('missing profiles return 404; invalid identities and names never call the database', async () => {
  let calls=0;
  const db=client(async ()=>{calls++;return Response.json(null);});
  const store=createFriendsStore(()=>db);
  await assert.rejects(store.profile('local-demo'));
  await assert.rejects(store.saveProfile(actor,{display_name:'\n'}));
  await assert.rejects(store.add(actor,'bad code'));
  await assert.rejects(store.catches(actor,'not-a-uuid'));
  assert.equal(calls,0);
  await assert.rejects(store.profile(actor),{status:404,message:'Save your profile to get a friend code.'});
});

for(const [code,status,message] of [
  ['42501',403,'A verified USC account is required for this action.'],
  ['PT400',400,'You cannot add your own friend code.'],
  ['PT404',404,'That friend code or sticker book was not found.'],
  ['PT409',409,'Save your profile before adding friends.'],
  ['22023',400,'Invalid request fields.'],
  ['PGRST202',503,'Apply the backend Supabase migration before using data routes.'],
  ['23505',503,'The database is unavailable. Please try again.'],
  ['PT503',503,'The database is unavailable. Please try again.'],
] as const) {
  test(`social SQL error ${code} maps to a safe ${status}`,async ()=>{
    const db=client(async ()=>Response.json({code,message:'private SQL details'},{status:400}));
    await assert.rejects(createFriendsStore(()=>db).add(actor,'ABCDEF123456'),{status,message});
  });
}
