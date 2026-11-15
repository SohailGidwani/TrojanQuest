import test from 'node:test'
import assert from 'node:assert/strict'
import type { Catch, Challenge, Quest } from '../../../shared/types'
import { requestJSON, RequestError } from '../components/api'
import { completeReadyQuests, expandLiveChallenges, loadLiveQuestState, savedRewardRolls } from './liveQuests'

type Request = typeof requestJSON
const request = (fn: (path: string, options?: Parameters<Request>[1]) => unknown): Request => async <T>(path: string, options?: Parameters<Request>[1]) => await fn(path, options) as T
const id = '11111111-1111-4111-8111-111111111111'
const now = Date.parse('2026-11-15T12:00:00Z')
const challenge: Challenge = { id, by: 'Team', author: 'student', author_user_id: 'a', title: 'Route', blurb: '',
  status: 'live', starts_at: '2026-11-15T00:00:00Z', ends_at: '2026-11-16T00:00:00Z', created_at: '2026-11-15T00:00:00Z',
  stops: [{ name: 'Pin', lore: '', art: 'book', place: { kind: 'point', lat: 34.0205, lng: -118.2856 } }], reward: { name: 'Reward', lore: '', rarity: 'rare', art: 'star' } }
const quest: Quest = { id: 'route', title: 'Route', blurb: '', spot_ids: ['one'], reward_sticker_key: 'star' }
const visit: Catch = { id: 'v', source: 'spot', source_id: 'one', variant: 'day', caught_at: '2026-11-15T10:00:00Z' }
const reward: Catch = { id: 'r', source: 'quest', source_id: quest.id, variant: 'special', caught_at: visit.caught_at, rarity: 'epic', copies: 2, party_size: 3 }

test('live UUID expansion adds only currently playable pins, never pending/archived/future/expired pins', () => {
  const all = [challenge, ...(['pending', 'rejected', 'archived'] as const).map(status => ({ ...challenge, status })),
    { ...challenge, starts_at: '2027-01-01T00:00:00Z' }, { ...challenge, ends_at: '2026-11-14T00:00:00Z' }]
  const expanded = expandLiveChallenges(all, now)
  assert.equal(expanded.quests.length, 1); assert.equal(expanded.spots[0].id, `cq-${id}-1`)
})
test('live state reads saved acceptances, real invitations and server parties before enabling parties', async () => {
  const calls: string[] = []
  const loaded = await loadLiveQuestState('token', undefined, request((path, options) => {
    calls.push(path); assert.equal(options?.accessToken, 'token')
    if (path === '/api/me/quests') return [{ quest_id: 'route', accepted_at: visit.caught_at }]
    if (path === '/api/challenges?review=true') throw new RequestError(403, 'Reviewer only')
    if (path === '/api/me/profile') throw new RequestError(404, 'No profile')
    if (path.endsWith('/party')) return { quest_id: 'route', owner_id: 'a', members: [{ user_id: 'b', display_name: 'B', status: 'joined' }, { user_id: 'c', status: 'declined' }] }
    if (path === '/api/me/quest-invites') return [{ quest_id: 'other' }]
    return []
  }))
  assert.equal(loaded.partiesAvailable, true); assert.equal(loaded.reviewer, false)
  assert.equal(loaded.accepted.route, visit.caught_at); assert.deepEqual(loaded.parties.route, { b: 'joined' })
  assert.equal(loaded.invites.length, 1); assert.ok(calls.includes('/api/me/quest-invites'))
  await assert.rejects(loadLiveQuestState('token', undefined, request(() => { throw new RequestError(503, 'Unavailable') })))
})
test('reward sync requires saved acceptance and own visits; completion writes only an empty server request', async () => {
  const calls: string[] = []
  const api = request((path, options) => {
    calls.push(path)
    if (path.endsWith('/complete')) { assert.deepEqual(options?.body, {}); return { quest_id: quest.id, catch: reward, sticker: { key: 'star' } } }
    return [visit, reward]
  })
  assert.equal((await completeReadyQuests([quest], {}, [visit], 'token', api)).results.length, 0)
  assert.equal((await completeReadyQuests([quest], { route: visit.caught_at }, [], 'token', api)).results.length, 0)
  const completed = await completeReadyQuests([quest], { route: visit.caught_at }, [visit], 'token', api)
  assert.deepEqual(calls, ['/api/quests/route/complete', '/api/me/catches']); assert.equal(completed.catches[1].copies, 2)
  await completeReadyQuests([quest], { route: visit.caught_at }, completed.catches, 'token', api)
  assert.equal(calls.length, 2)
  await assert.rejects(completeReadyQuests([quest], { route: visit.caught_at }, [visit], 'token', request(path => path.endsWith('/complete') ? { catch: reward } : [visit])), /refreshed/)
})
test('live reward display uses persisted rarity, copies and party size without rolling again', () => {
  const rolls = savedRewardRolls([quest], [reward], new Map([['star', { key: 'star', name: 'Reward', rarity: 'rare', tags: [] }]]))
  assert.equal(rolls.route.rarity, 'epic'); assert.equal(rolls.route.copies, 2); assert.equal(rolls.route.partySize, 3)
  const archived = savedRewardRolls([], [{ ...reward, source_id: `cq-${id}` }], new Map([[`cq-${id}-reward`, { key: `cq-${id}-reward`, name: 'Reward', rarity: 'rare', tags: [] }]]))
  assert.equal(archived[`cq-${id}`].base, 'rare'); assert.equal(archived[`cq-${id}`].rarity, 'epic'); assert.equal(archived[`cq-${id}`].copies, 2)
})
test('request helper sends DELETE and PUT without silently changing their verbs', async () => {
  const original = globalThis.fetch, seen: string[] = []
  globalThis.fetch = (async (_url, options) => { seen.push(String(options?.method)); return Response.json({ ok: true }) }) as typeof fetch
  try { await requestJSON('/api/challenges/id', { method: 'DELETE' }); await requestJSON('/api/me/profile', { method: 'PUT', body: { display_name: 'Name' } }); assert.deepEqual(seen, ['DELETE', 'PUT']) }
  finally { globalThis.fetch = original }
})
