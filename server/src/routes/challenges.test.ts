import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter } from './index.js';
import { aiErrorHandler } from '../ai/router.js';
import { ApiError } from '../ai/contracts.js';
import { createChallengeSchema } from '../db/challenges.js';
import type { BackendDependencies } from './index.js';

const actor='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
const draft={title:'Campus hunt',blurb:'A challenge',author:'student',days:7,
  stops:[{name:'A stop',lore:'Look here',art:'book',place:{kind:'point',lat:34.0205,lng:-118.2856}}],
  reward:{name:'Reward',lore:'Well done',art:'star',rarity:'epic'}};
const headers={Authorization:'Bearer valid','Content-Type':'application/json'};
async function api(run:(base:string)=>Promise<void>,overrides:Partial<BackendDependencies>={}) {
  const app=express();app.use('/api',createBackendRouter({authenticate:async token=>{
    if(token!=='valid') throw new ApiError(401,'Invalid session');return actor;
  },...overrides}));app.use(aiErrorHandler);
  const s=app.listen(0,'127.0.0.1');await new Promise<void>(r=>s.once('listening',r));
  try {await run(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api`);}
  finally {await new Promise<void>((r,j)=>s.close(e=>e?j(e):r()));}
}

test('challenge validation enforces the client duration, art, rarity, palette, pin and stop-count rules',()=>{
  assert.equal(createChallengeSchema.safeParse(draft).success,true);
  assert.equal(createChallengeSchema.safeParse({...draft,author:'org',org_id:id,days:30}).success,true);
  const bad=[{...draft,days:30},{...draft,days:2},{...draft,org_id:id},{...draft,author:'org'},
    {...draft,stops:[]},{...draft,stops:Array(9).fill(draft.stops[0])},
    {...draft,stops:[{...draft.stops[0],place:{kind:'point',lat:0,lng:0}}]},
    {...draft,reward:{...draft.reward,rarity:'legendary'}},
    {...draft,reward:{...draft.reward,colors:['#FFFFFF','#000000']}},
    {...draft,stops:[{...draft.stops[0],place:{kind:'campus',spot_id:'cq-other-1'}}]},
    {...draft,status:'live'},{...draft,author_user_id:actor},{...draft,by:'An org'},
    {...draft,ends_at:'2099-01-01T00:00:00Z'},{...draft,reviewed_by:actor}];
  for(const value of bad) assert.equal(createChallengeSchema.safeParse(value).success,false,JSON.stringify(value));
});

test('new data routes require authentication before reading or writing',async()=>{
  await api(async base=>{
    for(const [method,path] of [['GET','/challenges'],['GET','/me/orgs'],['POST','/challenges'],
      ['DELETE',`/challenges/${id}`],['POST',`/challenges/${id}/review`],
      ['POST',`/challenges/${id}/accept`],['POST','/quests/test-tour/complete']]) {
      assert.equal((await fetch(base+path,{method})).status,401,method+' '+path);
    }
  });
});

test('challenge and reward routes derive actor from session and pass only validated fields',async()=>{
  const calls:unknown[]=[];
  const save=async(...args:unknown[])=>{calls.push(args);return {id,status:'pending'} as never;};
  await api(async base=>{
    assert.equal((await fetch(base+'/challenges',{method:'POST',headers,body:JSON.stringify(draft)})).status,201);
    assert.deepEqual(calls.pop(),[actor,createChallengeSchema.parse(draft)]);
    assert.equal((await fetch(base+`/challenges/${id}/accept?user_id=attacker`,{method:'POST',headers})).status,200);
    assert.deepEqual(calls.pop(),[actor,id]);
    assert.equal((await fetch(base+'/quests/test-tour/complete?user_id=attacker',{method:'POST',headers,body:'{}'})).status,200);
    assert.deepEqual(calls.pop(),[actor,'test-tour']);
    for(const body of [{spot_ids:['fake']},{rarity:'legendary'},{party_size:3},{user_id:id}])
      assert.equal((await fetch(base+'/quests/test-tour/complete',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
    assert.equal(calls.length,0);
    assert.equal((await fetch(base+'/challenges?review=true',{headers})).status,200);
    assert.deepEqual(calls.pop(),[actor,true]);
    assert.equal((await fetch(base+'/challenges?review=garbage',{headers})).status,400);
    assert.equal((await fetch(base+`/challenges/${id}/review`,{method:'POST',headers,body:'{"status":"live"}'})).status,200);
    assert.deepEqual(calls.pop(),[actor,id,{status:'live'}]);
    assert.equal((await fetch(base+`/challenges/${id}`,{method:'DELETE',headers})).status,200);
    assert.deepEqual(calls.pop(),[actor,id]);
  },{challenges:{list:save,orgs:save,create:save,archive:save,review:save,accept:save},rewards:{complete:save}});
});

test('review authorization and expiry failures remain errors rather than successful writes',async()=>{
  await api(async base=>{
    assert.equal((await fetch(base+`/challenges/${id}/review`,{method:'POST',headers,body:'{"status":"live"}'})).status,403);
    assert.equal((await fetch(base+'/quests/cq-'+id+'/complete',{method:'POST',headers})).status,410);
  },{challenges:{list:async()=>[],orgs:async()=>[],create:async()=>{throw Error('unused');},
    archive:async()=>{throw Error('unused');},accept:async()=>{throw Error('unused');},
    review:async()=>{throw new ApiError(403,'Reviewer required');}},
    rewards:{complete:async()=>{throw new ApiError(410,'Ended');}}});
});
