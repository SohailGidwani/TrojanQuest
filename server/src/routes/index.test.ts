import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createBackendRouter, type BackendDependencies } from './index.js';
import { ApiError } from '../ai/contracts.js';
import { aiErrorHandler } from '../ai/router.js';

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
