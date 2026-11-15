import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useCollection } from './useCollection'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { Catch, Profile, Spot } from './types'
import { StickerBook } from '../stickerbook/StickerBook'
import { SpotCard } from '../spots/SpotCard'
import { QuestsScreen } from '../quests/QuestsScreen'
import { FriendsScreen } from '../friends/FriendsScreen'
import { GuideChat } from '../guide/GuideChat'
import { HuntScreen } from '../map/HuntScreen'
import { tutorialComplete } from '../map/trails'
import './collection.css'

const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: '/hunt', label: 'Hunt', icon: 'pin' },
  { to: '/stickers', label: 'Sticker book', icon: 'album' }, { to: '/quests', label: 'Quests', icon: 'quest' }, { to: '/friends', label: 'Friends', icon: 'friends' }, { to: '/guide', label: 'Guide', icon: 'guide' },
]
type CollectionProps = { accessToken?: string; profile?: Profile }
// Reset all account-scoped screens and pending requests when the session changes.
export function CollectionApp(props: CollectionProps) {
  return <CollectionSession key={props.accessToken ?? 'local-preview'} {...props}/>
}
// Preview wrapper only: Manaswi can mount the exported screens in the final app shell.
function CollectionSession({ accessToken, profile }: CollectionProps) {
  const data = useCollection(accessToken, profile)
  const [huntVersion, setHuntVersion] = useState(0)
  const locked = !tutorialComplete(data.spots, data.catches)
  function resetDemo() { data.resetDemo(); setHuntVersion(value => value + 1); setDetail(null) }
  const [detail, setDetail] = useState<{ spot: Spot; catches?: Catch[]; readOnly: boolean } | null>(null)
  function openSpot(spot: Spot) { setDetail({ spot, readOnly: false }) }
  return <div className={`collection-app${locked ? ' orientation-mode' : ''}`}><a href="#main-content" className="skip-link">Skip to content</a>
    {!locked ? <aside className="sidebar"><Link to="/hunt" className="brand" aria-label="TrojanQuest home"><span className="brand-mark"><Icon name="spark" size={27}/></span><span>Trojan<span>Quest</span><small>A little more campus.</small></span></Link><nav aria-label="Main navigation">{navigation.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon name={item.icon}/><span>{item.label}</span>{item.to === '/quests' && data.quests.length ? <small>{data.quests.length}</small> : null}</NavLink>)}</nav>
      <div className="sidebar-note"><span className="note-star">✦</span><h3>Go a little off-script.</h3><p>Your next favorite corner of campus might be one detour away.</p></div>
      <div className="sidebar-bottom">{data.isDemo ? <a href="/dev/ai" className="workbench-link"><Icon name="spark" size={17}/>AI workbench<Icon name="external" size={13}/></a> : null}<div className="profile"><span className="profile-avatar">{data.profile?.display_name.slice(0, 1).toUpperCase() || 'T'}</span><span><strong>{data.profile?.display_name || 'Your collection'}</strong><small>{data.isDemo ? 'Demo explorer' : 'Campus explorer'}</small></span><span className="profile-dot"/></div></div>
    </aside> : null}
    <div className="main-column"><header className="topbar">{locked ? <Link className="orientation-brand" to="/hunt">Trojan<span>Quest</span></Link> : null}<span><Icon name="pin" size={15}/>University of Southern California</span><span className="topbar-right">Collect a little curiosity.<Icon name="spark" size={15}/></span></header>
      {data.isDemo ? <div className="demo-banner"><span className="demo-dot"/><p><strong>Demo collection.</strong> Sample places and friends; visits stay in this browser. Sign-in is paused.</p>{!locked ? <a href="/dev/ai">Try photo-to-sticker<Icon name="arrow" size={14}/></a> : null}<button className="text-button demo-reset" onClick={resetDemo}><Icon name="refresh" size={14}/>Reset demo</button></div> : null}
      <main id="main-content" className="page-content">
        {data.storageWarning ? <p className="connection-notice" role="alert">Your browser couldn’t save or reset demo progress. Changes may not persist when you reload.</p> : null}
        {data.errors.length ? <div className="connection-notice" role="alert"><div><strong>{data.mode === 'offline' ? 'The server is taking a moment.' : 'Some of your collection is still on its way.'}</strong><p>{data.errors.join(' ')}</p></div><button className="text-button" onClick={data.reload}><Icon name="refresh" size={15}/>Retry</button></div> : null}
        {data.mode === 'loading' ? <div className="loading-state" role="status"><span className="loading-emblem"><Icon name="album" size={34}/></span>Opening your sticker book…</div> : <Routes>
          <Route path="/hunt" element={<HuntScreen key={huntVersion} data={data}/>}/>
          {!locked ? <><Route path="/stickers" element={<StickerBook spots={data.spots} catches={data.catches} quests={data.quests} onSpot={openSpot}/>}/>
          <Route path="/quests" element={<QuestsScreen quests={data.quests} spots={data.spots} catches={data.catches} onSpot={openSpot}/>}/>
          <Route path="/friends" element={<FriendsScreen data={data} onSpot={(spot, catches) => setDetail({ spot, catches, readOnly: true })}/>}/>
          <Route path="/friends/:friendId" element={<FriendsScreen data={data} onSpot={(spot, catches) => setDetail({ spot, catches, readOnly: true })}/>}/>
          <Route path="/guide" element={<GuideChat accessToken={accessToken}/>}/>
          </> : null}<Route path="*" element={<Navigate to="/hunt" replace/>}/>
        </Routes>}
        <footer className="page-footer"><span>Made for the little discoveries.</span><span>Welcome Week, all year.</span></footer>
      </main>
    </div>
    <SpotCard spot={detail?.spot ?? null} catches={detail?.readOnly ? detail.catches ?? [] : data.catches} isDemo={data.isDemo} readOnly={detail?.readOnly} onClose={() => setDetail(null)} onVisit={data.visit}/>
    {data.message ? <div className="toast" role="status"><Icon name="check"/><span>{data.message}</span><button className="icon-button" onClick={() => data.setMessage('')} aria-label="Dismiss notification"><Icon name="close" size={16}/></button></div> : null}
  </div>
}
