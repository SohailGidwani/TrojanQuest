import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Variant } from './types'
import { Icon } from './Icon'
import { stickerCatalogue } from './catalogue'
import { rarityLabels } from './stickers'
import type { Rarity } from './stickers'
declare const __STICKER_ASSETS__: string[]

type Paint = { base: string; shade: string; light: string; line: string; accent: string }
// Each time-of-day edition repaints the same illustration.
const palettes: Record<Variant, Paint> = {
  morning: { base: '#efc55b', shade: '#d9a93a', light: '#fff5ca', line: '#865925', accent: '#e8833a' },
  day: { base: '#d9908f', shade: '#bf7576', light: '#ffefda', line: '#8d1836', accent: '#ffcc00' },
  night: { base: '#7e94c3', shade: '#61779f', light: '#e8edff', line: '#293f70', accent: '#ffd86b' },
  seasonal: { base: '#86aaa0', shade: '#6a9184', light: '#e1f3d7', line: '#2f695f', accent: '#e8833a' },
  special: { base: '#e8bb48', shade: '#cf9f2e', light: '#fff4b6', line: '#8b5221', accent: '#c8352f' },
}
const sparkle = (x: number, y: number, r: number) => `M${x} ${y - r}l${r * .4} ${r * .6} ${r * .6} ${r * .4}-${r * .6} ${r * .4}-${r * .4} ${r * .6}-${r * .4}-${r * .6}-${r * .6}-${r * .4} ${r * .6}-${r * .4}Z`

function Sky({ variant, c }: { variant: Variant; c: Paint }) {
  if (variant === 'morning') return <><circle cx="93" cy="37" r="11" fill={c.accent} opacity=".35"/><circle cx="93" cy="37" r="7" fill={c.light}/></>
  if (variant === 'day') return <g fill={c.light}><path d="M28 40a6 6 0 0 1 11-3 5 5 0 0 1 8 4H28Z"/><path d="M82 32a6 6 0 0 1 11-3 5 5 0 0 1 8 4H82Z"/></g>
  if (variant === 'night') return <g fill={c.accent}><path d="M96 28a10 10 0 1 0 6 16 8 8 0 1 1-6-16Z"/><path d={sparkle(36, 35, 5)}/><circle cx="50" cy="24" r="1.6"/><circle cx="78" cy="22" r="1.4"/></g>
  if (variant === 'seasonal') return <g fill={c.accent}><path d="M32 34q6-6 12 0-6 6-12 0Z"/><path d="M88 26q5-5 10 0-5 5-10 0Z"/><path d="M98 44q4-4 8 0-4 4-8 0Z"/></g>
  return <g fill={c.light}><path d={sparkle(34, 41, 7)}/><path d={sparkle(94, 35, 5.5)}/></g>
}

// One illustration per catalogue art key; see content/stickers.json.
function Motif({ art, c }: { art: string; c: Paint }): ReactNode {
  switch (art) {
    case 'book': return <><path d="M24 60v32q20-7 40 3 20-10 40-3V60" fill={c.accent}/><path d="M29 54q17-9 33 0v34q-16-8-33 0Z" fill={c.light}/><path d="M66 54q16-9 33 0v34q-17-8-33 0Z" fill={c.light}/><path d="M36 61q9-4 19 0m-19 8q9-4 19 0m18-8q9-4 19 0" fill="none" strokeWidth="2.5" opacity=".55"/><path d="M80 53v22l4.5-4.5L89 75V51" fill="#c8352f" strokeWidth="2.5"/></>
    case 'bowl': return <><path d="m70 30 25 36m-16-39 22 34" fill="none"/><path d="M44 56q-6-8 0-15t0-15m14 28q-5-7 0-13" fill="none" stroke={c.light} strokeWidth="3"/><path d="M24 68h80q-2 30-40 32-38-2-40-32Z" fill={c.light}/><path d="M34 68q6-10 12-2 6-10 12 0 6-10 12 0 6-10 12 0 6-8 12 2" fill="none" stroke={c.accent} strokeWidth="3"/><circle cx="52" cy="62" r="6" fill="#fff" strokeWidth="2.5"/><circle cx="52" cy="62" r="2.6" fill="#ffcc00" stroke="none"/><path d="M36 80q28 8 56 0" fill="none" stroke={c.accent} strokeWidth="3"/></>
    case 'leaf': return <><path d="M38 90q-10-38 30-54 26-8 30-4 2 40-34 54-14 6-26 4Z" fill={c.light}/><path d="M38 90q26-26 54-54M60 66l-8-14m20 4 12 2" fill="none"/><path d="M56 94q8-22 34-18-8 20-34 18Z" fill={c.accent}/></>
    case 'bubble': return <><path d="M26 46q0-12 12-12h36q12 0 12 12v16q0 12-12 12H52L40 86V74q-14 0-14-12Z" fill={c.light}/><circle cx="44" cy="54" r="3" fill={c.line} stroke="none"/><circle cx="56" cy="54" r="3" fill={c.line} stroke="none"/><circle cx="68" cy="54" r="3" fill={c.line} stroke="none"/><path d="M70 66q0-8 8-8h18q8 0 8 8v12q0 8-8 8h-2v10L84 86h-6q-8 0-8-8Z" fill={c.accent}/></>
    case 'bolt': return <><path d="M64 26q26 0 26 26 0 12-11 20v10H49V72q-11-8-11-20 0-26 26-26Z" fill={c.light}/><path d="M51 88h26m-23 7h20" fill="none"/><path d="M67 34 53 56h11l-5 18 17-25H65Z" fill={c.accent} strokeWidth="3"/><path d="m30 40-6-4m74 4 6-4M28 58h-7m79 0h7" fill="none" stroke={c.light}/></>
    case 'heart': return <><path d="M64 98 32 66q-14-16-2-28 14-12 34 6 20-18 34-6 12 12-2 28Z" fill={c.light}/><path d="M58 52h12v9h9v12h-9v9H58v-9h-9V61h9Z" fill={c.accent} strokeWidth="2.5"/></>
    case 'flag': return <><path d="M64 42V20" fill="none"/><path d="m64 20 24 7-24 7Z" fill="#c8352f" strokeWidth="3"/><path d="M42 96V60l22-18 22 18v36Z" fill={c.light}/><path d="M57 96V82q7-9 14 0v14Z" fill={c.accent}/><rect x="50" y="64" width="8" height="9" rx="1.5" fill={c.accent} strokeWidth="2.5"/><rect x="70" y="64" width="8" height="9" rx="1.5" fill={c.accent} strokeWidth="2.5"/><path d="M34 96h60" fill="none"/></>
    default: return <><path d="M38 96V62q0-24 26-24t26 24v34Z" fill={c.light}/><path d="M64 38v58M38 70h52" fill="none" strokeWidth="2.5" opacity=".55"/><path d="m64 46 4 9 9.5 1-7 6.5 2 9.5-8.5-5-8.5 5 2-9.5-7-6.5 9.5-1Z" fill={c.accent}/><path d="M30 96h68" fill="none"/></>
  }
}

function RarityRing({ rarity, holoId }: { rarity: Rarity; holoId: string }) {
  if (rarity === 'rare') return <g><circle cx="64" cy="64" r="49.5" fill="none" stroke="#2f73d9" strokeWidth="3.5"/><path d={sparkle(108, 29, 7)} fill="#2f73d9"/></g>
  if (rarity === 'epic') return <g><defs><linearGradient id={holoId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9ad5"/><stop offset=".3" stopColor="#8447d6"/><stop offset=".55" stopColor="#5ec8f0"/><stop offset=".8" stopColor="#b8f28c"/><stop offset="1" stopColor="#ffd86b"/></linearGradient></defs><circle cx="64" cy="64" r="49.5" fill="none" stroke={`url(#${holoId})`} strokeWidth="5"/><path d={sparkle(110, 28, 8)} fill="#8447d6"/><path d={sparkle(16, 106, 6.5)} fill="#5ec8f0"/></g>
  if (rarity === 'legendary') return <g><circle cx="64" cy="64" r="50" fill="none" stroke="#c98a10" strokeWidth="5"/><circle cx="64" cy="64" r="46" fill="none" stroke="#ffe27a" strokeWidth="2"/><path d={sparkle(64, 14, 10)} fill="#ffcc00" stroke="#c98a10" strokeWidth="1.5"/><path d={sparkle(112, 61, 7)} fill="#ffcc00"/><path d={sparkle(14, 61, 7)} fill="#ffcc00"/></g>
  if (rarity === 'exclusive') return <g><circle cx="64" cy="64" r="49.5" fill="none" stroke="#c21f5b" strokeWidth="4"/><path d="M20 98h88l-7 8 7 8H20l7-8Z" fill="#c21f5b"/><text x="64" y="109.5" textAnchor="middle" fontFamily="Nunito, system-ui, sans-serif" fontSize="9" fontWeight="900" letterSpacing="1.5" fill="#fff">LIMITED</text></g>
  return null
}

// Picks the sticker's image file: a time-of-day edition (`leavey-night.png`) if one exists, else the base image.
function assetFor(stickerKey: string, image: string | undefined, variant: Variant) {
  const base = image ?? `${stickerKey}.svg`
  const dot = base.lastIndexOf('.'), variantAsset = `${base.slice(0, dot)}-${variant}${base.slice(dot)}`
  if (__STICKER_ASSETS__.includes(variantAsset)) return { asset: variantAsset, isEdition: true }
  return { asset: __STICKER_ASSETS__.includes(base) ? base : null, isEdition: false }
}
/** `rarity` overrides the catalogue rarity, e.g. for a quest reward upgraded by a party bonus. */
export function StickerImage({ stickerKey, name, variant = 'day', locked = false, size = 112, rarity: rarityOverride }: { stickerKey: string; name: string; variant?: Variant; locked?: boolean; size?: number; rarity?: Rarity }) {
  const [broken, setBroken] = useState<string | null>(null)
  const holoId = `holo-${useId().replace(/:/g, '')}`
  const listed = stickerCatalogue.get(stickerKey)
  const sticker = listed && rarityOverride ? { ...listed, rarity: rarityOverride } : listed
  const { asset, isEdition } = assetFor(stickerKey, sticker?.image, variant)
  const c = palettes[variant] ?? palettes.day
  const style = { width: size, height: size } as CSSProperties
  const rarity = sticker ? `, ${rarityLabels[sticker.rarity].toLowerCase()}` : ''
  return <span className={`sticker-image variant-${variant}${sticker ? ` rarity-${sticker.rarity}` : ''}${locked ? ' is-locked' : ''}`} style={style} role="img" aria-label={`${name}, ${variant} edition${rarity}${locked ? ', locked' : ''}`}>
    {asset && broken !== asset ? <img src={`/stickers/${asset}`} alt="" style={isEdition ? { filter: 'none' } : undefined} onError={() => setBroken(asset)} /> : <svg viewBox="0 0 128 128" aria-hidden="true">
      <path d="M65 6c14-8 26 2 29 11 19-3 29 13 25 27 15 11 11 30-1 37 3 19-13 30-27 26-11 18-29 19-40 7-19 8-34-2-34-18C1 88-1 69 10 57 2 42 12 24 29 24 33 8 48 2 65 6Z" fill="#fff"/>
      <circle cx="64" cy="64" r="47" fill={c.base}/>
      <Sky variant={variant} c={c}/>
      <path d="M20.6 82Q64 66 107.4 82A47 47 0 0 1 20.6 82Z" fill={c.shade}/>
      <path d="M28 52q5-22 26-31" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round"/>
      <g stroke={c.line} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><Motif art={sticker?.art ?? stickerKey} c={c}/></g>
      {sticker && !locked ? <RarityRing rarity={sticker.rarity} holoId={holoId}/> : null}
    </svg>}
    {locked ? <span className="sticker-lock"><Icon name="lock" size={12}/></span> : null}
  </span>
}
