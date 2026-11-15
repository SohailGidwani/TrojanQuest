import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { StickerImage } from '../components/StickerImage'
import { Icon } from '../components/Icon'
import { categories, timeVariants } from '../components/types'
import type { Catch, Spot } from '../components/types'
import { spotVariants } from '../components/collection'
import { StickerDetails } from '../components/StickerMeta'
import { stickerCatalogue } from '../components/catalogue'
import { canEarn } from '../components/stickers'
const hours = { morning: '6 AM – 11 AM', day: '11 AM – 5 PM', night: '5 PM – 6 AM' }
export function SpotCard({ spot, catches, isDemo, readOnly = false, onClose, onVisit }: { spot: Spot | null; catches: Catch[]; isDemo: boolean; readOnly?: boolean; onClose: () => void; onVisit: (id: string, variant: 'morning' | 'day' | 'night') => void }) {
  const [variant, setVariant] = useState<'morning' | 'day' | 'night'>('day')
  const collected = spot ? spotVariants(spot.id, catches) : []
  const earnable = spot ? canEarn(stickerCatalogue, spot.sticker_key) : false
  return <Dialog open={!!spot} onClose={onClose} title={spot?.name ?? 'Campus place'}>{spot ? <>
    <div className={`spot-cover category-${spot.category}`}><StickerImage stickerKey={spot.sticker_key} name={spot.name} variant={variant} size={176}/><span className="category-label">{categories.find(c => c.key === spot.category)?.label}</span></div>
    <StickerDetails stickerKey={spot.sticker_key}/>
    <p className="spot-description">{spot.card_text}</p><div className="tip-box"><Icon name="spark"/><div><strong>A little insider tip</strong><p>{spot.tip}</p></div></div>
    <h3 className="section-label">Three times, three editions</h3><div className="variant-picker">{timeVariants.map(time => <button key={time} className={variant === time ? 'variant-option selected' : 'variant-option'} aria-pressed={variant === time} aria-label={`${time}, ${hours[time]}, ${collected.includes(time) ? 'collected' : 'not collected'}`} onClick={() => setVariant(time)}><Icon name={time === 'morning' ? 'sunrise' : time === 'day' ? 'sun' : 'moon'}/><span>{time}<small>{hours[time]}</small></span>{collected.includes(time) ? <Icon name="check" size={15}/> : <Icon name="lock" size={13}/>}</button>)}</div>
    {readOnly ? <p className="quiet-note">You’re viewing a friend’s collection. Their location is never shared.</p> : isDemo ? <><button className="button primary full-width" disabled={collected.includes(variant) || !earnable} onClick={() => onVisit(spot.id, variant)}>{collected.includes(variant) ? 'Already in your collection' : !earnable ? 'Not available right now' : `Try a demo visit · ${variant}`}{collected.includes(variant) ? <Icon name="check"/> : !earnable ? <Icon name="lock"/> : <Icon name="spark"/>}</button><p className="quiet-note">Demo visits preview collection and quest progress. Real catches will require being within 50 m.</p></> : <><a className="button primary full-width" href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lng}#map=18/${spot.lat}/${spot.lng}`} target="_blank" rel="noopener noreferrer">See this place on a map<Icon name="external"/></a><p className="quiet-note">Collect this sticker through the campus map when you’re nearby.</p></>}
  </> : null}</Dialog>
}
