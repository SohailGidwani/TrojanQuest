import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createChallengeStore, challengeFailure } from './challenges.js';
import { createQuestRewardStore } from './quest-rewards.js';

const actor='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
test('challenge/reward stores call the trusted RPCs and never pass a caller-selected reward',async()=>{
  const calls:{name:string;body:unknown}[]=[];
  const client=createClient('https://database.example','test-key',{auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(url,init)=>{calls.push({name:new URL(String(url)).pathname.split('/').pop()!,body:JSON.parse(String(init?.body))});return Response.json({id});}}});
  const store=createChallengeStore(()=>client);
  await store.list(actor,true);await store.orgs(actor);await store.archive(actor,id);
  await store.review(actor,id,{status:'rejected',reason:'Not a public location'});await store.accept(actor,id);
  await createQuestRewardStore(()=>client).complete(actor,'cq-'+id);
  assert.deepEqual(calls.map(x=>x.name),['list_challenges','list_challenge_orgs','archive_challenge','review_challenge','accept_challenge','complete_accepted_quest']);
  assert.deepEqual(calls[0].body,{p_user_id:actor,p_review:true});
  assert.deepEqual(calls.at(-1)?.body,{p_user_id:actor,p_quest_id:'cq-'+id});
  await assert.rejects(async()=>store.accept('local-demo',id));
});

test('challenge database failures have safe status codes without SQL details',()=>{
  for(const [code,status] of [['42501',403],['22023',400],['23514',400],['PT404',404],['PT409',409],['PT410',410],['PT429',429],['PT503',503],['42883',503]] as const)
    assert.throws(()=>challengeFailure({code}),e=>typeof e==='object' && e!==null && 'status' in e && e.status===status);
});
