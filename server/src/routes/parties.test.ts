import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter } from './index.js';
import type { PartyStore } from '../db/parties.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';

const actor='11111111-1111-4111-8111-111111111111';
const friend='22222222-2222-4222-8222-222222222222';
const party={quest_id:'campus-quest',owner_id:actor,members:[]};
const headers={Authorization:'Bearer valid','Content-Type':'application/json'};
async function withApi(run:(base:string)=>Promise<void>,overrides:Partial<PartyStore>={}) {
  const app=express();
  app.use('/api',createBackendRouter({authenticate:async token=>{
    if(token!=='valid')throw new ApiError(401,'Invalid session.'); return actor;
  },parties:{read:async()=>party,invite:async()=>party,remove:async()=>party,incoming:async()=>[],respond:async()=>party,...overrides}}));
  app.use(aiErrorHandler);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);}
  finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const paths=[['GET','/quests/campus-quest/party'],['POST','/quests/campus-quest/party'],
  ['DELETE',`/quests/campus-quest/party/${friend}`],['GET','/me/quest-invites'],['POST',`/quest-invites/campus-quest/${friend}`]];
test('all party routes authenticate before any database calls',async()=>{
  let calls=0; const touch=async()=>{calls++;return party;};
  await withApi(async base=>{
    for(const [method,path] of paths)for(const token of [undefined,'Bearer invalid']) {
      assert.equal((await fetch(base+path,{method,headers:token?{Authorization:token}:{}})).status,401);
    }
    assert.equal(calls,0);
  },{read:touch,invite:touch,remove:touch,respond:touch,incoming:async()=>{calls++;return [];}});
});
test('party routes take actors only from the session and validate invite/response bodies',async()=>{
  const calls:unknown[]=[];
  await withApi(async base=>{
    for(const [method,path,body] of [
      ['GET','/quests/campus-quest/party?owner_id=someone'],
      ['POST','/quests/campus-quest/party',{friend_id:friend}],
      ['DELETE',`/quests/campus-quest/party/${friend}`],
      ['GET','/me/quest-invites?user_id=someone'],
      ['POST',`/quest-invites/campus-quest/${friend}`,{accept:false}],
    ] as const) {
      const res=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
      assert.equal(res.status,200); assert.equal(res.headers.get('Cache-Control'),'no-store');
    }
  },{read:async(...args)=>{calls.push(['read',...args]);return party;},invite:async(...args)=>{calls.push(['invite',...args]);return party;},
    remove:async(...args)=>{calls.push(['remove',...args]);return party;},incoming:async(...args)=>{calls.push(['incoming',...args]);return [];},
    respond:async(...args)=>{calls.push(['respond',...args]);return party;}});
  assert.deepEqual(calls,[['read',actor,'campus-quest'],['invite',actor,'campus-quest',friend],['remove',actor,'campus-quest',friend],
    ['incoming',actor],['respond',actor,'campus-quest',friend,false]]);
});
test('caller-selected owners, join statuses, reward rolls and malformed identifiers are rejected',async()=>{
  let calls=0;
  await withApi(async base=>{
    for(const body of [{friend_id:friend,owner_id:actor},{friend_id:friend,status:'joined'},{friend_id:friend,rarity:'legendary'},
      {friend_id:'invalid'},{friend_id:friend,copies:2},{}]) {
      assert.equal((await fetch(base+'/quests/campus-quest/party',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
    }
    for(const body of [{accept:'true'},{accept:true,user_id:friend},{accept:true,party_size:3},{}]) {
      assert.equal((await fetch(base+`/quest-invites/campus-quest/${friend}`,{method:'POST',headers,body:JSON.stringify(body)})).status,400);
    }
    assert.equal((await fetch(base+'/quests/campus-quest/party/not-a-uuid',{method:'DELETE',headers})).status,400);
    assert.equal(calls,0);
  },{invite:async()=>{calls++;return party;},respond:async()=>{calls++;return party;},remove:async()=>{calls++;return party;}});
});
test('party errors preserve their status and never claim success',async()=>{
  for(const status of [403,404,409,410,503]) await withApi(async base=>{
    const res=await fetch(base+'/quests/campus-quest/party',{headers});
    assert.equal(res.status,status); assert.deepEqual(await res.json(),{error:'Party unavailable'});
  },{read:async()=>{throw new ApiError(status,'Party unavailable');}});
});
