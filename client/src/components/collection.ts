import type { Catch, Category, DemoState, Quest, Spot, Variant } from './types'
import { timeVariants } from './types'
import { canEarn } from './stickers'
import type { StickerCatalogue } from './stickers'

export function spotVariants(id: string, catches: Catch[]): Variant[] {
  return [...new Set(catches.filter(c => c.source === 'spot' && c.source_id === id).map(c => c.variant))]
}
export function questProgress(quest: Quest, catches: Catch[]) {
  const visited = new Set(catches.filter(c => c.source === 'spot').map(c => c.source_id))
  const ids = [...new Set(quest.spot_ids)]
  const count = ids.filter(id => visited.has(id)).length
  return { visited: count, total: ids.length, complete: ids.length > 0 && count === ids.length }
}
// Quest id -> ISO time the student accepted it. Quests only track progress and award rewards once accepted.
export type AcceptedQuests = Record<string, string>
export type QuestStatus = 'new' | 'active' | 'complete'
export function questStatus(quest: Quest, catches: Catch[], accepted: AcceptedQuests): QuestStatus {
  if (catches.some(c => c.source === 'quest' && c.source_id === quest.id)) return 'complete'
  if (!accepted[quest.id]) return 'new'
  return questProgress(quest, catches).complete ? 'complete' : 'active'
}
// The most recently accepted quest that is still in progress.
export function currentQuest(quests: Quest[], catches: Catch[], accepted: AcceptedQuests) {
  const active = quests.filter(quest => questStatus(quest, catches, accepted) === 'active')
    .sort((a, b) => Date.parse(accepted[b.id]) - Date.parse(accepted[a.id]))[0]
  return active ? { quest: active, ...questProgress(active, catches) } : null
}
export function parseAcceptedQuests(value: unknown): AcceptedQuests {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value).filter(([id, at]) => id.length <= 200 && typeof at === 'string' && Number.isFinite(Date.parse(at)))
  return Object.fromEntries(entries.slice(0, 500))
}
// Adds the reward sticker for every given quest that is finished but not yet rewarded.
// Exclusive rewards outside their availability window are never awarded.
export function awardCompletedQuests(catches: Catch[], quests: Quest[], now = new Date().toISOString(), stickers: StickerCatalogue = new Map()): Catch[] {
  const next = [...catches]
  for (const quest of quests) {
    if (!canEarn(stickers, quest.reward_sticker_key, Date.parse(now))) continue
    if (questProgress(quest, next).complete && !next.some(c => c.source === 'quest' && c.source_id === quest.id)) next.push({ id: `demo:quest:${quest.id}`, source: 'quest', source_id: quest.id, variant: 'special', caught_at: now })
  }
  return next
}
export function addDemoVisit(state: DemoState, id: string, variant: typeof timeVariants[number], spots: Spot[], quests: Quest[], now = new Date().toISOString(), stickers: StickerCatalogue = new Map()): DemoState {
  const spot = spots.find(s => s.id === id)
  if (!spot || !timeVariants.includes(variant) || !canEarn(stickers, spot.sticker_key, Date.parse(now))) return state
  const catches = [...state.catches]
  if (!catches.some(c => c.source === 'spot' && c.source_id === id && c.variant === variant)) catches.push({ id: `demo:spot:${id}:${variant}`, source: 'spot', source_id: id, variant, caught_at: now })
  // Callers pass only accepted quests, so unaccepted quests never award a reward.
  return { ...state, catches: awardCompletedQuests(catches, quests, now, stickers) }
}
// Search matches the place name, its sticker's name, or any of its sticker's tags.
export function filterSpots(spots: Spot[], catches: Catch[], query: string, category: Category | 'all', ownership: 'all' | 'collected' | 'locked', stickers: StickerCatalogue = new Map()) {
  const search = query.trim().toLowerCase().replace(/^#/, '')
  const visited = new Set(catches.filter(c => c.source === 'spot').map(c => c.source_id))
  const matches = (s: Spot) => { const sticker = stickers.get(s.sticker_key); return [s.name, sticker?.name ?? '', ...(sticker?.tags ?? [])].some(text => text.toLowerCase().includes(search)) }
  return spots.filter(s => (category === 'all' || s.category === category) && matches(s)
    && (ownership === 'all' || (ownership === 'collected' ? visited.has(s.id) : !visited.has(s.id))))
}
export function parseDemoState(raw: string | null): DemoState | null {
  try {
    const data: unknown = JSON.parse(raw ?? '')
    if (!data || typeof data !== 'object') return null
    const { catches, friendIds } = data as DemoState
    if (!Array.isArray(catches) || catches.length > 5000 || !Array.isArray(friendIds) || friendIds.length > 100 || !friendIds.every(id => typeof id === 'string')) return null
    if (!catches.every(c => c && typeof c.id === 'string' && typeof c.source_id === 'string' && ['spot', 'popup', 'org', 'quest'].includes(c.source) && ['morning', 'day', 'night', 'seasonal', 'special'].includes(c.variant) && typeof c.caught_at === 'string' && Number.isFinite(Date.parse(c.caught_at)))) return null
    const unique = catches.filter((c, index) => catches.findIndex(other => other.source === c.source && other.source_id === c.source_id && other.variant === c.variant) === index)
    return { catches: unique, friendIds: [...new Set(friendIds)] }
  } catch { return null }
}
