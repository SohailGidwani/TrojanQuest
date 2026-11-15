import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatchResult } from '../../../shared/types'
import type { CollectionData } from '../components/useCollection'
import { Card, EmptyState, PageHeading } from '../components/Card'
import { Icon } from '../components/Icon'
import { StickerImage } from '../components/StickerImage'
import { requestJSON } from '../components/api'
import { campusVariant, compassDirection, proximity } from './navigation'
import { useLocation } from './useLocation'
import { HuntMap } from './HuntMap'
import './hunt.css'

export function HuntScreen({ data }: { data: CollectionData }) {
  const target = data.spots.find(spot => /bovard.*(auditorium|administration)/i.test(spot.name))
  const gps = useLocation()
  const finder = useRef<HTMLElement>(null)
  const [source, setSource] = useState<'off' | 'gps' | 'simulation'>('off')
  const [simulatedDistance, setSimulatedDistance] = useState(200)
  const [now, setNow] = useState(Date.now)
  const [hint, setHint] = useState(false)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const simulation = data.isDemo && source === 'simulation'
  const fix = simulation && target ? { lat: target.lat + simulatedDistance / 111195, lng: target.lng, accuracy: 5, timestamp: now } : source === 'gps' ? gps.fix : null
  const status = target ? proximity(target, fix, now) : null
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
    setPending(true); setFeedback('')
    try {
      if (data.isDemo) { data.visit(target.id, campusVariant()); setFeedback('Demo discovery collected. Find your new edition in the sticker book.') }
      else {
        const result = await requestJSON<CatchResult>('/api/catch', { accessToken: data.accessToken, body: { source: 'spot', source_id: target.id, lat: fresh!.lat, lng: fresh!.lng } })
        if (!result.ok) { setFeedback(result.reason === 'too_far' ? 'The campus server still sees you outside the 50 m circle. Move closer and try again.' : 'This discovery is not available right now.'); return }
        setFeedback(result.already_caught ? 'This edition is already in your book.' : 'Discovery collected. Your sticker book is updating.'); data.reload()
      }
    } catch { setFeedback('We couldn’t save this discovery. Your progress hasn’t been marked complete; try again.') }
    finally { setPending(false) }
  }
  if (!target) return <><PageHeading title="A little mystery. A real adventure.">Follow the clue. Find the place. Collect its story.</PageHeading><Card><EmptyState title="Your first trail is being prepared">The Bovard discovery needs a published campus place before it can begin.</EmptyState></Card></>
  return <>
    <PageHeading title="Let curiosity lead.">One clue, one campus discovery. Your first trail starts here.</PageHeading>
    <div className="hunt-layout"><section className="hunt-clue card"><div className="hunt-number"><span>First discovery</span><span><Icon name="spark" size={14}/>A performance to remember</span></div><div className="mystery-sticker"><StickerImage stickerKey={revealed ? target.sticker_key : 'star'} name={revealed ? target.name : 'Mystery campus discovery'} variant={earned ? variant : 'special'} locked={!revealed} size={130}/></div><span className="small-label">{revealed ? 'Mystery solved' : 'Your clue'}</span><h2>{revealed ? target.name : 'I hold the stage, but I’m not a classroom.'}</h2><p>{revealed ? 'A little campus history, a lot of performances. You found the first stop on your trail.' : 'Find the place where the curtain rises and campus comes together. The promenade will lead you toward the applause.'}</p>{!revealed ? <button className="text-button" onClick={() => setHint(value => !value)}><Icon name="guide" size={16}/>{hint ? 'Hide the extra hint' : 'A little extra hint?'}</button> : <a className="text-button" href="https://calendar.usc.edu/bovard_auditorium_adm" target="_blank" rel="noopener noreferrer">Meet this campus venue<Icon name="external" size={14}/></a>}{hint && !revealed ? <p className="hunt-extra-hint">Look for the auditorium on Trousdale Parkway. Stay on public campus paths; you don’t need to go inside.</p> : null}<button className="button primary full-width" onClick={startFinding}>Start finding<Icon name="pin" size={16}/></button><p className="quiet-note">Uses your location while you follow the clue.</p><div className="hunt-reward"><StickerImage stickerKey={target.sticker_key} name="Discovery reward" variant={variant} locked={!earned} size={63}/><div><strong>A {variant} edition awaits</strong><small>Discover this place to add it to your book.</small></div></div></section>
    <section ref={finder} className={`finder card${status?.canCollect ? ' finder-arrived' : ''}`} aria-label="Distance finder"><div className="finder-header"><span className={simulation ? 'location-status simulated' : 'location-status'}><span/>{simulation ? 'Simulated walk' : gps.tracking ? 'GPS enabled' : 'Location paused'}</span><span className="finder-north">North-up guidance</span></div><div className="finder-dial" aria-hidden="true"><span className="dial-north">N</span><span className="dial-east">E</span><span className="dial-south">S</span><span className="dial-west">W</span><span className="dial-circle inner"/>{status?.canCollect ? <span className="arrival-check"><Icon name="check" size={45}/></span> : <svg viewBox="0 0 128 128" className="direction-arrow" style={{ transform: `rotate(${status?.bearing ?? 0}deg)`, opacity: status?.bearing == null ? .25 : 1 }}><path d="m64 20 26 68-26-16-26 16Z" fill="currentColor"/></svg>}</div><div className="finder-distance"><strong>{status?.distance == null ? distanceLabel : `≈ ${distanceLabel}`}</strong><span>{stateLabel}</span></div><p className="bearing-copy">{status?.bearing != null && status.state !== 'arrived' ? `The target is approximately ${compassDirection(status.bearing)} of you. Align north on the map; this arrow is not your phone’s heading.` : 'Distance updates as your browser gets new location fixes.'}</p><p className="accuracy-copy">{fix ? `Reported accuracy: ±${Math.round(fix.accuracy)} m${status?.state === 'stale' ? ' · fix is older than 30 seconds' : ''}` : 'Location is used only while you’re finding this place. No location trail is saved.'}</p>
    <div className="finder-controls"><button className="button secondary" onClick={() => { setSource('gps'); gps.start(); setFeedback('') }}><Icon name="pin" size={16}/>{gps.tracking ? 'Refresh GPS' : 'Use my location'}</button>{active ? <button className="button secondary" onClick={() => { gps.stop(); setSource('off') }}>Pause</button> : null}</div>{data.isDemo ? <div className="simulation-controls">{simulation ? <><label htmlFor="walk-distance">Simulated distance <strong>{simulatedDistance} m</strong></label><input id="walk-distance" type="range" min="0" max="350" step="10" value={simulatedDistance} onChange={event => setSimulatedDistance(Number(event.target.value))}/><div><button onClick={() => setSimulatedDistance(200)}>Far away</button><button onClick={() => setSimulatedDistance(80)}>Getting closer</button><button onClick={() => setSimulatedDistance(20)}>At the venue</button></div><p>Test coordinates only. Demo catches stay in this browser.</p></> : <button className="text-button" onClick={() => { gps.stop(); setSource('simulation'); setSimulatedDistance(200); setFeedback('') }}>Try a simulated walk<Icon name="arrow" size={15}/></button>}</div> : null}
    {gps.error && source === 'gps' ? <p className="form-error" role="alert">{gps.error}</p> : null}{status?.state === 'uncertain' ? <p className="form-error" role="status">GPS is too imprecise to check in. Wait for ±25 m or better, and move closer.</p> : null}<button className="button primary full-width" disabled={pending || earned || !status?.canCollect} onClick={handleCollect}>{pending ? 'Collecting…' : earned ? 'Edition already collected' : data.isDemo ? 'Collect demo discovery' : 'Collect this discovery'}<Icon name={earned ? 'check' : 'spark'} size={17}/></button>{feedback ? <p className="hunt-feedback" role="status">{feedback}</p> : null}{earned ? <Link className="text-button book-after-hunt" to="/stickers">Open your sticker book<Icon name="arrow" size={16}/></Link> : null}<p className="quiet-note">Within 50 m, with a fresh fix whose uncertainty fits inside the circle. Follow safe public paths and look up while walking.</p></section></div>
    <section className="hunt-map-section"><div className="section-heading"><div><h2>Your little corner of campus</h2><p>The destination appears once your location is confidently nearby.</p></div></div>{active && status?.distance != null ? <HuntMap target={target} fix={fix} revealed={revealed}/> : <div className="map-consent"><Icon name="pin" size={30}/><h3>The map starts when you do.</h3><p>Enable GPS or start the simulated walk to load the campus map. Map tiles are provided by OpenStreetMap.</p></div>}<p className="quiet-note">Approximate outdoor GPS guidance, not turn-by-turn navigation or Apple Find My precision.</p></section>
  </>
}
