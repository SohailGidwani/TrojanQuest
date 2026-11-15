import test from 'node:test'
import assert from 'node:assert/strict'
import { nextDiscovery, trails, nearbyMapVisible } from './trails'
import { demoSpots } from '../components/mock'
test('all new players must finish Bovard before choosing another trail', () => {
  assert.equal(nextDiscovery(demoSpots, [], 'libraries')?.spot.id, 'bovard')
  assert.equal(nextDiscovery(demoSpots, ['bovard'], null), null)
})
test('trail choices are independent and resume at their first unvisited stop', () => {
  assert.equal(nextDiscovery(demoSpots, ['bovard'], 'libraries')?.spot.id, 'leavey')
  assert.equal(nextDiscovery(demoSpots, ['bovard', 'leavey'], 'outdoors')?.spot.id, 'alumni')
  assert.equal(nextDiscovery(demoSpots, ['bovard', 'leavey', 'alumni'], 'libraries')?.spot.id, 'doheny')
  assert.equal(nextDiscovery(demoSpots, ['bovard', 'leavey', 'doheny'], 'libraries'), null)
  assert.equal(trails.length, 2)
})
test('missing catalogue entries never substitute an unrelated place', () => {
  assert.equal(nextDiscovery(demoSpots.filter(s => s.id !== 'bovard'), [], null), null)
  assert.equal(nextDiscovery(demoSpots.filter(s => s.id !== 'leavey'), ['bovard'], 'libraries'), null)
  assert.equal(nextDiscovery(demoSpots, ['bovard'], 'unknown'), null)
})
test('the map requires a fresh precise fix entirely within the nearby radius', () => {
 const target={lat:34,lng:-118}, now=Date.now(), fix={...target,accuracy:5,timestamp:now}
 assert.equal(nearbyMapVisible(target,fix,now),true)
 assert.equal(nearbyMapVisible(target,{...fix,lat:34.003},now),false)
 assert.equal(nearbyMapVisible(target,{...fix,accuracy:200},now),false)
 assert.equal(nearbyMapVisible(target,{...fix,timestamp:now-31000},now),false)
 assert.equal(nearbyMapVisible(target,null,now),false)
})
