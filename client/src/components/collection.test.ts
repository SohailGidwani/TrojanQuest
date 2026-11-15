import test from 'node:test'
import assert from 'node:assert/strict'
import { addDemoVisit, awardCompletedQuests, currentQuest, filterSpots, parseAcceptedQuests, parseDemoState, questProgress, questStatus, spotVariants } from './collection.ts'
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
test('quests start new, become active when accepted, and complete when every place is visited', () => {
  assert.equal(questStatus(quests[0], [], {}), 'new')
  assert.equal(questStatus(quests[0], [], { q1: time }), 'active')
  let state = empty
  for (const id of ['a', 'b', 'c']) state = addDemoVisit(state, id, 'day', spots, [], time)
  // Visiting every place without accepting earns no reward and leaves the quest new.
  assert.equal(state.catches.some(c => c.source === 'quest'), false)
  assert.equal(questStatus(quests[0], state.catches, {}), 'new')
  // Accepting afterwards counts earlier visits and awards the reward once.
  const rewarded = awardCompletedQuests(awardCompletedQuests(state.catches, quests, time), quests, time)
  assert.equal(rewarded.filter(c => c.source === 'quest').length, 1)
  assert.equal(questStatus(quests[0], rewarded, { q1: time }), 'complete')
})
test('current quest is the most recently accepted quest still in progress', () => {
  const more: Quest[] = [...quests, { id: 'q2', title: 'Short loop', blurb: '', spot_ids: ['c'], reward_sticker_key: 'star' }, { id: 'q3', title: 'Eats', blurb: '', spot_ids: ['b', 'c'], reward_sticker_key: 'star' }]
  const accepted = { q1: '2026-11-14T09:00:00Z', q3: '2026-11-14T10:00:00Z' }
  assert.equal(currentQuest(more, [], {}), null)
  const state = addDemoVisit(empty, 'b', 'day', spots, more.filter(q => q.id in accepted), time)
  assert.deepEqual({ ...currentQuest(more, state.catches, accepted), quest: currentQuest(more, state.catches, accepted)?.quest.id }, { quest: 'q3', visited: 1, total: 2, complete: false })
  // Finishing q3 moves the ring back to q1.
  const done = addDemoVisit(state, 'c', 'day', spots, more.filter(q => q.id in accepted), time)
  assert.equal(currentQuest(more, done.catches, accepted)?.quest.id, 'q1')
})
test('accepted quest storage keeps valid entries only', () => {
  assert.deepEqual(parseAcceptedQuests({ q1: time, q2: 'not a date', q3: 4 }), { q1: time })
  for (const raw of [null, [], 'q1', 3]) assert.deepEqual(parseAcceptedQuests(raw), {})
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
