import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useCollection } from './useCollection'
import { Icon } from './Icon'
import type { Catch, Profile, Quest, Spot } from './types'
import { currentQuest, questProgress } from './collection'
import { Pin, PixelIcon } from './Pixel'
import type { PixelIconName } from './Pixel'
import { stickerCount } from './party'
import { StickerBook } from '../stickerbook/StickerBook'
import { SpotCard } from '../spots/SpotCard'
import { QuestsScreen } from '../quests/QuestsScreen'
import { FriendsScreen } from '../friends/FriendsScreen'
import { GuideChat } from '../guide/GuideChat'
import { HuntScreen } from '../map/HuntScreen'
import { tutorialComplete } from '../map/trails'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import '@fontsource/nunito/900.css'
import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import './collection.css'
// Pixel Path theme (design G): loaded last so it restyles the screens above.
import './theme.css'

const navigation: { to: string; label: string; icon: PixelIconName }[] = [
  { to: '/hunt', label: 'Hunt', icon: 'pin' },
  { to: '/stickers', label: 'Collection', icon: 'book' }, { to: '/quests', label: 'Quests', icon: 'trophy' }, { to: '/friends', label: 'Friends', icon: 'heart' }, { to: '/guide', label: 'Campus guide', icon: 'chat' },
]
// Quest icon wrapped in a ring showing how far along the current quest is.
function QuestRing({ quest, visited, total }: { quest: Quest; visited: number; total: number }) {
  const percent = Math.round(visited / Math.max(1, total) * 100)
  return <span className="quest-ring" role="img" aria-label={`${quest.title}: ${visited} of ${total} places`}>
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle className="quest-ring-track" cx="18" cy="18" r="16"/><circle className="quest-ring-fill" cx="18" cy="18" r="16" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent}/></svg>
    <PixelIcon name="trophy" size={16}/>
  </span>
}
type CollectionProps ={ accessToken?: string; profile?: Profile }
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
  const { pathname } = useLocation()
  // Drives the sliding highlight in the mobile tab bar; nested routes like /friends/:id keep their tab.
  const activeIndex = navigation.findIndex(item => pathname === item.to || pathname.startsWith(`${item.to}/`))
  const current = currentQuest(data.quests, data.catches, data.accepted)
  function openSpot(spot: Spot) { setDetail({ spot, readOnly: false }) }
  const placesFound = new Set(data.catches.filter(c => c.source === 'spot').map(c => c.source_id)).size
  const questsDone = data.quests.filter(quest => questProgress(quest, data.catches).complete).length
  const stickers = stickerCount(data.catches.length, data.rolls)
  const hud = <span className="hud-stats" aria-label={`${placesFound} of ${data.spots.length} places found, ${stickers} stickers, ${questsDone} quests complete`}><span className="hud-stat places"><i aria-hidden="true"/>{placesFound}/{data.spots.length}</span><span className="hud-stat stickers"><i aria-hidden="true"/>{stickers}</span><span className="hud-stat quests"><i aria-hidden="true"/>{questsDone}/{data.quests.length}</span></span>
  return <div className={`collection-app${locked ? ' orientation-mode' : ''}`}><a href="#main-content" className="skip-link">Skip to content</a>
    {!locked ? <aside className="sidebar"><Link to="/hunt" className="brand" aria-label="TrojanQuest home"><span className="brand-mark"><Pin size={40}/></span><span>Trojan<span>Quest</span><small>A little more campus.</small></span></Link><nav aria-label="Main navigation" style={{ '--nav-count': navigation.length, '--nav-index': activeIndex } as CSSProperties}>{activeIndex >= 0 ? <span className="nav-indicator" aria-hidden="true"/> : null}{navigation.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>{item.to === '/quests' && current ? <QuestRing {...current}/> : <PixelIcon name={item.icon} size={24}/>}<span>{item.label}</span>{item.to === '/quests' && data.quests.length ? <small>{data.quests.length}</small> : null}</NavLink>)}</nav>
      <div className="sidebar-note"><span className="note-star">✦</span><h3>Go a little off-script.</h3><p>Your next favorite corner of campus might be one detour away.</p></div>
      <div className="sidebar-bottom">{data.isDemo ? <a href="/dev/ai" className="workbench-link"><Icon name="spark" size={17}/>AI workbench<Icon name="external" size={13}/></a> : null}<div className="profile"><span className="profile-avatar">{data.profile?.display_name.slice(0, 1).toUpperCase() || 'T'}</span><span><strong>{data.profile?.display_name || 'Your collection'}</strong><small>{data.isDemo ? 'Demo explorer' : 'Campus explorer'}</small></span><span className="profile-dot"/></div></div>
    </aside> : null}
    <div className="main-column"><header className="topbar">{locked ? <Link className="orientation-brand" to="/hunt">Trojan<span>Quest</span></Link> : null}<span><Icon name="pin" size={15}/>University of Southern California</span>{hud}</header>
      {data.isDemo ? <div className="demo-banner"><span className="demo-dot"/><p><strong>Demo collection.</strong> Sample places and friends; visits stay in this browser. Sign-in is paused.</p>{!locked ? <a href="/dev/ai">Try photo-to-sticker<Icon name="arrow" size={14}/></a> : null}<button className="text-button demo-reset" onClick={resetDemo}><Icon name="refresh" size={14}/>Reset demo</button></div> : null}
      <main id="main-content" className="page-content">
        {data.storageWarning ? <p className="connection-notice" role="alert">Your browser couldn’t save or reset demo progress. Changes may not persist when you reload.</p> : null}
        {data.errors.length ? <div className="connection-notice" role="alert"><div><strong>{data.mode === 'offline' ? 'The server is taking a moment.' : 'Some of your collection is still on its way.'}</strong><p>{data.errors.join(' ')}</p></div><button className="text-button" onClick={data.reload}><Icon name="refresh" size={15}/>Retry</button></div> : null}
        {data.mode === 'loading' ? <div className="loading-state" role="status"><span className="loading-emblem"><Pin size={56} mood="think"/></span>Opening your sticker book…</div> : <Routes>
          <Route path="/hunt" element={<HuntScreen key={huntVersion} data={data}/>}/>
          {!locked ? <><Route path="/stickers" element={<StickerBook spots={data.spots} catches={data.catches} quests={data.quests} onSpot={openSpot} rolls={data.rolls}/>}/>
          <Route path="/quests" element={<QuestsScreen quests={data.quests} spots={data.spots} catches={data.catches} accepted={data.accepted} onAccept={data.acceptQuest} onSpot={openSpot} friends={data.friends} parties={data.parties} rolls={data.rolls} partiesAvailable={data.partiesAvailable} onInvite={data.inviteFriend} onRemove={data.removeFromParty}/>}/>
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
