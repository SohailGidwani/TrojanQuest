import data from '../../../content/stickers.json'
import { parseStickerCatalogue } from './stickers'
import type { StickerDefinition } from './stickers'

// Loaded at build time from Cal's content/stickers.json. Invalid entries are skipped and reported in the console.
const parsed = parseStickerCatalogue(data)
if (parsed.errors.length) console.warn(`content/stickers.json has problems:\n${parsed.errors.join('\n')}`)
export const stickerCatalogue = parsed.catalogue
export function stickerFor(key: string) { return stickerCatalogue.get(key) }
const authoredKeys = new Set(parsed.catalogue.keys())
/** Adds stickers designed in the app (student-org quests). Authored catalogue entries always win a key clash. */
export function registerStickers(stickers: StickerDefinition[]) {
  for (const sticker of stickers) if (!authoredKeys.has(sticker.key)) (stickerCatalogue as Map<string, StickerDefinition>).set(sticker.key, sticker)
}
