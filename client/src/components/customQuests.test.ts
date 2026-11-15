import { test } from 'node:test'
import assert from 'node:assert/strict'
import { challengeOpen, createQuest, expandQuest, isChallengeId, mixHex, normalizePalette, onCampus, parseCustomQuests, stopDetails, timeLeft, validateDraft } from './customQuests'
import type { QuestDraft } from './customQuests'
import type { Spot } from './types'

const leavey: Spot = { id: 'leavey', name: 'Leavey Library', category: 'study', sticker_key: 'leavey', lat: 34.0217, lng: -118.2829, card_text: '', tip: '' }
const names = { student: 'Sohail', org: 'Demo Student Org' }
const draft = (over: Partial<QuestDraft> = {}): QuestDraft => ({
  title: '  Late   night  loop ', blurb: 'Study, snack, repeat.', author: 'org', days: 7,
  stops: [
    { name: 'Leavey', lore: 'Open late.', art: 'book', place: { kind: 'campus', spot_id: 'leavey' } },
    { name: 'Club table', lore: '', art: 'flag', place: { kind: 'point', lat: 34.0208, lng: -118.2851 }, colors: ['#2B3A67', '#FFF4C2', '#14182E'] },
  ],
  reward: { name: 'Night Owl', art: 'star', rarity: 'epic', lore: 'For the late crowd.' },
  ...over,
})

test('a complete draft has no problems', () => {
  assert.deepEqual(validateDraft(draft(), [leavey]), [])
})

test('one stop is enough, zero is not', () => {
  assert.deepEqual(validateDraft(draft({ stops: [draft().stops[0]] }), [leavey]), [])
  assert.ok(validateDraft(draft({ stops: [] }), [leavey]).includes('Add at least one stop.'))
})

test('drafts report missing names, off-campus pins, unknown places and duplicates', () => {
  const errors = validateDraft(draft({
    title: ' ',
    stops: [
      { name: '', lore: '', art: 'book', place: { kind: 'point', lat: 34.1, lng: -118.3 } },
      { name: 'Ghost', lore: '', art: 'book', place: { kind: 'campus', spot_id: 'nowhere' } },
      { name: 'A', lore: '', art: 'book', place: { kind: 'campus', spot_id: 'leavey' } },
      { name: 'B', lore: '', art: 'book', place: { kind: 'campus', spot_id: 'leavey' } },
    ],
  }), [leavey])
  assert.ok(errors.includes('Give your challenge a title.'))
  assert.ok(errors.includes('Stop 1: give it a name.'))
  assert.ok(errors.some(error => error.startsWith('Stop 1: pins must be on campus')))
  assert.ok(errors.includes('Stop 2: choose a campus place.'))
  assert.ok(errors.includes('Stop 4: this place is already a stop.'))
})

test('creators cannot mint legendary rewards, and students cap at a week', () => {
  assert.ok(validateDraft(draft({ reward: { name: 'Big', art: 'star', rarity: 'legendary' as never, lore: '' } }), [leavey]).includes('Reward rarity must be Common, Rare or Epic.'))
  assert.ok(validateDraft(draft({ author: 'student', days: 14 }), [leavey]).includes('Student challenges run for 1 to 7 days.'))
  assert.deepEqual(validateDraft(draft({ author: 'org', days: 30 }), [leavey]), [])
})

test('campus bounds', () => {
  assert.equal(onCampus({ lat: 34.0205, lng: -118.2856 }), true)
  assert.equal(onCampus({ lat: 34.05, lng: -118.25 }), false)
})

test('AI palettes get a dark enough outline', () => {
  assert.deepEqual(normalizePalette(['#2b3a67', '#fff4c2', '#14182e']), ['#2B3A67', '#FFF4C2', '#14182E'])
  assert.deepEqual(normalizePalette(['#2A2A2A', '#F5F5F5', '#E0E0E0']), ['#2A2A2A', '#F5F5F5', mixHex('#2A2A2A', '#000000', .6)])
  assert.equal(normalizePalette(['#2A2A2A', '#F5F5F5'])?.length, 3)
  assert.equal(normalizePalette(['nope']), undefined)
})

test('a challenge expands into a quest, its pinned stops and catalogue-safe stickers', () => {
  const quest = createQuest(draft(), names, 'abc123', '2026-11-15T12:00:00.000Z')
  assert.equal(quest.title, 'Late night loop')
  assert.equal(quest.by, 'Demo Student Org')
  assert.equal(quest.ends_at, '2026-11-22T12:00:00.000Z')
  const { quest: expanded, spots, stickers } = expandQuest(quest)
  assert.ok(isChallengeId(expanded.id))
  assert.deepEqual(expanded.spot_ids, ['leavey', 'cq-abc123-2'])
  assert.deepEqual(spots.map(spot => [spot.id, spot.name, spot.sticker_key]), [['cq-abc123-2', 'Club table', 'cq-abc123-2']])
  assert.deepEqual(stickers.map(sticker => [sticker.key, sticker.rarity, sticker.art, sticker.colors?.[0]]), [['cq-abc123-2', 'common', 'flag', '#2B3A67'], ['cq-abc123-reward', 'epic', 'star', undefined]])
  assert.ok(stickers.every(sticker => /^[a-z0-9-]{1,60}$/.test(sticker.key)))
  assert.deepEqual(stopDetails(quest).leavey, { name: 'Leavey', lore: 'Open late.' })
})

test('challenges end on time', () => {
  const quest = createQuest(draft({ author: 'student', days: 1 }), names, 'abc123', '2026-11-15T12:00:00.000Z')
  assert.equal(quest.by, 'Sohail')
  assert.equal(challengeOpen(quest, Date.parse('2026-11-16T11:00:00Z')), true)
  assert.equal(timeLeft(quest, Date.parse('2026-11-16T07:00:00Z')), '5 hours left')
  const fortnight = createQuest(draft({ author: 'org', days: 14 }), names, 'abc123', '2026-11-15T12:00:00.000Z')
  assert.equal(timeLeft(fortnight, Date.parse('2026-11-15T12:00:05Z')), '14 days left')
  assert.equal(challengeOpen(quest, Date.parse('2026-11-16T12:00:00Z')), false)
  assert.equal(timeLeft(quest, Date.parse('2026-11-17T00:00:00Z')), 'Ended')
})

test('saved challenges are validated on load', () => {
  const good = createQuest(draft(), names, 'abc123', '2026-11-15T12:00:00.000Z')
  const offCampus = { ...good, id: 'bad1', stops: [{ ...good.stops[1], place: { kind: 'point', lat: 40, lng: -74 } }] }
  const badColors = { ...good, id: 'bad2', reward: { ...good.reward, colors: ['red'] } }
  assert.deepEqual(parseCustomQuests([good, offCampus, badColors, { id: 'x' }, 'nope']), [good])
  assert.deepEqual(parseCustomQuests('nope'), [])
})
