import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentEnvironment } from './dev.mjs';

test('both platforms receive development variables without shell assignment syntax', () => {
  const original = { PATH: 'existing-path', PRIVATE_SETTING: 'preserved' };
  assert.deepEqual(developmentEnvironment(false, original), { ...original, NODE_ENV: 'development' });
  assert.deepEqual(developmentEnvironment(true, original), { ...original, NODE_ENV: 'development', DEMO_MODE: 'true' });
  assert.equal(original.NODE_ENV, undefined);
  assert.equal(developmentEnvironment(false, { DEMO_MODE: 'true' }).DEMO_MODE, 'true');
});
