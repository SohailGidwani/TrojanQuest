import type { Catch, Category, DemoState, Quest, Spot, Variant } from './types'
import { timeVariants } from './types'

export function spotVariants(id: string, catches: Catch[]): Variant[] {
  return [...new Set(catches.filter(c => c.source === 'spot' && c.source_id === id).map(c => c.variant))]
}
export function questProgress(quest: Quest, catches: Catch[]) {
  const visited = new Set(catches.filter(c => c.source === 'spot').map(c => c.source_id))
  const ids = [...new Set(quest.spot_ids)]
  const count = ids.filter(id => visited.has(id)).length
  return { visited: count, total: ids.length, complete: ids.length > 0 && count === ids.length }
}
export function addDemoVisit(state: DemoState, id: string, variant: typeof timeVariants[number], spots: Spot[], quests: Quest[], now = new Date().toISOString()): DemoState {
  if (!spots.some(s => s.id === id) || !timeVariants.includes(variant)) return state
  const catches = [...state.catches]
  if (!catches.some(c => c.source === 'spot' && c.source_id === id && c.variant === variant)) catches.push({ id: `demo:spot:${id}:${variant}`, source: 'spot', source_id: id, variant, caught_at: now })
  for (const quest of quests) {
    if (questProgress(quest, catches).complete && !catches.some(c => c.source === 'quest' && c.source_id === quest.id)) catches.push({ id: `demo:quest:${quest.id}`, source: 'quest', source_id: quest.id, variant: 'special', caught_at: now })
  }
  return { ...state, catches }
}
export function filterSpots(spots: Spot[], catches: Catch[], query: string, category: Category | 'all', ownership: 'all' | 'collected' | 'locked') {
  const search = query.trim().toLowerCase()
  const visited = new Set(catches.filter(c => c.source === 'spot').map(c => c.source_id))
  return spots.filter(s => (category === 'all' || s.category === category) && s.name.toLowerCase().includes(search)
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
