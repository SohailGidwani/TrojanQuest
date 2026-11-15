import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter } from './index.js';
import type { QuestStore } from '../db/quests.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';

const actor='11111111-1111-4111-8111-111111111111';
const result={quest_id:'test-tour',accepted_at:'2026-11-15T00:00:00Z',already_accepted:false};
const headers={Authorization:'Bearer valid','Content-Type':'application/json'};
async function withApi(run: (base: string)=>Promise<void>, overrides: Partial<QuestStore>={}) {
  const app=express();
  app.use('/api',createBackendRouter({authenticate:async token=>{
    if(token!=='valid') throw new ApiError(401,'Invalid session.');return actor;
  },quests:{list:async()=>[],accept:async()=>result,...overrides}}));
  app.use(aiErrorHandler);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);}
  finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('acceptance routes require a verified session before any data access',async ()=>{
  let calls=0;
  await withApi(async base=>{
    for(const [method,path] of [['GET','/me/quests'],['POST','/quests/test-tour/accept']]) {
      for(const authorization of [undefined,'Bearer invalid']) {
        assert.equal((await fetch(base+path,{method,headers:authorization?{Authorization:authorization}:{}})).status,401);
      }
    }
    assert.equal(calls,0);
  },{list:async()=>{calls++;return [];},accept:async()=>{calls++;return result;}});
});

test('accept uses the session and URL ID; empty request bodies are supported',async ()=>{
  await withApi(async base=>{
    const response=await fetch(base+'/quests/test-tour/accept?user_id=other',{method:'POST',headers});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await response.json(),result);
  },{accept:async (user,id)=>{assert.equal(user,actor);assert.equal(id,'test-tour');return result;}});
});

test('clients cannot choose acceptance times, actors, stops or reward definitions',async ()=>{
  let calls=0;
  await withApi(async base=>{
    for(const body of [{user_id:'other'},{accepted_at:'2020-01-01T00:00:00Z'},
      {spot_ids:['one','two','three']},{reward_sticker_key:'free-reward'},{quest_id:'other'},[]]) {
      assert.equal((await fetch(base+'/quests/test-tour/accept',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
    }
    assert.equal(calls,0);
  },{accept:async()=>{calls++;return result;}});
});

test('list reads only the current account and duplicates return the original timestamp',async ()=>{
  await withApi(async base=>{
    const response=await fetch(base+'/me/quests?user_id=other',{headers});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),[{quest_id:result.quest_id,accepted_at:result.accepted_at}]);
    const repeated=await fetch(base+'/quests/test-tour/accept',{method:'POST',headers,body:'{}'});
    assert.equal(repeated.status,200);
    assert.deepEqual(await repeated.json(),{...result,already_accepted:true});
  },{list:async user=>{assert.equal(user,actor);return [{quest_id:result.quest_id,accepted_at:result.accepted_at}];},
    accept:async()=>({...result,already_accepted:true})});
});

for(const status of [404,409,410,503]) {
  test(`acceptance preserves ${status} without recording success`,async ()=>{
    await withApi(async base=>{
      const response=await fetch(base+'/quests/test-tour/accept',{method:'POST',headers,body:'{}'});
      assert.equal(response.status,status);
      assert.deepEqual(await response.json(),{error:'Unavailable quest'});
    },{accept:async()=>{throw new ApiError(status,'Unavailable quest');}});
  });
}
