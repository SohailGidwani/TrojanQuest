import test from 'node:test'
import assert from 'node:assert/strict'
import type { Catch, CatchResult, Spot } from '../../../shared/types.ts'
import { RequestError, requestJSON } from '../components/api.ts'
import { CatchReadbackError, collectLiveSpot, loadLiveCollection } from './liveCollection.ts'

const spot: Spot = { id: 'bovard', name: 'Bovard Auditorium', lat: 34.020914, lng: -118.285537, category: 'hangout', card_text: '', tip: '', sticker_key: 'bovard' }
const caught: Catch = { id: 'saved', source: 'spot', source_id: 'bovard', variant: 'night', caught_at: '2026-11-15T04:00:00Z' }
const success: CatchResult = { ok: true, already_caught: false, variant: 'night', sticker: { key: 'bovard', name: spot.name, source: 'spot', variant: 'night' } }
function request(handler: (path: string, options: Parameters<typeof requestJSON>[1]) => unknown): typeof requestJSON {
  return async <T>(path: string, options?: Parameters<typeof requestJSON>[1]) => await handler(path, options) as T
}
function catalogue(path: string) { return path === '/api/spots' ? [spot] : path === '/api/me/catches' ? [caught] : [] }

test('live catch sends only its location and token, then reads the server book before completing', async () => {
  let saved = false
  const api = request((path, options) => {
    assert.equal(options?.accessToken, 'campus-session')
    if (path === '/api/catch') {
      assert.deepEqual(options?.body, { source: 'spot', source_id: 'bovard', lat: spot.lat, lng: spot.lng })
      saved = true; return success
    }
    assert.equal(path, '/api/me/catches'); assert.equal(saved, true); return [caught]
  })
  const result = await collectLiveSpot('bovard', spot, 'campus-session', api)
  assert.deepEqual(result, { result: success, catches: [caught] })
  // A fresh load uses the stored catch rather than an optimistic/local-only visit.
  const reloaded = await loadLiveCollection('campus-session', new AbortController().signal, request(catalogue))
  assert.deepEqual(reloaded.data.catches, [caught])
})
test('rejected and duplicate catches preserve the authoritative result', async () => {
  let calls = 0
  const rejected = await collectLiveSpot('bovard', spot, 'session', request(() => { calls++; return { ok: false, reason: 'too_far' } }))
  assert.equal(calls, 1); assert.deepEqual(rejected, { result: { ok: false, reason: 'too_far' } })
  const duplicate = await collectLiveSpot('bovard', spot, 'session', request(path => path === '/api/catch' ? { ...success, already_caught: true } : [caught]))
  assert.equal(duplicate.result.ok && duplicate.result.already_caught, true)
  assert.deepEqual(duplicate.catches, [caught])
})
test('saved catch with failed, missing or malformed readback cannot unlock the hunt', async () => {
  for (const book of [[], {}, [{ ...caught, variant: 'day' }], new Error('offline')]) {
    await assert.rejects(collectLiveSpot('bovard', spot, 'session', request(path => {
      if (path === '/api/catch') return success
      if (book instanceof Error) throw book
      return book
    })), CatchReadbackError)
  }
})
test('missing optional content does not block Bovard; missing places or catches does', async () => {
  const result = await loadLiveCollection('session', new AbortController().signal, request(path => {
    if (['/api/quests', '/api/friends'].includes(path)) throw new RequestError(503, 'Not ready')
    return catalogue(path)
  }))
  assert.equal(result.errors.length, 2); assert.deepEqual(result.data.spots, [spot])
  for (const failed of ['/api/spots', '/api/me/catches']) {
    await assert.rejects(loadLiveCollection('session', new AbortController().signal, request(path => {
      if (path === failed) throw new RequestError(503, 'Unavailable')
      return catalogue(path)
    })))
  }
})
test('expired or unverified sessions cannot appear as an empty live collection', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(loadLiveCollection('session', new AbortController().signal, request(path => {
      if (path === '/api/me/catches') throw new RequestError(status, 'Sign in')
      return catalogue(path)
    })), error => error instanceof RequestError && error.status === status)
  }
})
