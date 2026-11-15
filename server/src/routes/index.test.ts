import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter, type BackendDependencies } from './index.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';
import type { CollectionFailureReason } from '../../../shared/types.js';

async function withApi(run: (url: string) => Promise<void>, overrides: Partial<BackendDependencies> = {}) {
  const app = express();
  app.use('/api', createBackendRouter({
    authenticate: async (token) => {
      if (token !== 'valid') throw new ApiError(401, 'Invalid or expired session.');
      return 'verified-user';
    },
    store: { spots: async () => [], popups: async () => [], orgDrops: async () => [], catches: async () => [] },
    ...overrides,
  }));
  app.use(aiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const headers = { Authorization: 'Bearer valid' };
const popupId = '11111111-1111-4111-8111-111111111111';
const catchBody = { source: 'spot', source_id: 'leavey', lat: 34.0257, lng: -118.2856 };
const catchAward = { ok: true as const, sticker: { key: 'book', name: 'Leavey', source: 'spot' as const, variant: 'night' as const },
  variant: 'night' as const, already_caught: false };
const confirmation = { ok: true as const, expires_at: '2026-11-15T04:00:00Z', confirmations: 2, already_confirmed: false };
function post(url: string, path: string, body: unknown, auth: Record<string, string> = headers) {
  return fetch(url + path, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('data routes require authentication before touching the database', async () => {
  let calls = 0;
  await withApi(async url => {
    for (const path of ['/spots', '/popups', '/org-drops', '/me/catches']) {
      assert.equal((await fetch(url + path)).status, 401);
      assert.equal((await fetch(url + path, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    }
    assert.equal(calls, 0);
  }, { store: { spots: async () => { calls++; return []; }, popups: async () => { calls++; return []; },
    orgDrops: async () => { calls++; return []; }, catches: async () => { calls++; return []; } } });
});

test('USC authorization failures preserve their status', async () => {
  await withApi(async url => {
    assert.equal((await fetch(url + '/spots', { headers })).status, 403);
  }, { authenticate: async () => { throw new ApiError(403, 'Sign in with a verified @usc.edu email.'); } });
});

test('collection uses the verified session identity and ignores caller-supplied user IDs', async () => {
  let requestedUser: string | undefined;
  await withApi(async url => {
    const response = await fetch(url + '/me/catches?user_id=someone-else', { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), []);
    assert.equal(requestedUser, 'verified-user');
  }, { store: { spots: async () => [], popups: async () => [], orgDrops: async () => [],
    catches: async id => { requestedUser = id; return []; } } });
});

test('unknown paths stay 404 and database unavailability is explicit', async () => {
  await withApi(async url => {
    assert.equal((await fetch(url + '/not-built')).status, 404);
    const response = await fetch(url + '/spots', { headers });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Apply the backend Supabase migration before using data routes.' });
  }, { store: { spots: async () => { throw new ApiError(503, 'Apply the backend Supabase migration before using data routes.'); },
    popups: async () => [], orgDrops: async () => [], catches: async () => [] } });
});

test('write routes require verified sessions before invoking any actions', async () => {
  let calls = 0;
  await withApi(async url => {
    for (const path of ['/catch', `/popups/${popupId}/confirm`]) {
      assert.equal((await post(url, path, {}, {})).status, 401);
      assert.equal((await post(url, path, {}, { Authorization: 'Bearer invalid' })).status, 401);
    }
    assert.equal(calls, 0);
  }, { actions: {
    catchSticker: async () => { calls++; return catchAward; },
    confirmPopup: async () => { calls++; return confirmation; },
  } });
});

test('catch passes session identity and coordinates, and returns the authoritative variant', async () => {
  await withApi(async url => {
    const response = await post(url, '/catch?user_id=someone-else', catchBody);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), catchAward);
  }, { actions: {
    catchSticker: async (actor, input) => {
      assert.equal(actor, 'verified-user');
      assert.deepEqual(input, catchBody);
      return catchAward;
    }, confirmPopup: async () => confirmation,
  } });
});

test('write validation rejects impossible coordinates, chosen variants, identities and malformed popup IDs', async () => {
  let calls = 0;
  await withApi(async url => {
    for (const body of [{ ...catchBody, lat: 91 }, { ...catchBody, lng: -181 }, { ...catchBody, lat: '34' },
      { ...catchBody, lat: null }, { ...catchBody, variant: 'morning' }, { ...catchBody, user_id: 'other' },
      { ...catchBody, source: 'popup', source_id: 'not-a-uuid' }, { ...catchBody, source: 'invalid' }]) {
      assert.equal((await post(url, '/catch', body)).status, 400);
    }
    assert.equal((await post(url, '/popups/not-a-uuid/confirm', { lat: 34, lng: -118 })).status, 400);
    assert.equal((await post(url, `/popups/${popupId}/confirm`, { lat: 34, lng: -118, user_id: 'other' })).status, 400);
    assert.equal((await post(url, `/popups/${popupId}/confirm`, { lat: 34 })).status, 400);
    assert.equal(calls, 0);
  }, { actions: { catchSticker: async () => { calls++; return catchAward; }, confirmPopup: async () => { calls++; return confirmation; } } });
});

for (const [reason, status] of Object.entries({ too_far: 200, not_found: 404, not_started: 409, expired: 410, quest_not_available: 409 })) {
  test(`catch returns ${status} for ${reason} without granting a sticker`, async () => {
    await withApi(async url => {
      const response = await post(url, '/catch', catchBody);
      assert.equal(response.status, status);
      const result = await response.json() as Record<string, unknown>;
      assert.equal(result.ok, false);
      assert.equal(result.reason, reason);
      assert.equal('sticker' in result, false);
    }, { actions: { catchSticker: async () => ({ ok: false, reason: reason as CollectionFailureReason }), confirmPopup: async () => confirmation } });
  });
}

test('repeated collection and confirmation return flags without turning retries into errors', async () => {
  await withApi(async url => {
    const caught = await post(url, '/catch', catchBody);
    assert.equal(caught.status, 200);
    assert.equal((await caught.json() as { already_caught: boolean }).already_caught, true);
    const confirmed = await post(url, `/popups/${popupId}/confirm`, { lat: 34, lng: -118 });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await confirmed.json(), { expires_at: confirmation.expires_at, confirmations: 2, already_confirmed: true });
  }, { actions: { catchSticker: async () => ({ ...catchAward, already_caught: true }), confirmPopup: async (actor, id, position) => {
    assert.equal(actor, 'verified-user');
    assert.equal(id, popupId);
    assert.deepEqual(position, { lat: 34, lng: -118 });
    return { ...confirmation, already_confirmed: true };
  } } });
});

for (const [reason, status] of Object.entries({ too_far: 409, not_found: 404, expired: 410 })) {
  test(`confirmation returns ${status} for ${reason}`, async () => {
    await withApi(async url => {
      const response = await post(url, `/popups/${popupId}/confirm`, { lat: 34, lng: -118 });
      assert.equal(response.status, status);
      const result = await response.json() as Record<string, unknown>;
      assert.equal(result.reason, reason);
      assert.equal(typeof result.error, 'string');
      assert.equal('expires_at' in result, false);
    }, { actions: { catchSticker: async () => catchAward, confirmPopup: async () => ({ ok: false, reason: reason as CollectionFailureReason }) } });
  });
}
