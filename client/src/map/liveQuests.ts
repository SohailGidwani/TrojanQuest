import type { Catch, Challenge, ChallengeOrg, Profile, Quest, QuestAcceptance, QuestCompletionResult, QuestInvite, QuestParty, StickerDefinition } from '../../../shared/types'
import { requestJSON, RequestError } from '../components/api'
import { expandQuest } from '../components/customQuests'
import type { RewardRolls, QuestParties } from '../components/party'
import { questProgress } from '../components/collection'

type Request = typeof requestJSON
export interface LiveQuestState {
  challenges: Challenge[]; orgs: ChallengeOrg[]; profile?: Profile; accepted: Record<string, string>
  parties: QuestParties; invites: QuestInvite[]; reviewQueue: Challenge[]; reviewer: boolean; partiesAvailable: boolean
}
export const emptyQuestState: LiveQuestState = { challenges: [], orgs: [], accepted: {}, parties: {}, invites: [], reviewQueue: [], reviewer: false, partiesAvailable: false }
const array = <T,>(value: T[]): T[] => { if (!Array.isArray(value)) throw new Error('Unexpected server response.'); return value }
export function challengePlayable(c: Challenge, now = Date.now()) {
  return c.status === 'live' && Date.parse(c.starts_at) <= now && Date.parse(c.ends_at) > now
}
export function expandLiveChallenges(challenges: Challenge[], now = Date.now()) {
  // Historical records remain visible in My submissions, but never add collectible pins.
  const expanded = challenges.filter(c => challengePlayable(c, now)).map(expandQuest)
  return { quests: expanded.map(c => c.quest), spots: expanded.flatMap(c => c.spots) }
}
export function partyRecord(party: QuestParty) {
  return Object.fromEntries(party.members.filter(m => m.status === 'invited' || m.status === 'joined').map(m => [m.user_id, m.status])) as QuestParties[string]
}
export async function loadLiveQuestState(accessToken: string, signal?: AbortSignal, request: Request = requestJSON): Promise<LiveQuestState> {
  const options = { accessToken, signal }
  const [acceptances, challenges, orgs, profile, reviewQueue, invites] = await Promise.all([
    request<QuestAcceptance[]>('/api/me/quests', options).then(array),
    request<Challenge[]>('/api/challenges', options).then(array),
    request<ChallengeOrg[]>('/api/me/orgs', options).then(array),
    request<Profile | null>('/api/me/profile', options).catch(e => { if (e instanceof RequestError && e.status === 404) return undefined; throw e }),
    request<Challenge[]>('/api/challenges?review=true', options).then(array).catch(e => { if (e instanceof RequestError && e.status === 403) return null; throw e }),
    request<QuestInvite[]>('/api/me/quest-invites', options).then(array),
  ])
  const parties = await Promise.all(acceptances.map(async a => [a.quest_id, partyRecord(await request<QuestParty>(`/api/quests/${encodeURIComponent(a.quest_id)}/party`, options))] as const))
  return { challenges, orgs, profile: profile ?? undefined, accepted: Object.fromEntries(acceptances.map(a => [a.quest_id, a.accepted_at])),
    parties: Object.fromEntries(parties), invites, reviewQueue: reviewQueue ?? [], reviewer: reviewQueue !== null, partiesAvailable: true }
}
/** Only the server mints live quest rewards; saved visits count and retries are idempotent. */
export async function completeReadyQuests(quests: Quest[], accepted: Record<string, string>, catches: Catch[], accessToken: string, request: Request = requestJSON) {
  const results: QuestCompletionResult[] = []
  for (const quest of quests) {
    if (!accepted[quest.id] || catches.some(c => c.source === 'quest' && c.source_id === quest.id) || !questProgress(quest, catches).complete) continue
    results.push(await request<QuestCompletionResult>(`/api/quests/${encodeURIComponent(quest.id)}/complete`, { accessToken, body: {} }))
  }
  if (!results.length) return { catches, results }
  const saved = array(await request<Catch[]>('/api/me/catches', { accessToken }))
  if (results.some(r => !saved.some(c => c.id === r.catch.id))) throw new Error('Reward saved, but the book could not be refreshed. Retry loading your collection.')
  return { catches: saved, results }
}
export function savedRewardRolls(quests: Quest[], catches: Catch[], stickers: ReadonlyMap<string, StickerDefinition>): RewardRolls {
  const rolls: RewardRolls = {}
  for (const c of catches) {
    if (c.source !== 'quest' || !c.rarity) continue
    const q = quests.find(q => q.id === c.source_id)
    const key = q?.reward_sticker_key ?? (c.source_id.startsWith('cq-') ? `${c.source_id}-reward` : undefined)
    const base = (key && stickers.get(key)?.rarity) || c.rarity
    rolls[c.source_id] = { base, rarity: c.rarity, bumped: base !== c.rarity, capped: base === 'legendary' && (c.party_size ?? 0) === 3,
      copies: c.copies ?? 1, partySize: c.party_size ?? 0, rolled_at: c.caught_at }
  }
  return rolls
}
