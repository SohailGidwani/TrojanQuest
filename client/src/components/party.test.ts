import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeOdds, joinedFriends, nextRarity, parseParties, parseRolls, partyOdds, rollReward, stickerCount } from './party'

const sequence = (...values: number[]) => () => values.shift() ?? 0.999

test('party odds follow the 25 / 75 / guaranteed table and clamp the size', () => {
  assert.deepEqual(partyOdds(0), { bump: 0, duplicate: 0 })
  assert.deepEqual(partyOdds(1), { bump: .25, duplicate: 0 })
  assert.deepEqual(partyOdds(2), { bump: .75, duplicate: 0 })
  assert.deepEqual(partyOdds(3), { bump: 1, duplicate: .5 })
  assert.deepEqual(partyOdds(9), { bump: 1, duplicate: .5 })
  assert.deepEqual(partyOdds(-2), { bump: 0, duplicate: 0 })
})

test('rarity climbs one tier and stops at legendary; exclusive never bumps', () => {
  assert.equal(nextRarity('common'), 'rare')
  assert.equal(nextRarity('epic'), 'legendary')
  assert.equal(nextRarity('legendary'), null)
  assert.equal(nextRarity('exclusive'), null)
})

test('a solo quest never rolls and keeps one copy', () => {
  let calls = 0
  const roll = rollReward('epic', 0, () => { calls++; return 0 })
  assert.equal(calls, 0)
  assert.deepEqual([roll.rarity, roll.bumped, roll.capped, roll.copies], ['epic', false, false, 1])
})

test('one friend bumps only when the roll lands under 25%', () => {
  assert.equal(rollReward('rare', 1, sequence(.24)).rarity, 'epic')
  assert.equal(rollReward('rare', 1, sequence(.25)).rarity, 'rare')
})

test('two friends bump under 75% and never duplicate', () => {
  const roll = rollReward('common', 2, sequence(.7, 0))
  assert.deepEqual([roll.rarity, roll.copies], ['rare', 1])
  assert.equal(rollReward('common', 2, sequence(.75)).bumped, false)
})

test('three friends always bump and duplicate half the time', () => {
  const lucky = rollReward('epic', 3, sequence(.1))
  assert.deepEqual([lucky.rarity, lucky.bumped, lucky.copies], ['legendary', true, 2])
  const unlucky = rollReward('epic', 3, sequence(.5))
  assert.deepEqual([unlucky.rarity, unlucky.copies], ['legendary', 1])
})

test('a won bump on a top-tier reward is capped but the duplicate still applies', () => {
  const roll = rollReward('legendary', 3, sequence(.2))
  assert.deepEqual([roll.rarity, roll.bumped, roll.capped, roll.copies], ['legendary', false, true, 2])
  assert.equal(rollReward('exclusive', 3, sequence(.9)).rarity, 'exclusive')
})

test('only joined friends count, at most three', () => {
  assert.deepEqual(joinedFriends({ maya: 'joined', rina: 'invited', leo: 'joined' }), ['maya', 'leo'])
  assert.deepEqual(joinedFriends(undefined), [])
})

test('odds copy names the target tier', () => {
  assert.equal(describeOdds(1, 'epic'), '25% chance of a rarity bump to Legendary')
  assert.equal(describeOdds(3, 'rare'), 'Guaranteed rarity bump to Epic · 50% chance of 2× stickers')
  assert.equal(describeOdds(3, 'legendary'), 'Already top rarity · 50% chance of 2× stickers')
})

test('stored parties and rolls are validated', () => {
  assert.deepEqual(parseParties({ q: { maya: 'joined', rina: 'nope', leo: 'invited' }, bad: 3 }), { q: { maya: 'joined', leo: 'invited' } })
  const good = { base: 'epic', rarity: 'legendary', bumped: true, capped: false, copies: 2, partySize: 3, rolled_at: '2026-11-15T10:00:00Z' }
  assert.deepEqual(parseRolls({ q: good, bad: { ...good, copies: 3 } }), { q: good })
  assert.equal(stickerCount(5, { q: good as never }), 6)
})
