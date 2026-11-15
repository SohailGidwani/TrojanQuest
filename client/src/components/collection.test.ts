import test from 'node:test'
import assert from 'node:assert/strict'
import { addDemoVisit, filterSpots, parseDemoState, questProgress, spotVariants } from './collection.ts'
import type { DemoState, Quest, Spot } from './types.ts'

const spots: Spot[] = ['a', 'b', 'c'].map((id, i) => ({ id, name: ['Leavey Library', 'Village lunch', 'Quiet garden'][i], lat: 34, lng: -118, category: (['study', 'eat', 'chill'] as const)[i], card_text: '', tip: '', sticker_key: 'book' }))
const quests: Quest[] = [{ id: 'q1', title: 'First week', blurb: '', spot_ids: ['a', 'b', 'c'], reward_sticker_key: 'star' }]
const empty: DemoState = { catches: [], friendIds: [] }
const time = '2026-11-14T23:00:00Z'

test('repeat catches do not duplicate a variant, but a new time variant is collectible', () => {
  const first = addDemoVisit(empty, 'a', 'morning', spots, quests, time)
  const repeat = addDemoVisit(first, 'a', 'morning', spots, quests, time)
  assert.equal(repeat.catches.length, 1)
  const night = addDemoVisit(repeat, 'a', 'night', spots, quests, time)
  assert.deepEqual(spotVariants('a', night.catches), ['morning', 'night'])
  assert.equal(empty.catches.length, 0)
})
test('quest progress counts distinct places rather than time variants', () => {
  const morning = addDemoVisit(empty, 'a', 'morning', spots, quests, time)
  const night = addDemoVisit(morning, 'a', 'night', spots, quests, time)
  assert.deepEqual(questProgress(quests[0], night.catches), { visited: 1, total: 3, complete: false })
  assert.equal(night.catches.some(c => c.source === 'quest'), false)
})
test('finishing a quest awards exactly one reward and preserves friend state', () => {
  let state: DemoState = { catches: [], friendIds: ['maya'] }
  for (const id of ['a', 'b', 'c', 'c']) state = addDemoVisit(state, id, 'day', spots, quests, time)
  assert.deepEqual(questProgress(quests[0], state.catches), { visited: 3, total: 3, complete: true })
  assert.equal(state.catches.filter(c => c.source === 'quest' && c.source_id === 'q1').length, 1)
  assert.deepEqual(state.friendIds, ['maya'])
})
test('unknown demo places cannot earn stickers', () => {
  assert.equal(addDemoVisit(empty, 'unknown', 'day', spots, quests, time), empty)
})
test('search, category and collected filters compose without mutating the catalogue', () => {
  const state = addDemoVisit(empty, 'a', 'night', spots, quests, time)
  assert.deepEqual(filterSpots(spots, state.catches, '  LEAVEY ', 'study', 'collected').map(s => s.id), ['a'])
  assert.deepEqual(filterSpots(spots, state.catches, '', 'all', 'locked').map(s => s.id), ['b', 'c'])
  assert.equal(filterSpots(spots, state.catches, 'Leavey', 'eat', 'all').length, 0)
  assert.equal(spots.length, 3)
})
test('demo storage accepts valid state and refuses corrupt or malformed data', () => {
  const state = addDemoVisit(empty, 'a', 'day', spots, quests, time)
  assert.deepEqual(parseDemoState(JSON.stringify(state)), state)
  for (const raw of [null, '{}', 'broken', JSON.stringify({ ...state, friendIds: [42] }), JSON.stringify({ ...state, catches: [{ ...state.catches[0], caught_at: 'bad date' }] }), JSON.stringify({ ...state, catches: [{ ...state.catches[0], variant: 'invalid' }] })]) assert.equal(parseDemoState(raw), null)
})
