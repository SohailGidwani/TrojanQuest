import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { NewPopup, PopupStore } from '../../../shared/types.js';
import type { PopupStore as AiPopupStore } from '../ai/contracts.js';
import { createPopupStore } from './popups.js';
import { spotsFileSchema } from './schemas.js';

const input: NewPopup = {
  lat: 34.0257, lng: -118.2856, brand: 'Bubble', freebies: ['Samples'],
  sticker: { key: 'bubble', name: 'Bubbles', colors: ['#FFFFFF', '#FF0000'], lore: 'Samples!', source: 'popup', variant: 'special' },
  expires_at: '2026-11-15T00:30:00Z', confirmations: 1, status: 'live',
  reporter_id: '11111111-1111-4111-8111-111111111111',
};
// Compile-time check: the shared contract is assignable to Sohail's existing boundary.
const compatible = (store: PopupStore): AiPopupStore => store;

test('database helpers match the AI contract and strip reporter metadata', async () => {
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      assert.match(String(url), /\/rpc\/create_popup$/);
      assert.equal(JSON.parse(String(init?.body)).input.reporter_id, input.reporter_id);
      return Response.json({ ...input, id: 'popup-1', created_at: '2026-11-15T00:00:00Z', brand_normalized: 'bubble' });
    } },
  });
  const popup = await compatible(createPopupStore(() => client)).createPopup(input);
  assert.equal(popup.id, 'popup-1');
  assert.equal('reporter_id' in popup, false);
  assert.equal('brand_normalized' in popup, false);
  assert.equal('created_at' in popup, false);
});

test('lookup preserves creation time for AI deduplication and supports no match', async () => {
  let match = true;
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).p_within_meters, 100);
      return Response.json(match ? { ...input, id: 'popup-1', created_at: '2026-11-15T00:00:00Z' } : null);
    } },
  });
  const query = { lat: input.lat, lng: input.lng, withinMeters: 100, since: '2026-11-14T22:00:00Z', brand: 'Bubble' };
  const store = createPopupStore(() => client);
  const popup = await store.findNearbyPopup(query);
  assert.equal(popup?.created_at, '2026-11-15T00:00:00Z');
  assert.equal('reporter_id' in popup!, false);
  match = false;
  assert.equal(await store.findNearbyPopup(query), null);
});

test('invalid coordinates never reach the database and SQL details stay private', async () => {
  let calls = 0;
  const client = createClient('https://database.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => { calls++; return Response.json({ code: '42P01', message: 'private SQL information' }, { status: 404 }); } },
  });
  const store = createPopupStore(() => client);
  await assert.rejects(store.createPopup({ ...input, lat: 100 }));
  assert.equal(calls, 0);
  await assert.rejects(store.createPopup(input), { status: 503, message: 'Apply the backend Supabase migration before using data routes.' });
});

test('seed validation rejects duplicate IDs and invalid campus coordinates', () => {
  const spot = { id: 'leavey', name: 'Leavey', lat: 34, lng: -118, category: 'study', card_text: 'Study', tip: 'Tip', sticker_key: 'book' };
  assert.equal(spotsFileSchema.safeParse([spot]).success, true);
  assert.equal(spotsFileSchema.safeParse([spot, spot]).success, false);
  assert.equal(spotsFileSchema.safeParse([{ ...spot, lng: 181 }]).success, false);
});
