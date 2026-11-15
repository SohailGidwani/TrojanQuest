import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter } from './index.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';

test('sticker catalogue requires authentication and returns ended metadata without caching', async () => {
  let calls=0;
  const catalogue=[{key:'ended',name:'Ended edition',rarity:'exclusive' as const,tags:['event'],available_until:'2026-01-01T00:00:00Z'}];
  const app=express();
  app.use('/api',createBackendRouter({authenticate:async token=>{
    if(token!=='valid') throw new ApiError(403,'Sign in with a verified USC account.'); return 'verified';
  },stickers:{list:async()=>{calls++;return catalogue;}}}));
  app.use(aiErrorHandler);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {
    const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stickers`;
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Authorization:'Bearer invalid'}})).status,403);
    assert.equal(calls,0);
    const response=await fetch(url,{headers:{Authorization:'Bearer valid'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await response.json(),catalogue);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
