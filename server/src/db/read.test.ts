import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createReadStore } from './read.js';

test('initial map queries exclude expired popups and inactive organisation events', async () => {
  const requests: URL[] = [];
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { requests.push(new URL(String(url))); return Response.json([]); } },
  });
  const store = createReadStore(() => client);
  assert.deepEqual(await store.popups(), []);
  assert.deepEqual(await store.orgDrops(), []);
  assert.equal(requests[0].searchParams.get('status'), 'eq.live');
  assert.match(requests[0].searchParams.get('expires_at')!, /^gt\.\d{4}-/);
  assert.equal(requests[0].searchParams.get('select')?.includes('reporter_id'), false);
  assert.match(requests[1].searchParams.get('starts_at')!, /^lte\.\d{4}-/);
  assert.match(requests[1].searchParams.get('ends_at')!, /^gt\.\d{4}-/);
});

test('privileged collection reads always constrain the requested owner', async () => {
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => {
      const query = new URL(String(url)).searchParams;
      assert.equal(query.get('user_id'), 'eq.verified-user');
      assert.equal(query.get('select')?.includes('user_id'), false);
      assert.equal(query.get('order'), 'caught_at.desc');
      return Response.json([]);
    } },
  });
  assert.deepEqual(await createReadStore(() => client).catches('verified-user'), []);
});
