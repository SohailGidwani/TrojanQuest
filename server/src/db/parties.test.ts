import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPartyStore } from './parties.js';

const actor='11111111-1111-4111-8111-111111111111';
const member='22222222-2222-4222-8222-222222222222';
const party={quest_id:'q',owner_id:actor,members:[{user_id:member,display_name:'Friend',status:'invited'}]};
function client(fetcher:typeof fetch){return createClient('https://database.example','test-key',{
  auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});}
test('party store uses checked RPCs and strips private fields from parties and incoming invites',async()=>{
  const calls:unknown[]=[];
  const db=client(async(url,init)=>{
    const name=String(url).split('/').pop();calls.push({name,args:JSON.parse(String(init?.body))});
    if(name==='list_quest_invites')return Response.json([{quest_id:'q',quest_title:'Quest',invited_at:'now',member_id:'private',
      from:{user_id:actor,display_name:'Owner',friend_code:'ABCDEF',email:'private@usc.edu'}}]);
    return Response.json({...party,secret:'private',members:[{...party.members[0],email:'private@usc.edu',lat:34}]});
  });
  const store=createPartyStore(()=>db);
  assert.deepEqual(await store.read(actor,'q'),party);
  assert.deepEqual(await store.invite(actor,'q',member),party);
  assert.deepEqual(await store.remove(actor,'q',member),party);
  assert.deepEqual(await store.respond(member,'q',actor,true),party);
  assert.deepEqual(await store.incoming(member),[{quest_id:'q',quest_title:'Quest',invited_at:'now',from:{user_id:actor,display_name:'Owner',friend_code:'ABCDEF'}}]);
  assert.deepEqual(calls,[{name:'read_quest_party',args:{p_user_id:actor,p_quest_id:'q'}},
    {name:'invite_to_quest',args:{p_user_id:actor,p_quest_id:'q',p_member_id:member}},
    {name:'remove_quest_party_member',args:{p_user_id:actor,p_quest_id:'q',p_member_id:member}},
    {name:'respond_quest_invite',args:{p_user_id:member,p_quest_id:'q',p_owner_id:actor,p_accept:true}},
    {name:'list_quest_invites',args:{p_user_id:member}}]);
});
test('invalid party identities and responses do not reach the database',async()=>{
  let calls=0;const store=createPartyStore(()=>client(async()=>{calls++;return Response.json(party);}));
  await assert.rejects(store.read('demo','q'));
  await assert.rejects(store.invite(actor,' q',member));
  await assert.rejects(store.respond(actor,'q','not-uuid',true));
  await assert.rejects(store.remove(actor,'q','not-uuid'));
  assert.equal(calls,0);
});
for(const [code,status] of [['42501',403],['22023',400],['PT404',404],['PT409',409],['PT410',410],['PT503',503],['PGRST202',503],['XX000',503]] as const){
  test(`party database error ${code} returns safe ${status}`,async()=>{
    const db=client(async()=>Response.json({code,message:'private database data'},{status:400}));
    await assert.rejects(createPartyStore(()=>db).read(actor,'q'),error=>
      typeof error==='object'&&error!==null&&'status' in error&&error.status===status&&!String(error).includes('private database'));
  });
}
