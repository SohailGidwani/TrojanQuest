// Sticker catalogue: what each sticker looks like and how rare it is.
// Authored by Cal in content/stickers.json; spots, quests and org drops refer to entries by `key`.

export const rarities = ['common', 'rare', 'epic', 'legendary', 'exclusive'] as const
export type Rarity = typeof rarities[number]
export const rarityLabels: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', exclusive: 'Exclusive' }

export interface StickerDefinition {
  key: string
  name: string
  /** File in client/public/stickers. Time-of-day editions may add `<name>-morning.<ext>` etc. */
  image?: string
  /** Built-in fallback design shown when there is no image (book, bowl, leaf, star, bubble, bolt, heart, flag). */
  art?: string
  rarity: Rarity
  tags: string[]
  /** Custom palette (background, highlight, outline), e.g. from the AI sticker designer. Overrides the edition colors. */
  colors?: string[]
  lore?: string
  /** Exclusive stickers only: the window in which they can be earned. Once it ends they can never be earned again. */
  available_from?: string
  available_until?: string
}
export type StickerCatalogue = ReadonlyMap<string, StickerDefinition>
export type Availability = 'available' | 'upcoming' | 'ended'

const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const safeFile = /^[\w.-]+\.(svg|png|webp)$/i

/** Validates authored catalogue data, returning every problem so content mistakes are easy to fix. */
export function parseStickerCatalogue(raw: unknown): { catalogue: StickerCatalogue; errors: string[] } {
  const errors: string[] = []
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { stickers?: unknown }).stickers) ? (raw as { stickers: unknown[] }).stickers : null
  if (!list) return { catalogue: new Map(), errors: ['Expected { "stickers": [...] }.'] }
  const catalogue = new Map<string, StickerDefinition>()
  list.forEach((item, index) => {
    const entry = item as Partial<StickerDefinition> | null
    const at = typeof entry?.key === 'string' ? `"${entry.key}"` : `#${index + 1}`
    const problems: string[] = []
    if (!entry || typeof entry !== 'object') { errors.push(`Sticker ${at}: not an object.`); return }
    if (typeof entry.key !== 'string' || !/^[a-z0-9-]{1,60}$/.test(entry.key)) problems.push('key must be lowercase letters, digits or dashes')
    else if (catalogue.has(entry.key)) problems.push('duplicate key')
    if (typeof entry.name !== 'string' || !entry.name.trim()) problems.push('name is required')
    if (!rarities.includes(entry.rarity as Rarity)) problems.push(`rarity must be one of ${rarities.join(', ')}`)
    if (!Array.isArray(entry.tags) || !entry.tags.every(tag => typeof tag === 'string' && tag.trim())) problems.push('tags must be a list of words')
    if (entry.image !== undefined && (typeof entry.image !== 'string' || !safeFile.test(entry.image))) problems.push('image must be a .svg, .png or .webp file name')
    if (entry.available_from !== undefined && !isDate(entry.available_from)) problems.push('available_from must be a date')
    if (entry.available_until !== undefined && !isDate(entry.available_until)) problems.push('available_until must be a date')
    if (entry.rarity === 'exclusive' && !isDate(entry.available_until)) problems.push('exclusive stickers need an available_until date')
    if (entry.rarity !== 'exclusive' && (entry.available_from !== undefined || entry.available_until !== undefined)) problems.push('only exclusive stickers have an availability window')
    if (isDate(entry.available_from) && isDate(entry.available_until) && Date.parse(entry.available_from) >= Date.parse(entry.available_until)) problems.push('available_from must be before available_until')
    if (problems.length) { errors.push(`Sticker ${at}: ${problems.join('; ')}.`); return }
    const tags = [...new Set(entry.tags!.map(tag => tag.trim().toLowerCase()))]
    catalogue.set(entry.key!, { ...entry, tags } as StickerDefinition)
  })
  return { catalogue, errors }
}

export function availability(sticker: StickerDefinition | undefined, now = Date.now()): Availability {
  if (!sticker || sticker.rarity !== 'exclusive') return 'available'
  if (sticker.available_from && now < Date.parse(sticker.available_from)) return 'upcoming'
  if (sticker.available_until && now >= Date.parse(sticker.available_until)) return 'ended'
  return 'available'
}
/** Unknown keys stay earnable so missing catalogue entries never block play. */
export function canEarn(catalogue: StickerCatalogue, key: string, now = Date.now()) {
  return availability(catalogue.get(key), now) === 'available'
}
