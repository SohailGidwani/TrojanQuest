import data from '../../../content/stickers.json'
import { parseStickerCatalogue } from './stickers'

// Loaded at build time from Cal's content/stickers.json. Invalid entries are skipped and reported in the console.
const parsed = parseStickerCatalogue(data)
if (parsed.errors.length) console.warn(`content/stickers.json has problems:\n${parsed.errors.join('\n')}`)
export const stickerCatalogue = parsed.catalogue
export function stickerFor(key: string) { return stickerCatalogue.get(key) }
