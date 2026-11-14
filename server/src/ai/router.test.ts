import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiRouter, aiErrorHandler, type RouterDependencies } from './router.js';
import { Ollama } from './ollama.js';
import { ApiError } from './contracts.js';

async function withApi(run: (url: string) => Promise<void>, overrides: Partial<RouterDependencies> = {}) {
  const app = express();
  app.use('/api', createAiRouter({
    authenticate: async token => { if (token !== 'valid') throw new Error('Invalid token'); return 'u1'; },
    getStore: async () => ({ findNearbyPopup: async () => null, createPopup: async input => ({ ...input, id: 'p1' }) }),
    model: new Ollama({ fetch: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ accepted: true, reject_reason: null, brand: 'Bubble', freebies: [], duration_minutes: 30, sticker: { key: 'bubble', name: 'Bubbles', colors: ['#FFFFFF', '#FF0000'], lore: 'Samples!' } }) } })) }),
    ...overrides,
  }));
  app.use(aiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
function photoForm(bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0])) {
  const body = new FormData();
  body.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');
  body.append('lat', '34.0257'); body.append('lng', '-118.2856');
  return body;
}
const headers = { Authorization: 'Bearer valid' };

test('non-pop-up photos are rejected even before database helpers are available', async () => {
  await withApi(async url => {
    const response = await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      accepted: false, reject_reason: 'No pop-up visible.', merged_into: null, popup: null,
    });
  }, {
    getStore: async () => { throw new ApiError(503, 'Database helpers unavailable.'); },
    model: new Ollama({ fetch: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({
      accepted: false, reject_reason: 'No pop-up visible.', brand: null,
      freebies: [], duration_minutes: null, sticker: null,
    }) } })) }),
  });
});

test('accepted photos still require working database helpers', async () => {
  await withApi(async url => {
    const response = await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm() });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Database helpers unavailable.' });
  }, { getStore: async () => { throw new ApiError(503, 'Database helpers unavailable.'); } });
});

test('report requires a verified user before reading photo uploads', async () => {
  await withApi(async url => {
    assert.equal((await fetch(`${url}/popups/report`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${url}/popups/report`, { method: 'POST', headers: { Authorization: 'Bearer fake' } })).status, 401);
  });
});

test('multipart photo route returns contract JSON without private reporter data', async () => {
  await withApi(async url => {
    const response = await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm() });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.popup.id, 'p1');
    assert.equal(result.popup.sticker.variant, 'special');
    assert.equal('reporter_id' in result.popup, false);
  });
});

test('report rejects malformed coordinates and files disguised as photos', async () => {
  await withApi(async url => {
    const body = photoForm(); body.set('lat', '');
    assert.equal((await fetch(`${url}/popups/report`, { method: 'POST', headers, body })).status, 400);
    assert.equal((await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm(Buffer.from('text')) })).status, 400);
    assert.equal((await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm(Buffer.alloc(5 * 1024 * 1024 + 1)) })).status, 413);
  });
});

test('fourth report in an hour is rate limited for the same verified user', async () => {
  await withApi(async url => {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm() })).status, 200);
    const result = await fetch(`${url}/popups/report`, { method: 'POST', headers, body: photoForm() });
    assert.equal(result.status, 429);
    assert.ok(result.headers.get('Retry-After'));
  });
});

test('missing content returns an actionable unavailable response', async () => {
  await withApi(async url => {
    const response = await fetch(`${url}/quests/suggest`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ interests: 'study' }) });
    assert.equal(response.status, 503);
  }, { contentDirectory: '/nonexistent-trojanquest-content' });
});

test('invalid JSON returns a safe 400 rather than an HTML stack trace', async () => {
  await withApi(async url => {
    const response = await fetch(`${url}/guide/ask`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
    assert.ok((response.headers.get('Content-Type') ?? '').includes('application/json'));
  });
});

test('guide loads authored USC pages and rejects non-USC source links', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trojanquest-guide-'));
  try {
    await writeFile(join(dir, 'health.txt'), 'https://studenthealth.usc.edu/\n# Health\nVisit the health center.');
    await withApi(async url => {
      const response = await fetch(`${url}/guide/ask`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Where is health?' }) });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json() as any).citations, [{ title: 'Health', url: 'https://studenthealth.usc.edu/' }]);
    }, { contentDirectory: join(dir, '..'), guideDirectory: dir,
      model: new Ollama({ fetch: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ passages: [{ source: 0, quote: 'Visit the health center.' }] }) } })) }) });
    await writeFile(join(dir, 'health.txt'), 'https://usc.edu.evil.example/\nBad source');
    await withApi(async url => {
      assert.equal((await fetch(`${url}/guide/ask`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Where?' }) })).status, 503);
    }, { guideDirectory: dir });
  } finally { await rm(dir, { recursive: true }); }
});
