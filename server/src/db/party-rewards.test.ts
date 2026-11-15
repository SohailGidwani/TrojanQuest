import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRarity, partyOdds, rollReward } from './party-rewards.js';
import type { Rarity } from '../../../shared/types.js';
import { publicCatch } from './catch-fields.js';

test('server reward rules match the shipped client at probability boundaries and rarity caps',async()=>{
  // Runtime fixture import keeps the browser's bundler-resolution sources out of server tsc.
  const clientModule='../../../client/src/components/party.ts';
  const { nextRarity: clientNext, partyOdds: clientOdds, rollReward: clientRoll } = await import(clientModule);
  for(const size of [0,1,2,3,4,-1]) {
    assert.deepEqual(partyOdds(size),clientOdds(size));
    for(const rarity of ['common','rare','epic','legendary','exclusive'] as Rarity[]) {
      assert.equal(nextRarity(rarity),clientNext(rarity));
      for(const chance of [0,.249999,.25,.499999,.5,.749999,.75,.99999]) {
        const now='2026-11-15T12:00:00Z';
        assert.deepEqual(rollReward(rarity,size,()=>chance,now),clientRoll(rarity,size,()=>chance,now));
      }
    }
  }
});
test('public catch fields preserve saved quest outcomes without exposing private fields',()=>{
  const original={id:'reward',source:'quest' as const,source_id:'q',variant:'special' as const,caught_at:'now',
    rarity:'epic' as const,copies:2 as const,party_size:3,user_id:'private',lat:34};
  const {user_id,lat,...expected}=original;
  assert.deepEqual(publicCatch(original),expected);
  assert.deepEqual(publicCatch({...original,source:'spot'}),{id:'reward',source:'spot',source_id:'q',variant:'special',caught_at:'now'});
});
