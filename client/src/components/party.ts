// Quest parties: invite up to three friends to a quest for a better reward roll.
// Friends count once they accept the invite. Every member who completes the quest gets their own roll.
//   1 friend  -> 25% chance to bump the reward one rarity tier
//   2 friends -> 75% chance to bump
//   3 friends -> guaranteed bump, plus a 50% chance of a second copy
// Rarity climbs common -> rare -> epic -> legendary and stops there; exclusive rewards never bump.
import type { Rarity } from './stickers'

export const maxPartySize = 3
export type InviteStatus = 'invited' | 'joined'
/** Friend user id -> invite status, for one quest. */
export type QuestParty = Record<string, InviteStatus>
/** Quest id -> party. */
export type QuestParties = Record<string, QuestParty>
export interface RewardRoll {
  base: Rarity
  rarity: Rarity
  bumped: boolean
  /** The bump was won but the reward was already at the top tier. */
  capped: boolean
  copies: 1 | 2
  partySize: number
  rolled_at: string
}
/** Quest id -> the reward roll made when that quest was completed. */
export type RewardRolls = Record<string, RewardRoll>

const bumpOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary']

export function partyOdds(size: number): { bump: number; duplicate: number } {
  const members = Math.max(0, Math.min(maxPartySize, Math.floor(size)))
  return members >= 3 ? { bump: 1, duplicate: .5 } : members === 2 ? { bump: .75, duplicate: 0 } : members === 1 ? { bump: .25, duplicate: 0 } : { bump: 0, duplicate: 0 }
}
/** The next rarity tier, or null when the reward cannot climb any higher. */
export function nextRarity(rarity: Rarity): Rarity | null {
  const index = bumpOrder.indexOf(rarity)
  return index >= 0 && index < bumpOrder.length - 1 ? bumpOrder[index + 1] : null
}
export function joinedFriends(party: QuestParty | undefined): string[] {
  return Object.entries(party ?? {}).filter(([, status]) => status === 'joined').map(([id]) => id).slice(0, maxPartySize)
}
/** `random` returns values in [0, 1); pass a fixed sequence in tests. */
export function rollReward(base: Rarity, partySize: number, random: () => number = Math.random, now = new Date().toISOString()): RewardRoll {
  const odds = partyOdds(partySize)
  const won = odds.bump >= 1 || (odds.bump > 0 && random() < odds.bump)
  const next = won ? nextRarity(base) : null
  const duplicate = odds.duplicate > 0 && random() < odds.duplicate
  return { base, rarity: next ?? base, bumped: !!next, capped: won && !next, copies: duplicate ? 2 : 1, partySize: Math.max(0, Math.min(maxPartySize, partySize)), rolled_at: now }
}
export function describeOdds(size: number, base?: Rarity): string {
  const odds = partyOdds(size)
  if (!odds.bump) return 'Invite friends for a chance at a rarer reward.'
  const target = base ? nextRarity(base) : null
  const bump = base && !target ? 'Already top rarity' : `${odds.bump >= 1 ? 'Guaranteed' : `${Math.round(odds.bump * 100)}% chance of a`} rarity bump${target ? ` to ${target[0].toUpperCase()}${target.slice(1)}` : ''}`
  return odds.duplicate ? `${bump} · ${Math.round(odds.duplicate * 100)}% chance of 2× stickers` : bump
}

const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'exclusive']
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export function parseParties(value: unknown): QuestParties {
  if (!isRecord(value)) return {}
  const parties: QuestParties = {}
  for (const [quest, party] of Object.entries(value).slice(0, 200)) {
    if (quest.length > 200 || !isRecord(party)) continue
    const members = Object.entries(party).filter(([id, status]) => id.length <= 200 && (status === 'invited' || status === 'joined')).slice(0, maxPartySize)
    parties[quest] = Object.fromEntries(members) as QuestParty
  }
  return parties
}
export function parseRolls(value: unknown): RewardRolls {
  if (!isRecord(value)) return {}
  const rolls: RewardRolls = {}
  for (const [quest, roll] of Object.entries(value).slice(0, 200)) {
    if (quest.length > 200 || !isRecord(roll)) continue
    const { base, rarity, bumped, capped, copies, partySize, rolled_at } = roll
    if (!rarities.includes(base as Rarity) || !rarities.includes(rarity as Rarity) || typeof bumped !== 'boolean' || typeof capped !== 'boolean'
      || (copies !== 1 && copies !== 2) || typeof partySize !== 'number' || partySize < 0 || partySize > maxPartySize
      || typeof rolled_at !== 'string' || !Number.isFinite(Date.parse(rolled_at))) continue
    rolls[quest] = { base: base as Rarity, rarity: rarity as Rarity, bumped, capped, copies, partySize, rolled_at }
  }
  return rolls
}
/** Total stickers including the extra copy from a duplicate roll. */
export function stickerCount(catchCount: number, rolls: RewardRolls): number {
  return catchCount + Object.values(rolls).reduce((sum, roll) => sum + roll.copies - 1, 0)
}
