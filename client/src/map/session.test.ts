import test from 'node:test'
import assert from 'node:assert/strict'
import { observeSession } from './session.ts'
import type { CampusSession, SessionState } from './session.ts'

function fixture() {
  let resolve!: (session: CampusSession) => void
  let reject!: (error: Error) => void
  let emit!: (session: CampusSession) => void
  let unsubscribed = false
  const states: SessionState[] = []
  const stop = observeSession({
    read: () => new Promise((yes, no) => { resolve = yes; reject = no }),
    subscribe(listener) { emit = listener; return () => { unsubscribed = true } },
  }, state => states.push(state))
  return { resolve, reject, emit, stop, states, unsubscribed: () => unsubscribed }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('restores an existing session, follows refresh, and clears it on sign-out', async () => {
  const f = fixture()
  f.resolve({ access_token: 'existing' }); await settle()
  f.emit({ access_token: 'refreshed' }); f.emit(null)
  assert.deepEqual(f.states, [{ ready: true, accessToken: 'existing' }, { ready: true, accessToken: 'refreshed' }, { ready: true, accessToken: undefined }])
  f.stop(); assert.equal(f.unsubscribed(), true)
})
test('a delayed initial read cannot restore a session after sign-out', async () => {
  const f = fixture()
  f.emit(null); f.resolve({ access_token: 'old-account' }); await settle()
  assert.deepEqual(f.states, [{ ready: true, accessToken: undefined }]); f.stop()
})
test('session read failures fail closed and unmounted observers stop updating', async () => {
  const failed = fixture(); failed.reject(new Error('storage unavailable')); await settle()
  assert.deepEqual(failed.states, [{ ready: true, failed: true }]); failed.stop()
  const stopped = fixture(); stopped.stop(); stopped.resolve({ access_token: 'late' }); stopped.emit(null); await settle()
  assert.deepEqual(stopped.states, [])
})
