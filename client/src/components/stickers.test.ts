import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { availability, canEarn, parseStickerCatalogue } from './stickers.ts'
import { addDemoVisit, awardCompletedQuests } from './collection.ts'
import type { Quest, Spot } from './types.ts'

const exclusive = { key: 'fest', name: 'Fest', rarity: 'exclusive', tags: ['Event', 'event', ' fall '], available_from: '2026-11-01T00:00:00Z', available_until: '2026-11-10T00:00:00Z' }

test('content/stickers.json is a valid catalogue', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../content/stickers.json', import.meta.url), 'utf8'))
  const { catalogue, errors } = parseStickerCatalogue(raw)
  assert.deepEqual(errors, [])
  assert.equal(catalogue.size, raw.stickers.length)
})
test('catalogue normalizes tags and reports every invalid entry', () => {
  const { catalogue, errors } = parseStickerCatalogue({ stickers: [
    exclusive,
    { key: 'fest', name: 'Duplicate', rarity: 'common', tags: [] },
    { key: 'Bad Key', name: '', rarity: 'mythic', tags: 'x' },
    { key: 'no-end', name: 'No end', rarity: 'exclusive', tags: [] },
    { key: 'windowed', name: 'Common with dates', rarity: 'common', tags: [], available_until: '2026-12-01' },
    { key: 'pic', name: 'Bad image', rarity: 'rare', tags: [], image: '../secret.js' },
  ] })
  assert.deepEqual([...catalogue.keys()], ['fest'])
  assert.deepEqual(catalogue.get('fest')?.tags, ['event', 'fall'])
  assert.equal(errors.length, 5)
  assert.match(errors.join('\n'), /duplicate key/)
  assert.match(errors.join('\n'), /exclusive stickers need an available_until/)
  assert.match(errors.join('\n'), /only exclusive stickers have an availability window/)
  assert.deepEqual(parseStickerCatalogue([]).errors, ['Expected { "stickers": [...] }.'])
})
test('exclusive stickers are only earnable inside their window; others always', () => {
  const { catalogue } = parseStickerCatalogue({ stickers: [exclusive, { key: 'plain', name: 'Plain', rarity: 'legendary', tags: [] }] })
  const fest = catalogue.get('fest')
  assert.equal(availability(fest, Date.parse('2026-10-31T23:59:59Z')), 'upcoming')
  assert.equal(availability(fest, Date.parse('2026-11-05T00:00:00Z')), 'available')
  assert.equal(availability(fest, Date.parse('2026-11-10T00:00:00Z')), 'ended')
  assert.equal(canEarn(catalogue, 'plain', Date.parse('2030-01-01')), true)
  assert.equal(canEarn(catalogue, 'unknown-key'), true)
})
test('ended exclusive stickers can never be earned from visits or quests', () => {
  const { catalogue } = parseStickerCatalogue({ stickers: [exclusive] })
  const spots: Spot[] = [{ id: 'quad', name: 'Quad', lat: 34, lng: -118, category: 'hangout', card_text: '', tip: '', sticker_key: 'fest' }, { id: 'lib', name: 'Library', lat: 34, lng: -118, category: 'study', card_text: '', tip: '', sticker_key: 'lib' }]
  const quests: Quest[] = [{ id: 'q', title: 'Fest route', blurb: '', spot_ids: ['lib'], reward_sticker_key: 'fest' }]
  const empty = { catches: [], friendIds: [] }
  const during = '2026-11-05T00:00:00Z', after = '2026-11-12T00:00:00Z'
  assert.equal(addDemoVisit(empty, 'quad', 'day', spots, [], after, catalogue), empty)
  assert.equal(addDemoVisit(empty, 'quad', 'day', spots, [], during, catalogue).catches.length, 1)
  // Finishing the quest after the window closes gives the place sticker but not the exclusive reward.
  const late = addDemoVisit(empty, 'lib', 'day', spots, quests, after, catalogue)
  assert.deepEqual(late.catches.map(c => c.source), ['spot'])
  assert.deepEqual(awardCompletedQuests(late.catches, quests, during, catalogue).map(c => c.source), ['spot', 'quest'])
})
