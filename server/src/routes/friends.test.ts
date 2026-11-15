import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter } from './index.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';
import type { FriendsStore } from '../db/friends.js';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const profile = { user_id: actor, display_name: 'Kartik', friend_code: 'ABCDEF123456' };
const friend = { user_id: target, display_name: 'Friend', friend_code: '123456ABCDEF' };
const headers = { Authorization: 'Bearer valid', 'Content-Type': 'application/json' };
async function withApi(run: (url: string) => Promise<void>, overrides: Partial<FriendsStore> = {}) {
  const app = express();
  app.use('/api', createBackendRouter({
    authenticate: async token => { if (token !== 'valid') throw new ApiError(401, 'Invalid session.'); return actor; },
    social: { profile: async () => profile, saveProfile: async () => profile, list: async () => [],
      add: async () => friend, catches: async () => [], ...overrides },
  }));
  app.use(aiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`); }
  finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
}
function send(url: string, method: string, body: unknown) { return fetch(url, { method, headers, body: JSON.stringify(body) }); }

test('profile and friend routes require a valid session before touching data', async () => {
  let calls = 0;
  await withApi(async base => {
    for (const [method,path] of [['GET','/me/profile'],['PUT','/me/profile'],['GET','/friends'],['POST','/friends'],['GET',`/friends/${target}/catches`]]) {
      for (const authorization of [undefined,'Bearer invalid']) {
        const response = await fetch(base+path, { method, headers: authorization ? { Authorization: authorization } : {} });
        assert.equal(response.status,401);
      }
    }
    assert.equal(calls,0);
  }, { profile: async () => { calls++; return profile; }, saveProfile: async () => { calls++; return profile; },
    list: async () => { calls++; return []; }, add: async () => { calls++; return friend; }, catches: async () => { calls++; return []; } });
});

test('profile reads and updates use the authenticated identity and normalize display names', async () => {
  await withApi(async base => {
    const current = await fetch(base+'/me/profile?user_id='+target,{headers});
    assert.equal(current.status,200);
    assert.equal(current.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await current.json(),profile);
    const saved = await send(base+'/me/profile','PUT',{display_name:'  Kartik  '});
    assert.equal(saved.status,200);
    assert.deepEqual(await saved.json(),profile);
  }, { profile: async id => { assert.equal(id,actor); return profile; }, saveProfile: async (id,input) => {
    assert.equal(id,actor); assert.deepEqual(input,{display_name:'Kartik'}); return profile;
  } });
});

test('invalid names, chosen codes and caller-selected profile identities are rejected', async () => {
  let calls = 0;
  await withApi(async base => {
    for (const body of [{display_name:''},{display_name:' '.repeat(10)},{display_name:'x'.repeat(81)},
      {display_name:'Kartik\nOther'},{display_name:'Kartik\u0000'}, {display_name:'Kartik',friend_code:'CHOSEN'},
      {display_name:'Kartik',user_id:target},{display_name:42}]) {
      assert.equal((await send(base+'/me/profile','PUT',body)).status,400);
    }
    assert.equal(calls,0);
  },{ saveProfile: async () => { calls++; return profile; } });
});

test('friend list and code addition use the current account; code lookup is normalized', async () => {
  await withApi(async base => {
    assert.deepEqual(await (await fetch(base+'/friends?user_id='+target,{headers})).json(),[friend]);
    const response = await send(base+'/friends','POST',{friend_code:'  123456abcdef  '});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),friend);
  }, { list: async id => { assert.equal(id,actor); return [friend]; }, add: async (id,code) => {
    assert.equal(id,actor); assert.equal(code,'123456ABCDEF'); return friend;
  } });
});

test('malformed codes, extra target IDs and invalid book IDs never reach the social store', async () => {
  let calls = 0;
  await withApi(async base => {
    for (const body of [{friend_code:''},{friend_code:'abc'},{friend_code:'A'.repeat(65)},
      {friend_code:'ABC DEF'},{friend_code:123456},{friend_code:'123456ABCDEF',friend_id:target},
      {friend_code:'123456ABCDEF',user_id:target}]) {
      assert.equal((await send(base+'/friends','POST',body)).status,400);
    }
    assert.equal((await fetch(base+'/friends/not-a-uuid/catches',{headers})).status,400);
    assert.equal(calls,0);
  },{ add: async () => { calls++; return friend; }, catches: async () => { calls++; return []; } });
});

test('book requests pass viewer and friend separately to the authorization-enforcing store', async () => {
  const book = [{id:'catch-1',source:'spot',source_id:'leavey',variant:'day',caught_at:'2026-11-15T00:00:00Z'}];
  await withApi(async base => {
    const response = await fetch(base+`/friends/${target}/catches?user_id=${target}`,{headers});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),book);
  },{ catches: async (viewer,id) => { assert.equal(viewer,actor); assert.equal(id,target); return book as Awaited<ReturnType<FriendsStore['catches']>>; } });
});

for (const [method,path,status,message] of [
  ['GET','/me/profile',404,'Save your profile to get a friend code.'],
  ['POST','/friends',400,'You cannot add your own friend code.'],
  ['POST','/friends',404,'That friend code or sticker book was not found.'],
  ['POST','/friends',409,'Save your profile before adding friends.'],
  ['GET',`/friends/${target}/catches`,404,'That friend code or sticker book was not found.'],
  ['GET','/friends',503,'Apply the backend Supabase migration before using data routes.'],
] as const) {
  test(`social route preserves ${status}: ${message}`, async () => {
    const fail = async (): Promise<never> => { throw new ApiError(status,message); };
    await withApi(async base => {
      const response = method==='GET' ? await fetch(base+path,{headers}) : await send(base+path,method,{friend_code:friend.friend_code});
      assert.equal(response.status,status);
      assert.deepEqual(await response.json(),{error:message});
    },{profile:fail,saveProfile:fail,list:fail,add:fail,catches:fail});
  });
}
