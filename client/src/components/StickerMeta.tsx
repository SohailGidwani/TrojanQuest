import { stickerFor } from './catalogue'
import { availability, rarityLabels } from './stickers'
import type { Rarity, StickerDefinition } from './stickers'
import { Icon } from './Icon'

const dateFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

export function RarityBadge({ rarity, suffix }: { rarity: Rarity; suffix?: string }) {
  return <span className={`rarity-badge rarity-${rarity}`}><span className="rarity-gem" aria-hidden="true"/>{rarityLabels[rarity]}{suffix ? ` ${suffix}` : ''}</span>
}
export function TagList({ tags }: { tags: string[] }) {
  return tags.length ? <ul className="sticker-tags" aria-label="Sticker tags">{tags.map(tag => <li key={tag}>#{tag}</li>)}</ul> : null
}
/** "Available until Nov 30" / "Ended Nov 8" / "Starts Dec 1" for exclusive stickers; nothing otherwise. */
export function AvailabilityNote({ sticker }: { sticker?: StickerDefinition }) {
  if (!sticker || sticker.rarity !== 'exclusive') return null
  const state = availability(sticker)
  const from = sticker.available_from ? new Date(sticker.available_from).toLocaleDateString(undefined, dateFormat) : ''
  // The window ends at available_until, so show the last day it can still be earned.
  const until = sticker.available_until ? new Date(Date.parse(sticker.available_until) - 1).toLocaleDateString(undefined, dateFormat) : ''
  const text = state === 'ended' ? `Ended ${until} · can no longer be earned` : state === 'upcoming' ? `Starts ${from}` : `Limited time · through ${until}`
  return <span className={`availability-note ${state}`}><Icon name={state === 'ended' ? 'lock' : 'spark'} size={12}/>{text}</span>
}
/** Rarity, tags and availability for one sticker, for detail views. */
export function StickerDetails({ stickerKey }: { stickerKey: string }) {
  const sticker = stickerFor(stickerKey)
  if (!sticker) return null
  return <div className="sticker-details"><div className="sticker-details-row"><RarityBadge rarity={sticker.rarity}/><AvailabilityNote sticker={sticker}/></div>{sticker.lore ? <p className="sticker-lore">{sticker.lore}</p> : null}<TagList tags={sticker.tags}/></div>
}
