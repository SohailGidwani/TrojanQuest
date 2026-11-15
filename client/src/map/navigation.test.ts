import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceMetres, bearingDegrees, compassDirection, proximity, campusVariant } from './navigation.ts'
const target = { lat: 34.021, lng: -118.285 }
const now = 1_800_000_000_000
const fix = { ...target, accuracy: 5, timestamp: now }
test('distance and bearing use north-up geographic coordinates', () => {
  assert.equal(distanceMetres(target, target), 0)
  assert.ok(Math.abs(distanceMetres({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111195) < 2)
  assert.equal(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 0)
  assert.equal(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 90)
  assert.equal(compassDirection(359), 'north')
  assert.equal(compassDirection(225), 'southwest')
})
test('arrival needs a fresh accurate fix whose uncertainty fits inside 50 m', () => {
  assert.equal(proximity(target, fix, now).canCollect, true)
  assert.equal(proximity(target, { ...fix, accuracy: 100 }, now).canCollect, false)
  assert.equal(proximity(target, { ...fix, timestamp: now - 31_000 }, now).state, 'stale')
  assert.equal(proximity(target, null, now).state, 'waiting')
  assert.equal(proximity(target, { ...fix, lat: NaN }, now).canCollect, false)
  assert.equal(proximity(target, { ...fix, accuracy: -1 }, now).canCollect, false)
  assert.equal(proximity(target, { ...fix, lat: target.lat + .0004, accuracy: 15 }, now).canCollect, false)
  assert.equal(proximity(target, { ...fix, lat: target.lat + .001 }, now).state, 'searching')
})
test('sticker time variants follow Los Angeles rather than the device timezone', () => {
  assert.equal(campusVariant(new Date('2026-11-15T15:00:00Z')), 'morning')
  assert.equal(campusVariant(new Date('2026-11-15T21:00:00Z')), 'day')
  assert.equal(campusVariant(new Date('2026-11-15T03:00:00Z')), 'night')
})
