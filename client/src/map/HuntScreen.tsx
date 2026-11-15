import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Spot, Variant } from '../components/types'
import { nearbyMapVisible, nextDiscovery, trails, tutorial } from './trails'
import type { Clue } from './trails'
import type { CollectionData } from '../components/useCollection'
import { Card, EmptyState, PageHeading } from '../components/Card'
import { Icon } from '../components/Icon'
import { StickerImage } from '../components/StickerImage'
import { CatchReadbackError } from './liveCollection'
import { campusVariant, compassDirection, proximity } from './navigation'
import { useLocation } from './useLocation'
import { HuntMap } from './HuntMap'
import { WelcomeScreen } from './WelcomeScreen'
import './hunt.css'

type HuntSource = 'off' | 'gps' | 'simulation'
type Tracking = { gps: ReturnType<typeof useLocation>; source: HuntSource; setSource: (value: HuntSource) => void; simulatedDistance: number; setSimulatedDistance: (value: number) => void }
function ActiveDiscovery({ data, target, clue, tracking, onComplete, training }: { data: CollectionData; target: Spot; clue: Clue; tracking: Tracking; onComplete: (spot: Spot, variant: Variant) => void; training: boolean }) {
  const { gps, source, setSource, simulatedDistance, setSimulatedDistance } = tracking
  const finder = useRef<HTMLElement>(null)
  const [now, setNow] = useState(Date.now)
  const [hint, setHint] = useState(false)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [refreshNeeded, setRefreshNeeded] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const simulation = data.isDemo && source === 'simulation'
  const fix = simulation && target ? { lat: target.lat + simulatedDistance / 111195, lng: target.lng, accuracy: 5, timestamp: now } : source === 'gps' ? gps.fix : null
  const status = target ? proximity(target, fix, now) : null
  const nearby = nearbyMapVisible(target, fix, now)
  const variant = campusVariant(new Date(now))
  const earned = !!target && data.catches.some(c => c.source === 'spot' && c.source_id === target.id && c.variant === variant)
  const revealed = !!target && data.catches.some(c => c.source === 'spot' && c.source_id === target.id) || !!status?.canCollect
  const active = simulation || gps.tracking
  const distanceLabel = status?.distance == null ? '—' : status.distance >= 1000 ? `${(status.distance / 1000).toFixed(1)} km` : `${Math.max(1, Math.round(status.distance / (status.distance >= 100 ? 10 : 1)) * (status.distance >= 100 ? 10 : 1))} m`
  const stateLabel = earned ? 'A discovery, collected.' : status?.state === 'arrived' ? 'You found it.' : status?.state === 'uncertain' ? 'Finding a better fix…' : status?.state === 'stale' ? 'Waiting for a fresh fix…' : status?.distance != null ? status.distance < 100 ? 'You’re getting close.' : 'Follow your curiosity.' : active ? 'Finding your location…' : 'Your first clue awaits.'
  function startFinding() {
    setSource('gps'); gps.start(); setFeedback(''); requestAnimationFrame(() => finder.current?.scrollIntoView({ block: 'start' }))
  }
  async function handleCollect() {
    if (!target || pending || earned) return
    // eslint-disable-next-line react/purity -- Recheck wall-clock freshness in this click handler.
    const fresh = simulation ? { ...fix!, timestamp: Date.now() } : gps.fix
    if (!proximity(target, fresh).canCollect) { setFeedback('Get a fresh, accurate location fix within the discovery circle first.'); return }
    setPending(true); setFeedback(''); setRefreshNeeded(false)
    try {
      if (data.isDemo) { const awarded = campusVariant(); data.visit(target.id, awarded); onComplete(target, awarded) }
      else {
        const result = await data.collectSpot(target.id, fresh!)
        if (!result.ok) { setFeedback(result.reason === 'too_far' ? 'The campus server still sees you outside the 50 m circle. Move closer and try again.' : 'This discovery is not available right now.'); return }
        setFeedback(result.already_caught ? 'This edition is already in your book.' : 'Discovery collected. Your sticker book is up to date.'); onComplete(target, result.variant)
      }
    } catch (error) { setRefreshNeeded(error instanceof CatchReadbackError); setFeedback(error instanceof CatchReadbackError ? error.message : 'We couldn’t confirm this discovery. Try again; an edition can only be collected once.') }
    finally { setPending(false) }
  }
  if (!target) return <><PageHeading title="A little mystery. A real adventure.">Follow the clue. Find the place. Collect its story.</PageHeading><Card><EmptyState title="Your first trail is being prepared">The Bovard discovery needs a published campus place before it can begin.</EmptyState></Card></>
  return <>
    <PageHeading title="Let curiosity lead.">Follow the clue. The map reveals itself only when you’re nearby.</PageHeading>
    <div className="hunt-layout"><section className="hunt-clue card"><div className="hunt-number"><span>{training ? 'Training wheels · First discovery' : 'Your next discovery'}</span><span><Icon name="spark" size={14}/>{training ? 'A performance to remember' : 'One clue at a time'}</span></div><div className="mystery-sticker"><StickerImage stickerKey={revealed ? target.sticker_key : 'star'} name={revealed ? target.name : 'Mystery campus discovery'} variant={earned ? variant : 'special'} locked={!revealed} size={130}/></div><span className="small-label">{revealed ? 'Mystery solved' : 'Your clue'}</span><h2>{revealed ? target.name : clue.title}</h2><p>{revealed ? 'You found another little piece of campus. Step inside its story.' : clue.text}</p>{!revealed ? <button className="text-button" onClick={() => setHint(value => !value)}><Icon name="guide" size={16}/>{hint ? 'Hide the extra hint' : 'A little extra hint?'}</button> : <a className="text-button" href={clue.source} target="_blank" rel="noopener noreferrer">Meet this campus venue<Icon name="external" size={14}/></a>}{hint && !revealed ? <p className="hunt-extra-hint">{clue.hint} Stay on public paths; you don’t need to enter the building.</p> : null}<button className="button primary full-width" onClick={startFinding}>Start finding<Icon name="pin" size={16}/></button><p className="quiet-note">Uses your location while you follow the clue.</p><div className="hunt-reward"><StickerImage stickerKey={target.sticker_key} name="Discovery reward" variant={variant} locked={!earned} size={63}/><div><strong>A {variant} edition awaits</strong><small>Discover this place to add it to your book.</small></div></div></section>
    <section ref={finder} className={`finder card${status?.canCollect ? ' finder-arrived' : ''}`} aria-label="Distance finder"><div className="finder-header"><span className={simulation ? 'location-status simulated' : 'location-status'}><span/>{simulation ? 'Simulated walk' : gps.tracking ? 'GPS enabled' : 'Location paused'}</span><span className="finder-north">North-up guidance</span></div>{nearby ? <><div className="finder-dial" aria-hidden="true"><span className="dial-north">N</span><span className="dial-east">E</span><span className="dial-south">S</span><span className="dial-west">W</span><span className="dial-circle inner"/>{status?.canCollect ? <span className="arrival-check"><Icon name="check" size={45}/></span> : <svg viewBox="0 0 128 128" className="direction-arrow" style={{ transform: `rotate(${status?.bearing ?? 0}deg)`, opacity: status?.bearing == null ? .25 : 1 }}><path d="m64 20 26 68-26-16-26 16Z" fill="currentColor"/></svg>}</div><div className="finder-distance"><strong>{status?.distance == null ? distanceLabel : `≈ ${distanceLabel}`}</strong><span>{stateLabel}</span></div><p className="bearing-copy">{status?.bearing != null && status.state !== 'arrived' ? `The target is approximately ${compassDirection(status.bearing)} of you. Align north on the map; this arrow is not your phone’s heading.` : 'Distance updates as your browser gets new location fixes.'}</p><p className="accuracy-copy">{fix ? `Reported accuracy: ±${Math.round(fix.accuracy)} m${status?.state === 'stale' ? ' · fix is older than 30 seconds' : ''}` : 'Location is used only while you’re finding this place. No location trail is saved.'}</p>
    </> : <div className="hidden-finder"><Icon name="lock" size={28}/><h3>{active ? "Keep following the clue." : "Ready for your first steps?"}</h3><p>{active ? "Location is updating quietly. The map and direction finder appear only within 150 m, with an accurate fix." : "Start location tracking to discover what’s nearby. Your destination stays a mystery until you get close."}</p></div>}<div className="finder-controls"><button className="button secondary" onClick={() => { setSource('gps'); gps.start(); setFeedback('') }}><Icon name="pin" size={16}/>{gps.tracking ? 'Refresh GPS' : 'Use my location'}</button>{active ? <button className="button secondary" onClick={() => { gps.stop(); setSource('off') }}>Pause</button> : null}</div>{data.isDemo ? <div className="simulation-controls">{simulation ? <><label htmlFor="walk-distance">Simulated distance <strong>{simulatedDistance} m</strong></label><input id="walk-distance" type="range" min="0" max="350" step="10" value={simulatedDistance} onChange={event => setSimulatedDistance(Number(event.target.value))}/><div><button onClick={() => setSimulatedDistance(200)}>Far away</button><button onClick={() => setSimulatedDistance(80)}>Getting closer</button><button onClick={() => setSimulatedDistance(20)}>At the venue</button></div><p>Test coordinates only. Demo catches stay in this browser.</p></> : <button className="text-button" onClick={() => { gps.stop(); setSource('simulation'); setSimulatedDistance(200); setFeedback('') }}>Try a simulated walk<Icon name="arrow" size={15}/></button>}</div> : null}
    {status?.state === 'stale' ? <p className="accuracy-copy" role="status">Waiting for a fresh GPS fix. The map stays tucked away until your location updates.</p> : null}{gps.error && source === 'gps' ? <p className="form-error" role="alert">{gps.error}</p> : null}{status?.state === 'uncertain' ? <p className="form-error" role="status">Waiting for a more precise location. Wait for ±25 m or better, and move closer.</p> : null}<button className="button primary full-width" disabled={pending || earned || !status?.canCollect} onClick={handleCollect}>{pending ? 'Collecting…' : earned ? 'Edition already collected' : data.isDemo ? 'Collect demo discovery' : 'Collect this discovery'}<Icon name={earned ? 'check' : 'spark'} size={17}/></button>{feedback ? <p className="hunt-feedback" role="status">{feedback}</p> : null}{earned ? <Link className="text-button book-after-hunt" to="/stickers">Open your sticker book<Icon name="arrow" size={16}/></Link> : null}<p className="quiet-note">Within 50 m, with a fresh fix whose uncertainty fits inside the circle. Follow safe public paths and look up while walking.</p></section></div>
    {refreshNeeded ? <button className="button secondary" onClick={data.reload}>Reload saved collection<Icon name="refresh" size={16}/></button> : null}
    {nearby ? <section className="hunt-map-section"><div className="section-heading"><div><h2>Your little corner of campus</h2><p>The destination appears once your location is confidently nearby.</p></div></div>{active && status?.distance != null ? <HuntMap target={target} fix={fix} revealed={nearby} name={target.name}/> : <div className="map-consent"><Icon name="pin" size={30}/><h3>The map starts when you do.</h3><p>Enable GPS or start the simulated walk to load the campus map. Map tiles are provided by OpenStreetMap.</p></div>}<p className="quiet-note">Approximate outdoor GPS guidance, not turn-by-turn navigation or Apple Find My precision.</p></section> : null}
  </>
}

function savedTrail() { try { const value = localStorage.getItem('trojanquest:trail:v1'); return trails.some(trail => trail.id === value) ? value : null } catch { return null } }
export function HuntScreen({ data }: { data: CollectionData }) {
  const gps = useLocation()
  const [source, setSource] = useState<HuntSource>('off')
  const [simulatedDistance, setSimulatedDistance] = useState(200)
  const [selected, setSelected] = useState<string | null>(savedTrail)
  const [choosing, setChoosing] = useState(false)
  const [begun, setBegun] = useState(false)
  const [revisit, setRevisit] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [celebration, setCelebration] = useState<(Spot & { variant: Variant; training: boolean }) | null>(null)
  const completed = [...new Set([...data.catches.filter(c => c.source === 'spot').map(c => c.source_id), ...confirmed])]
  const first = data.spots.find(spot => tutorial.match.test(spot.name))
  const trained = !!first && completed.includes(first.id)
  const known = [tutorial, ...trails.flatMap(trail => trail.stops)].flatMap(clue => {
    const spot = data.spots.find(place => clue.match.test(place.name))
    return spot && completed.includes(spot.id) ? [{ spot, clue }] : []
  })
  const discovery = known.find(item => item.spot.id === revisit) ?? nextDiscovery(data.spots, completed, selected)
  function choose(id: string) {
    setSelected(id); setRevisit(null); setChoosing(false); setCelebration(null); setSimulatedDistance(200)
    try { localStorage.setItem('trojanquest:trail:v1', id) } catch { /* Optional preference; discoveries are saved separately. */ }
  }
  function finish(spot: Spot, variant: Variant) {
    if (data.isDemo) setConfirmed(previous => [...new Set([...previous, spot.id])])
    setCelebration({ ...spot, variant, training: !trained }); setSimulatedDistance(200); setRevisit(null)
    if (!trained && first?.id === spot.id) { setSelected(null); setChoosing(true) }
  }
  const tracking = { gps, source, setSource, simulatedDistance, setSimulatedDistance }
  if (!trained && !begun) return <WelcomeScreen onBegin={() => setBegun(true)}/>
  if (celebration) return <section className="discovery-celebration"><span className="celebration-stars" aria-hidden="true">✦ ✧ ✦</span><StickerImage stickerKey={celebration.sticker_key} name={celebration.name} variant={celebration.variant} size={180}/><span className="small-label">{celebration.training ? 'Training wheels off' : 'Another story for your book'}</span><h1>{celebration.training ? 'You found your feet.' : 'Look what you found.'}</h1><h2>{celebration.name}</h2><p>{celebration.training ? 'Everyone starts here. Where you go next is entirely up to you.' : 'Your trail progress is saved. Keep going, or take a completely different turn.'}</p><button className="button primary" onClick={() => setCelebration(null)}>{celebration.training ? 'Choose my next adventure' : 'Keep exploring'}<Icon name="arrow"/></button><button className="text-button" onClick={() => { setCelebration(null); setChoosing(true) }}>Show all trails</button><Link className="text-button" to="/stickers">Peek at my sticker book</Link></section>
  if (trained && (choosing || !discovery)) return <><PageHeading title="What catches your curiosity?">No wrong turns here. Pick a clue, switch trails whenever you like.</PageHeading><div className="training-complete"><Icon name="check"/><span>Bovard discovered. Your campus adventure is officially yours.</span></div><div className="trail-choices">{trails.map(trail => {
    const stops = trail.stops.map(clue => data.spots.find(spot => clue.match.test(spot.name)))
    const progress = stops.filter(spot => spot && completed.includes(spot.id)).length
    const available = stops.every(Boolean), done = progress === trail.stops.length
    return <button key={trail.id} className={`trail-choice trail-${trail.id}`} disabled={!available || done} onClick={() => choose(trail.id)}><StickerImage stickerKey={trail.key} name={trail.title} variant={trail.id === 'libraries' ? 'night' : 'seasonal'} size={115}/><span className="trail-progress">{done ? 'Trail complete ✓' : `${progress} / ${trail.stops.length} discoveries`}</span><h2>{trail.title}</h2><p>{trail.teaser}</p><span className="trail-first-clue">{done ? 'Every little story, collected.' : progress ? 'Your next clue is right where you left it.' : trail.stops[0].title}</span><span className="trail-cta">{!available ? 'Trail coming soon' : done ? 'All discovered' : progress ? 'Resume this trail' : 'Follow this clue'}<Icon name={done ? 'check' : 'arrow'}/></span></button>
  })}</div><section className="revisit-places"><h2>Same place. A different light.</h2><p>Return to a discovery for its morning, day, or night edition.</p><div>{known.map(({ spot }) => <button key={spot.id} className="button secondary" onClick={() => { setRevisit(spot.id); setChoosing(false); setCelebration(null); setSimulatedDistance(200) }}>{spot.name}<Icon name="refresh" size={15}/></button>)}</div></section><p className="quiet-note">Choosing one never locks the others. Collected places and trail progress stay in your book.</p></>
  if (!discovery) return <Card><EmptyState title="Your first discovery is being prepared">Bovard needs to be in the published campus catalogue before the training trail can start.</EmptyState></Card>
  return <>{trained ? <div className="trail-switch-bar"><span><Icon name="quest"/>{revisit ? 'Return discovery' : trails.find(trail => trail.id === selected)?.title}</span><button className="button secondary" onClick={() => setChoosing(true)}>Switch trails<Icon name="arrow" size={15}/></button></div> : <div className="onboarding-note"><Icon name="spark"/><span>Every Trojan starts with this shared first discovery. Find it to unlock your choice of trails.</span></div>}<ActiveDiscovery key={discovery.spot.id} data={data} target={discovery.spot} clue={discovery.clue} tracking={tracking} training={!trained} onComplete={finish}/></>
}
