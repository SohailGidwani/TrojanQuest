import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createCollectionStore } from './collection.js';

const actor = '11111111-1111-4111-8111-111111111111';
const popup = '22222222-2222-4222-8222-222222222222';
const position = { lat: 34.0257, lng: -118.2856 };
const catchInput = { ...position, source: 'spot' as const, source_id: 'leavey' };

test('collection RPC arguments use only the authenticated actor and validated request', async () => {
  const requests: { url: string; body: unknown }[] = [];
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: false, reason: 'too_far' });
    } },
  });
  const store = createCollectionStore(() => client);
  assert.deepEqual(await store.catchSticker(actor, catchInput), { ok: false, reason: 'too_far' });
  await store.confirmPopup(actor, popup, position);
  assert.match(requests[0].url, /\/rpc\/catch_sticker$/);
  assert.deepEqual(requests[0].body, { p_user_id: actor, p_source: 'spot', p_source_id: 'leavey', p_lat: position.lat, p_lng: position.lng });
  assert.match(requests[1].url, /\/rpc\/confirm_popup$/);
  assert.deepEqual(requests[1].body, { p_user_id: actor, p_popup_id: popup, p_lat: position.lat, p_lng: position.lng });
});

test('invalid actors and coordinates never call Supabase', async () => {
  let calls = 0;
  const store = createCollectionStore(() => { calls++; throw new Error('Must not be reached'); });
  await assert.rejects(store.catchSticker('local-demo', catchInput));
  await assert.rejects(store.catchSticker(actor, { ...catchInput, lat: Number.NaN }));
  await assert.rejects(store.catchSticker(actor, { ...catchInput, lng: Infinity }));
  await assert.rejects(store.confirmPopup(actor, 'invalid', position));
  assert.equal(calls, 0);
});

for (const [code, status, message] of [
  ['42501', 403, 'A verified USC account is required for this action.'],
  ['22023', 400, 'Invalid request fields.'],
  ['PGRST202', 503, 'Apply the backend Supabase migration before using data routes.'],
  ['PT503', 503, 'Seed the sticker catalogue before collecting this sticker.'],
  ['XX000', 503, 'The database is unavailable. Please try again.'],
] as const) {
  test(`database error ${code} returns safe status ${status}`, async () => {
    const client = createClient('https://database.example', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => Response.json({ code, message: 'private SQL details' }, { status: 400 }) },
    });
    await assert.rejects(createCollectionStore(() => client).catchSticker(actor, catchInput), { status, message });
  });
}
