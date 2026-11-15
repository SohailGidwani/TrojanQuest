import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Challenge } from '../../../shared/types.js';
import { createBackendRouter } from './index.js';
import { aiErrorHandler } from '../ai/router.js';
import { ApiError } from '../ai/contracts.js';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const draft={title:'Study route',blurb:'Public route',author:'student' as const,days:3,stops:[{name:'Library',lore:'Public path',art:'book' as const,place:{kind:'point' as const,lat:34.0205,lng:-118.2856}}],reward:{name:'Book',lore:'Study',art:'book' as const,rarity:'rare' as const}};
test('creation persists pending before screening and approval rechecks it after reviewer authorisation',async()=>{
  const events:string[]=[];let outcome:'passed'|'flagged'|'unavailable'='passed';let permitted=true;
  const saved={...draft,id,by:'Team',author_user_id:'another',status:'pending',created_at:'',starts_at:'',ends_at:''} as Challenge;
  const app=express();app.use('/api',createBackendRouter({authenticate:async()=>actor,
    screenChallenge:async()=>{events.push('model');return {status:outcome,reason:'Fixture'};},
    challenges:{create:async()=>{events.push('create');return saved;},screen:async(_u,_id,screen)=>{events.push('screen');return {...saved,ai_screen:screen};},
      list:async()=>{events.push('authorise');if(!permitted)throw new ApiError(403,'Reviewer required');return [saved];},
      review:async()=>{events.push('publish');return {...saved,status:'live'};},orgs:async()=>[],archive:async()=>saved,accept:async()=>{throw Error('unused');}}}));app.use(aiErrorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await post('/challenges',draft)).status,201);assert.deepEqual(events.splice(0),['create','model','screen']);
    assert.equal((await post(`/challenges/${id}/review`,{status:'live'})).status,200);assert.deepEqual(events.splice(0),['authorise','model','screen','publish']);
    for(const value of ['flagged','unavailable'] as const){outcome=value;assert.equal((await post(`/challenges/${id}/review`,{status:'live'})).status,value==='unavailable'?503:409);assert.deepEqual(events.splice(0),['authorise','model','screen']);}
    permitted=false;assert.equal((await post(`/challenges/${id}/review`,{status:'live'})).status,403);assert.deepEqual(events.splice(0),['authorise']);
    permitted=true;saved.author_user_id=actor;assert.equal((await post(`/challenges/${id}/review`,{status:'live'})).status,403);assert.deepEqual(events.splice(0),['authorise']);
  } finally {await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
