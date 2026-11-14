import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { authenticate } from './integrations.js';

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
const verifiedUser = {
  id: 'usc-student', aud: 'authenticated', role: 'authenticated', email: 'student@usc.edu',
  email_confirmed_at: '2026-11-14T12:00:00Z', confirmed_at: '2026-11-14T12:00:00Z',
  phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z', is_anonymous: false,
};
const users: Record<string, object> = {
  valid: verifiedUser,
  uppercase: { ...verifiedUser, email: 'Student@USC.EDU' },
  otherDomain: { ...verifiedUser, email: 'student@gmail.com', user_metadata: { email: 'student@usc.edu' } },
  lookalike: { ...verifiedUser, email: 'student@usc.edu.evil.example' },
  subdomain: { ...verifiedUser, email: 'student@other.usc.edu' },
  unverified: { ...verifiedUser, email_confirmed_at: null, confirmed_at: null },
  anonymous: { ...verifiedUser, is_anonymous: true },
  noEmail: { ...verifiedUser, email: undefined },
};
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const user = users[req.headers.authorization?.replace('Bearer ', '') ?? ''];
  if (!user || req.url !== '/auth/v1/user') {
    res.writeHead(401); res.end(JSON.stringify({ code: 'bad_jwt', msg: 'Invalid JWT' })); return;
  }
  res.end(JSON.stringify(user));
});
before(async () => {
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_ANON_KEY = 'test-publishable-key';
});
after(async () => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('verified USC email sessions can access the AI API', async () => {
  assert.equal(await authenticate('valid'), 'usc-student');
  assert.equal(await authenticate('uppercase'), 'usc-student');
});
for (const token of ['otherDomain', 'lookalike', 'subdomain', 'unverified', 'anonymous', 'noEmail']) {
  test(`rejects ${token} sessions even when Supabase returns a user`, async () => {
    await assert.rejects(authenticate(token), { status: 403 });
  });
}
test('invalid or revoked Supabase sessions remain unauthorized', async () => {
  await assert.rejects(authenticate('invalid'), { status: 401 });
});
