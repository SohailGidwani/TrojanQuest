import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Variant } from './types'
import { Icon } from './Icon'
declare const __STICKER_ASSETS__: string[]
const art: Record<string, ReactNode> = {
  book: <><path d="M30 35q18-10 34 3 16-13 34-3v52q-20-8-34 4-16-12-34-4Z" fill="var(--sticker-light)"/><path d="M64 38v53M38 47l16 2m-16 9 16 2m20-11 15-2m-15 13 15-2" fill="none"/></>,
  bowl: <><path d="M24 65h80q-3 31-40 32-36-1-40-32Z" fill="var(--sticker-light)"/><path d="M38 49c-9-9 11-12 1-21m25 20c-9-9 11-12 1-21m23 21c-9-9 11-12 1-21M31 74h66" fill="none"/></>,
  leaf: <><path d="M93 29Q24 22 31 80q8 23 30 12 31-9 32-63Z" fill="var(--sticker-light)"/><path d="m30 102 50-58M48 79l-3-21m15 8 18 1" fill="none"/></>,
  star: <path d="m64 21 13 27 30 5-22 22 5 30-26-14-27 14 5-30-22-22 31-5Z" fill="var(--sticker-light)"/>,
  bubble: <><circle cx="59" cy="70" r="29" fill="var(--sticker-light)"/><circle cx="89" cy="38" r="14" fill="var(--sticker-light)"/><circle cx="32" cy="31" r="8" fill="var(--sticker-light)"/><path d="M43 61q4-10 15-10m25-17 4-3" fill="none"/></>,
  bolt: <path d="M67 18 32 72h28l-5 39 40-61H67l9-32Z" fill="var(--sticker-light)"/>,
  heart: <path d="M64 103 30 70C0 37 46 12 64 44c19-32 64-7 34 26Z" fill="var(--sticker-light)"/>,
  flag: <><path d="M38 108V25m0 4q18-12 37 0 12 8 23-2v42q-11 10-24 2-17-12-36 0" fill="var(--sticker-light)"/><path d="M29 108h24M51 43l10 4 13-2" fill="none"/></>,
}
const palettes: Record<Variant, string[]> = { morning: ['#efc55b', '#fff5ca', '#865925'], day: ['#d39c9c', '#ffefda', '#8d1836'], night: ['#7e94c3', '#e8edff', '#293f70'], seasonal: ['#86aaa0', '#e1f3d7', '#2f695f'], special: ['#e8bb48', '#fff4b6', '#8b5221'] }
export function StickerImage({ stickerKey, name, variant = 'day', locked = false, size = 112 }: { stickerKey: string; name: string; variant?: Variant; locked?: boolean; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null)
  const variantAsset = `${stickerKey}-${variant}.svg`, baseAsset = `${stickerKey}.svg`
  const asset = __STICKER_ASSETS__.includes(variantAsset) ? variantAsset : __STICKER_ASSETS__.includes(baseAsset) ? baseAsset : null
  const colors = palettes[variant] ?? palettes.day
  const style = { width: size, height: size, '--sticker-base': colors[0], '--sticker-light': colors[1], '--sticker-line': colors[2] } as CSSProperties
  return <span className={`sticker-image variant-${variant}${locked ? ' is-locked' : ''}`} style={style} role="img" aria-label={`${name}, ${variant} edition${locked ? ', locked' : ''}`}>
    {asset && broken !== asset ? <img src={`/stickers/${asset}`} alt="" style={asset === variantAsset ? { filter: 'none' } : undefined} onError={() => setBroken(asset)} /> : <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M65 8c13-9 24 1 27 10 18-3 27 12 23 25 14 11 10 28-1 35 3 18-12 28-25 24-10 17-27 18-38 7-18 8-32-2-32-17C2 87 0 69 11 57 3 43 12 26 28 26 32 10 48 4 65 8Z" fill="white"/><circle cx="64" cy="64" r="49" fill="var(--sticker-base)"/><g stroke="var(--sticker-line)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">{art[stickerKey] ?? art.star}</g></svg>}
    {locked ? <span className="sticker-lock"><Icon name="lock" size={12}/></span> : null}
  </span>
}
