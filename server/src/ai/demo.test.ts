import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../index.js';
import { createDemoStore, demoEnabled } from './demo.js';
import type { NewPopup } from './contracts.js';

const input: NewPopup = {
  lat: 34.0257, lng: -118.2856, brand: 'Bubble Co.', freebies: ['samples'],
  sticker: { key: 'bubble', name: 'Bubbles', colors: ['#FFFFFF', '#0099FF'], lore: 'Samples!', source: 'popup', variant: 'special' },
  expires_at: '2026-11-15T00:30:00Z', confirmations: 1, status: 'live', reporter_id: 'local-demo',
};
test('demo requires explicit opt-in and refuses non-development environments', () => {
  assert.equal(demoEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(demoEnabled({ DEMO_MODE: 'true', NODE_ENV: 'development' }), true);
  for (const NODE_ENV of ['production', 'test', undefined]) {
    assert.throws(() => demoEnabled({ DEMO_MODE: 'true', NODE_ENV }), /development/);
  }
});
test('demo store finds only live nearby matching-brand pins and expires them on read', async () => {
  let now = new Date('2026-11-15T00:00:00Z');
  const store = createDemoStore(() => now);
  const pin = await store.createPopup(input);
  assert.equal(store.list().length, 1);
  assert.equal('reporter_id' in store.list()[0], false);
  const query = { lat: input.lat, lng: input.lng, brand: 'bubble co.', since: '2026-11-14T22:00:00Z', withinMeters: 100 };
  assert.equal((await store.findNearbyPopup(query))?.id, pin.id);
  assert.equal(await store.findNearbyPopup({ ...query, lat: 34.05 }), null);
  assert.equal(await store.findNearbyPopup({ ...query, brand: 'Other' }), null);
  assert.equal(await store.findNearbyPopup({ ...query, since: '2026-11-15T00:01:00Z' }), null);
  now = new Date('2026-11-15T00:30:00Z');
  assert.deepEqual(store.list(), []);
  assert.equal(await store.findNearbyPopup(query), null);
  assert.deepEqual(createDemoStore().list(), []);
});
async function withApp(env: NodeJS.ProcessEnv, run: (base: string) => Promise<void>) {
  const server = (await createApp(env)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
test('local demo serves the workbench and allows validation without an access token', async () => {
  await withApp({ NODE_ENV: 'development', DEMO_MODE: 'true' }, async base => {
    const page = await fetch(`${base}/dev/ai`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /AI workbench/);
    assert.deepEqual(await (await fetch(`${base}/dev/ai/popups`)).json(), []);
    const response = await fetch(`${base}/api/popups/report`, { method: 'POST' });
    assert.equal(response.status, 400);
  });
});
test('normal operation still requires USC auth and has no demo endpoints', async () => {
  await withApp({ NODE_ENV: 'development' }, async base => {
    const response = await fetch(`${base}/api/popups/report`, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal((await fetch(`${base}/dev/ai/popups`)).status, 404);
  });
});
