// Challenges: limited-time quests posted by students or student orgs. A creator picks stops (existing campus
// places or pins on the map), names them, adds optional lore, designs the stop and reward stickers (by hand or
// with AI), and chooses how long the challenge runs. A challenge is expanded into the same Quest / Spot / sticker
// shapes the rest of the app uses, so progress, rewards and parties just work.
import type { Quest, Spot } from './types'
import type { StickerDefinition } from './stickers'

export const stickerArts = ['book', 'bowl', 'leaf', 'star', 'bubble', 'bolt', 'heart', 'flag'] as const
export type StickerArt = typeof stickerArts[number]
// Creators can't mint legendary or exclusive stickers; party bonuses can still bump a reward up to legendary.
export const creatorRarities = ['common', 'rare', 'epic'] as const
export type CreatorRarity = typeof creatorRarities[number]
export const limits = { title: 60, blurb: 280, stops: 8, stopName: 60, lore: 400, stickerName: 40, quests: 30 }
// Map pins must stay on or near the University Park campus: public places only.
export const campusCenter = { lat: 34.0205, lng: -118.2856 }
export const campusRadiusMeters = 1500
export type Author = 'student' | 'org'
/** How long a challenge can run, in days. Org challenges may run longer than a single student's. */
export const durations: Record<Author, number[]> = { student: [1, 3, 7], org: [1, 3, 7, 14, 30] }

/** Sticker palette chosen by the AI designer: background, highlight, outline. */
export type Palette = [string, string, string]
export type StopPlace = { kind: 'campus'; spot_id: string } | { kind: 'point'; lat: number; lng: number }
export interface CustomStop { name: string; lore: string; place: StopPlace; art: StickerArt; colors?: Palette }
export interface CustomReward { name: string; art: StickerArt; rarity: CreatorRarity; lore: string; colors?: Palette }
export interface QuestDraft { title: string; blurb: string; stops: CustomStop[]; reward: CustomReward; author: Author; days: number; org_id?: string }
export interface CustomQuest extends Omit<QuestDraft, 'days'> { id: string; by: string; created_at: string; ends_at: string }

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
export const onCampus = (point: { lat: number; lng: number }) => distanceMeters(point, campusCenter) <= campusRadiusMeters
const isArt = (value: unknown): value is StickerArt => stickerArts.includes(value as StickerArt)
const isRarity = (value: unknown): value is CreatorRarity => creatorRarities.includes(value as CreatorRarity)
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
const isPalette = (value: unknown): value is Palette => Array.isArray(value) && value.length === 3 && value.every(isHex)

export function mixHex(a: string, b: string, amount: number) {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
  return `#${[0, 1, 2].map(index => Math.round(channel(a, index) + (channel(b, index) - channel(a, index)) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
/** Rough perceived brightness, 0 (black) to 1 (white). */
function luminance(hex: string) {
  const [r, g, b] = [0, 1, 2].map(index => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255)
  return .2126 * r + .7152 * g + .0722 * b
}
/** Turns AI colors into a usable palette: two colors get a derived outline, and an outline too close to the highlight is darkened. */
export function normalizePalette(colors: string[]): Palette | undefined {
  const valid = colors.filter(isHex).map(color => color.toUpperCase())
  if (valid.length < 2) return undefined
  const [base, light] = valid
  const line = valid[2] && luminance(valid[2]) < luminance(light) - .35 && luminance(valid[2]) < .4 ? valid[2] : mixHex(base, '#000000', .6)
  return [base, light, line]
}

/** Every problem with a draft, written for the creator. Empty means it can be published. */
export function validateDraft(draft: QuestDraft, campusSpots: Spot[]): string[] {
  const errors: string[] = []
  const title = draft.title.trim(), blurb = draft.blurb.trim()
  if (!title) errors.push('Give your challenge a title.')
  else if (title.length > limits.title) errors.push(`Keep the title under ${limits.title} characters.`)
  if (blurb.length > limits.blurb) errors.push(`Keep the description under ${limits.blurb} characters.`)
  if (!durations[draft.author]?.includes(draft.days)) errors.push(draft.author === 'org' ? 'Org challenges run for 1 to 30 days.' : 'Student challenges run for 1 to 7 days.')
  if (!draft.stops.length) errors.push('Add at least one stop.')
  if (draft.stops.length > limits.stops) errors.push(`A challenge can have at most ${limits.stops} stops.`)
  const seen = new Set<string>()
  draft.stops.forEach((stop, index) => {
    const label = `Stop ${index + 1}`
    const name = stop.name.trim()
    if (!name) errors.push(`${label}: give it a name.`)
    else if (name.length > limits.stopName) errors.push(`${label}: keep the name under ${limits.stopName} characters.`)
    if (stop.lore.trim().length > limits.lore) errors.push(`${label}: keep the lore under ${limits.lore} characters.`)
    if (!isArt(stop.art)) errors.push(`${label}: pick a sticker design.`)
    if (stop.colors && !isPalette(stop.colors)) errors.push(`${label}: the sticker colors are invalid.`)
    if (stop.place.kind === 'campus') {
      if (!campusSpots.some(spot => spot.id === (stop.place as { spot_id: string }).spot_id)) errors.push(`${label}: choose a campus place.`)
      else if (seen.has(stop.place.spot_id)) errors.push(`${label}: this place is already a stop.`)
      seen.add(stop.place.spot_id)
    } else if (!Number.isFinite(stop.place.lat) || !Number.isFinite(stop.place.lng)) errors.push(`${label}: drop a pin on the map.`)
    else if (!onCampus(stop.place)) errors.push(`${label}: pins must be on campus (within ${campusRadiusMeters / 1000} km of the center).`)
  })
  const reward = draft.reward
  if (!reward.name.trim()) errors.push('Name your reward sticker.')
  else if (reward.name.trim().length > limits.stickerName) errors.push(`Keep the reward sticker name under ${limits.stickerName} characters.`)
  if (!isArt(reward.art)) errors.push('Pick a design for the reward sticker.')
  if (reward.colors && !isPalette(reward.colors)) errors.push('The reward sticker colors are invalid.')
  if (!isRarity(reward.rarity)) errors.push('Reward rarity must be Common, Rare or Epic.')
  if (reward.lore.trim().length > limits.lore) errors.push(`Keep the reward lore under ${limits.lore} characters.`)
  return errors
}

export function createQuest(draft: QuestDraft, names: Record<Author, string>, id = Math.random().toString(36).slice(2, 10), now = new Date().toISOString()): CustomQuest {
  const tidy = (text: string) => text.trim().replace(/\s+/g, ' ')
  const withColors = <T extends { colors?: Palette }>(item: T) => { const { colors, ...rest } = item; return colors ? { ...rest, colors } : rest }
  return {
    id, author: draft.author, by: names[draft.author], created_at: now, ends_at: new Date(Date.parse(now) + draft.days * 86_400_000).toISOString(),
    title: tidy(draft.title), blurb: draft.blurb.trim(),
    stops: draft.stops.map(stop => withColors({ ...stop, name: tidy(stop.name), lore: stop.lore.trim(), place: stop.place.kind === 'campus' ? { kind: 'campus' as const, spot_id: stop.place.spot_id } : { kind: 'point' as const, lat: +stop.place.lat.toFixed(6), lng: +stop.place.lng.toFixed(6) } })),
    reward: withColors({ ...draft.reward, name: tidy(draft.reward.name), lore: draft.reward.lore.trim() }),
  }
}

export const challengeOpen = (quest: CustomQuest & { status?: string; starts_at?: string }, now = Date.now()) => (!quest.status || quest.status === 'live') && (!quest.starts_at || Date.parse(quest.starts_at) <= now) && Date.parse(quest.ends_at) > now
/** "14 days left" (whole days from 48 hours up), "30 hours left", "Ends soon" or "Ended". */
export function timeLeft(quest: CustomQuest, now = Date.now()) {
  const ms = Date.parse(quest.ends_at) - now
  if (ms <= 0) return 'Ended'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.round(hours / 24)} days left`
  return hours >= 1 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} left` : 'Ends soon'
}

// Keys follow the catalogue's lowercase-dash rule so they can sit beside authored stickers.
export const rewardKey = (quest: CustomQuest) => `cq-${quest.id}-reward`
export const stopId = (quest: CustomQuest, index: number) => `cq-${quest.id}-${index + 1}`
export const isChallengeId = (questId: string) => questId.startsWith('cq-')

/** The Quest, extra campus places and stickers a challenge contributes to the collection. */
export function expandQuest(quest: CustomQuest): { quest: Quest; spots: Spot[]; stickers: StickerDefinition[] } {
  const spots: Spot[] = [], stickers: StickerDefinition[] = []
  const tags = ['challenge', quest.by.toLowerCase()]
  const spot_ids = quest.stops.map((stop, index) => {
    if (stop.place.kind === 'campus') return stop.place.spot_id
    const id = stopId(quest, index)
    spots.push({ id, name: stop.name, lat: stop.place.lat, lng: stop.place.lng, category: 'hangout', sticker_key: id,
      card_text: stop.lore || `Stop ${index + 1} of “${quest.title}”, a challenge by ${quest.by}.`, tip: `Part of ${quest.by}’s challenge “${quest.title}”.` })
    stickers.push({ key: id, name: stop.name, art: stop.art, rarity: 'common', tags, ...(stop.lore ? { lore: stop.lore } : {}), ...(stop.colors ? { colors: stop.colors } : {}) })
    return id
  })
  stickers.push({ key: rewardKey(quest), name: quest.reward.name, art: quest.reward.art, rarity: quest.reward.rarity, tags, ...(quest.reward.lore ? { lore: quest.reward.lore } : {}), ...(quest.reward.colors ? { colors: quest.reward.colors } : {}) })
  return { quest: { id: `cq-${quest.id}`, title: quest.title, blurb: quest.blurb || `A challenge by ${quest.by}.`, spot_ids, reward_sticker_key: rewardKey(quest) }, spots, stickers }
}

/** Display name and lore for each stop of a challenge, keyed by the spot id used in progress. */
export function stopDetails(quest: CustomQuest): Record<string, { name: string; lore: string }> {
  const { quest: expanded } = expandQuest(quest)
  return Object.fromEntries(expanded.spot_ids.map((id, index) => [id, { name: quest.stops[index].name, lore: quest.stops[index].lore }]))
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
/** Restores saved challenges, dropping anything malformed. */
export function parseCustomQuests(value: unknown): CustomQuest[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, limits.quests).flatMap((item): CustomQuest[] => {
    if (!isRecord(item) || !isRecord(item.reward) || !Array.isArray(item.stops)) return []
    const { id, author, by, created_at, ends_at, title, blurb, stops, reward } = item
    if (typeof id !== 'string' || !/^[a-z0-9]{1,16}$/.test(id) || (author !== 'student' && author !== 'org') || !text(by, 80) || !isDate(created_at) || !isDate(ends_at)) return []
    if (!text(title, limits.title) || !(title as string).trim() || !text(blurb, limits.blurb)) return []
    if (!text(reward.name, limits.stickerName) || !isArt(reward.art) || !isRarity(reward.rarity) || !text(reward.lore, limits.lore) || (reward.colors !== undefined && !isPalette(reward.colors))) return []
    if (!stops.length || stops.length > limits.stops) return []
    const parsed = stops.map((stop): CustomStop | null => {
      if (!isRecord(stop) || !isRecord(stop.place) || !text(stop.name, limits.stopName) || !text(stop.lore, limits.lore) || !isArt(stop.art) || (stop.colors !== undefined && !isPalette(stop.colors))) return null
      const place = stop.place, extra = stop.colors ? { colors: stop.colors as Palette } : {}
      if (place.kind === 'campus' && typeof place.spot_id === 'string' && place.spot_id.length <= 120) return { name: stop.name as string, lore: stop.lore as string, art: stop.art, place: { kind: 'campus', spot_id: place.spot_id }, ...extra }
      if (place.kind === 'point' && typeof place.lat === 'number' && typeof place.lng === 'number' && onCampus({ lat: place.lat, lng: place.lng })) return { name: stop.name as string, lore: stop.lore as string, art: stop.art, place: { kind: 'point', lat: place.lat, lng: place.lng }, ...extra }
      return null
    })
    if (parsed.some(stop => !stop)) return []
    return [{ id, author, by: by as string, created_at, ends_at, title: title as string, blurb: blurb as string, stops: parsed as CustomStop[],
      reward: { name: reward.name as string, art: reward.art, rarity: reward.rarity, lore: reward.lore as string, ...(reward.colors ? { colors: reward.colors as Palette } : {}) } }]
  })
}
