import type { Rarity } from '../../../shared/types.js';

/** Pure rule reference for the future transactional quest reward grant. Not an API. */
export function partyOdds(size: number) {
  const members = Math.max(0, Math.min(3, Math.floor(size)));
  return members >= 3 ? { bump: 1, duplicate: .5 } : members === 2 ? { bump: .75, duplicate: 0 }
    : members === 1 ? { bump: .25, duplicate: 0 } : { bump: 0, duplicate: 0 };
}
export function nextRarity(rarity: Rarity): Rarity | null {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const index = order.indexOf(rarity);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : null;
}
export function rollReward(base: Rarity, partySize: number, random: () => number = Math.random, now = new Date().toISOString()) {
  const odds = partyOdds(partySize);
  const won = odds.bump >= 1 || (odds.bump > 0 && random() < odds.bump);
  const next = won ? nextRarity(base) : null;
  const duplicate = odds.duplicate > 0 && random() < odds.duplicate;
  return { base, rarity: next ?? base, bumped: !!next, capped: won && !next, copies: (duplicate ? 2 : 1) as 1 | 2,
    partySize: Math.max(0, Math.min(3, partySize)), rolled_at: now };
}
