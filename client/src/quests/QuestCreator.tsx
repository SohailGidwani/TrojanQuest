import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, EmptyState, PageHeading } from '../components/Card'
import { Icon } from '../components/Icon'
import { PinSays, Pin } from '../components/Pixel'
import { StickerImage } from '../components/StickerImage'
import { RarityBadge } from '../components/StickerMeta'
import { rarityLabels } from '../components/stickers'
import { requestJSON, RequestError } from '../components/api'
import type { Spot } from '../components/types'
import { creatorRarities, durations, limits, normalizePalette, stickerArts } from '../components/customQuests'
import type { Author, CreatorRarity, CustomReward, CustomStop, Palette, QuestDraft, StickerArt } from '../components/customQuests'
import { MapPicker } from './MapPicker'

type DraftStop = CustomStop & { key: number }
type AiSticker = { key: StickerArt; name: string; colors: string[]; lore: string }
const artNames: Record<StickerArt, string> = { book: 'Book', bowl: 'Bowl', leaf: 'Leaf', star: 'Star', bubble: 'Chat', bolt: 'Bolt', heart: 'Heart', flag: 'Flag' }

function ArtPicker({ value, onChange, label, rarity, colors }: { value: StickerArt; onChange: (art: StickerArt) => void; label: string; rarity?: CreatorRarity; colors?: Palette }) {
  return <div className="art-picker" role="radiogroup" aria-label={label}>{stickerArts.map(art =>
    <button type="button" key={art} role="radio" aria-checked={value === art} aria-label={artNames[art]} className={value === art ? 'art-option selected' : 'art-option'} onClick={() => onChange(art)}>
      <StickerImage stickerKey={art} name={artNames[art]} variant="special" size={52} rarity={value === art ? rarity : undefined} colors={colors}/>
    </button>)}</div>
}
function Counter({ value, max }: { value: string; max: number }) {
  return <small className={value.length > max ? 'char-count over' : 'char-count'}>{value.length}/{max}</small>
}

/** Describe a sticker and the local AI picks a design, a palette, a name and lore (no image generation). */
function AiDesigner({ id, role, questTitle, stopName, accessToken, hasColors, onDesign, onResetColors }: { id: string; role: 'reward' | 'stop'; questTitle: string; stopName?: string; accessToken?: string; hasColors: boolean; onDesign: (sticker: AiSticker) => void; onResetColors: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState(false)
  async function generate() {
    if (pending || prompt.trim().length < 3) return
    setPending(true); setError('')
    try {
      const result = await requestJSON<{ accepted: boolean; reject_reason: string | null; sticker: AiSticker | null }>('/api/stickers/design', { accessToken, signal: AbortSignal.timeout(180_000),
        body: { prompt: prompt.trim(), role, ...(questTitle.trim() ? { quest_title: questTitle.trim().slice(0, 60) } : {}), ...(stopName?.trim() ? { stop_name: stopName.trim().slice(0, 60) } : {}) } })
      if (!result.accepted || !result.sticker) setError(result.reject_reason ?? 'That idea can’t become a campus sticker. Try another.')
      else { onDesign(result.sticker); setMade(true) }
    } catch (cause) {
      setError(cause instanceof RequestError && cause.status === 429 ? 'You’ve reached the hourly AI design limit. Pick a design by hand for now.' : 'The AI designer isn’t available right now. Check that Ollama is running, or pick a design by hand.')
    } finally { setPending(false) }
  }
  return <div className="ai-designer">
    <label className="field-label" htmlFor={id}><span className="ai-chip">AI</span>Design with AI <span className="optional">describe your sticker</span></label>
    <div className="ai-designer-row">
      <input id={id} className="text-field" value={prompt} maxLength={300} placeholder={role === 'reward' ? 'A sleepy owl reading by lamplight' : 'A cozy bench under the jacarandas'} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void generate() } }}/>
      <button type="button" className="button primary" disabled={pending || prompt.trim().length < 3} onClick={() => void generate()}>{pending ? 'Designing…' : made ? 'Try again' : 'Generate'}</button>
    </div>
    {pending ? <p className="ai-status" role="status"><Pin size={28} mood="think"/>Pin is sketching your sticker. The first one can take a minute or two.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {made && !pending && !error ? <p className="field-hint">AI picked the design, colors{role === 'reward' ? ', name' : ''} and lore. Edit anything below.</p> : null}
    {hasColors ? <button type="button" className="text-button" onClick={onResetColors}>Use standard colors</button> : null}
  </div>
}

/** Post a challenge: a limited-time quest by a student or their org, with stops, names, lore and stickers. */
export function QuestCreator({ campusSpots, canCreate, names, accessToken, onCreate }: { campusSpots: Spot[]; canCreate: boolean; names: Partial<Record<Author, string>>; accessToken?: string; onCreate: (draft: QuestDraft) => string[] }) {
  const navigate = useNavigate()
  const nextKey = useRef(2)
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [author, setAuthor] = useState<Author>('student')
  const [days, setDays] = useState(3)
  const [stops, setStops] = useState<DraftStop[]>([{ key: 1, name: '', lore: '', art: 'star', place: { kind: 'campus', spot_id: '' } }])
  const [reward, setReward] = useState<CustomReward>({ name: '', art: 'star', rarity: 'rare', lore: '' })
  const [problems, setProblems] = useState<string[]>([])
  const problemBox = useRef<HTMLDivElement>(null)

  if (!canCreate) return <><Link to="/challenges" className="back-link"><Icon name="back" size={17}/>Back to challenges</Link><PageHeading title="Post a challenge">Students and student orgs can post limited-time quests with their own stops, lore and stickers.</PageHeading>
    <Card><EmptyState title="Coming with the server update" action={<Link className="button secondary" to="/challenges">Back to challenges</Link>}>Posting challenges is available in the local demo for now.</EmptyState></Card></>

  const update = (key: number, change: Partial<CustomStop>) => setStops(list => list.map(stop => stop.key === key ? { ...stop, ...change } : stop))
  const withoutColors = <T extends { colors?: Palette }>(item: T): T => { const next = { ...item }; delete next.colors; return next }
  function addStop() {
    if (stops.length >= limits.stops) return
    setStops(list => [...list, { key: nextKey.current++, name: '', lore: '', art: 'star', place: { kind: 'campus', spot_id: '' } }])
  }
  function chooseCampus(stop: DraftStop, spotId: string) {
    const previous = campusSpots.find(spot => stop.place.kind === 'campus' && spot.id === stop.place.spot_id)?.name
    const next = campusSpots.find(spot => spot.id === spotId)?.name ?? ''
    // Fill the name from the place unless the creator already wrote their own.
    update(stop.key, { place: { kind: 'campus', spot_id: spotId }, name: !stop.name.trim() || stop.name === previous ? next : stop.name })
  }
  function chooseAuthor(next: Author) {
    setAuthor(next)
    if (!durations[next].includes(days)) setDays(Math.max(...durations[next].filter(value => value <= days)))
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const result = onCreate({ title, blurb, author, days, stops: stops.map(({ key: _key, ...stop }) => stop), reward })
    setProblems(result)
    if (result.length) requestAnimationFrame(() => problemBox.current?.scrollIntoView({ block: 'center' }))
    else navigate('/challenges', { state: { tab: 'new' } })
  }
  const posters = (['student', 'org'] as const).filter(kind => names[kind])

  return <form className="quest-creator" onSubmit={submit} noValidate>
    <Link to="/challenges" className="back-link"><Icon name="back" size={17}/>Back to challenges</Link>
    <PageHeading title="Post a challenge">Pick the stops, tell their story, design the stickers, and set a deadline.</PageHeading>
    <div className="creator-pin"><Pin size={64}/><PinSays>Every stop gets its own sticker, and finishing them all earns your reward. One stop is enough to start!</PinSays></div>

    <Card className="creator-section"><h2>The challenge</h2>
      <span className="field-label">Post as</span>
      <div className="segmented" role="radiogroup" aria-label="Post as">{posters.map(kind => <button type="button" key={kind} role="radio" aria-checked={author === kind} className={author === kind ? 'active' : ''} onClick={() => chooseAuthor(kind)}>{kind === 'org' ? names.org : `You (${names.student})`}</button>)}</div>
      <p className="field-hint">{author === 'org' ? 'Org challenges show your org’s name and can run for up to 30 days.' : 'Student challenges show your display name and run for up to a week.'}</p>
      <label className="field-label" htmlFor="quest-title">Title <Counter value={title} max={limits.title}/></label>
      <input id="quest-title" className="text-field" value={title} maxLength={limits.title + 20} placeholder="Late-night study crawl" onChange={event => setTitle(event.target.value)}/>
      <label className="field-label" htmlFor="quest-blurb">Description <span className="optional">optional</span><Counter value={blurb} max={limits.blurb}/></label>
      <textarea id="quest-blurb" className="text-field" rows={2} value={blurb} maxLength={limits.blurb + 40} placeholder="What makes this route special?" onChange={event => setBlurb(event.target.value)}/>
      <label className="field-label" htmlFor="quest-days">Runs for</label>
      <select id="quest-days" className="text-field days-field" value={days} onChange={event => setDays(Number(event.target.value))}>{durations[author].map(value => <option key={value} value={value}>{value} {value === 1 ? 'day' : 'days'}</option>)}</select>
      <p className="field-hint">Starts as soon as you post. After it ends, nobody can earn its stickers.</p>
    </Card>

    <section className="creator-section stops-section" aria-label="Challenge stops">
      <div className="section-heading"><div><h2>Stops</h2><p>At least one. Visitors can complete them in any order.</p></div><span>{stops.length}/{limits.stops}</span></div>
      <ol className="stop-editors">{stops.map((stop, index) => <li key={stop.key} className="card stop-editor">
        <div className="stop-editor-top"><span className="stop-node">{index + 1}</span><div className="segmented" role="group" aria-label={`Stop ${index + 1} location type`}>
          <button type="button" className={stop.place.kind === 'campus' ? 'active' : ''} aria-pressed={stop.place.kind === 'campus'} onClick={() => update(stop.key, { place: { kind: 'campus', spot_id: '' } })}>Campus place</button>
          <button type="button" className={stop.place.kind === 'point' ? 'active' : ''} aria-pressed={stop.place.kind === 'point'} onClick={() => update(stop.key, { place: { kind: 'point', lat: Number.NaN, lng: Number.NaN } })}>Pin on map</button>
        </div>{stops.length > 1 ? <button type="button" className="icon-button stop-remove" aria-label={`Remove stop ${index + 1}`} onClick={() => setStops(list => list.filter(item => item.key !== stop.key))}><Icon name="close" size={18}/></button> : null}</div>
        {stop.place.kind === 'campus'
          ? <><label className="field-label" htmlFor={`stop-place-${stop.key}`}>Place</label><select id={`stop-place-${stop.key}`} className="text-field" value={stop.place.spot_id} onChange={event => chooseCampus(stop, event.target.value)}><option value="">Choose a campus place…</option>{campusSpots.map(spot => <option key={spot.id} value={spot.id}>{spot.name}</option>)}</select><p className="field-hint">Visitors earn that place’s own sticker here.</p></>
          : <><MapPicker label={`Map for stop ${index + 1}`} value={Number.isFinite(stop.place.lat) ? { lat: stop.place.lat, lng: stop.place.lng } : null} onChange={point => update(stop.key, { place: { kind: 'point', ...point } })}/>
            <span className="field-label">Stop sticker</span><ArtPicker label={`Sticker design for stop ${index + 1}`} value={stop.art} colors={stop.colors} onChange={art => update(stop.key, { art })}/>
            <AiDesigner id={`stop-ai-${stop.key}`} role="stop" questTitle={title} stopName={stop.name} accessToken={accessToken} hasColors={!!stop.colors}
              onDesign={sticker => setStops(list => list.map(item => item.key === stop.key ? { ...item, art: sticker.key, colors: normalizePalette(sticker.colors), name: item.name.trim() ? item.name : sticker.name.slice(0, limits.stopName), lore: item.lore.trim() ? item.lore : sticker.lore } : item))}
              onResetColors={() => setStops(list => list.map(item => item.key === stop.key ? withoutColors(item) : item))}/></>}
        <label className="field-label" htmlFor={`stop-name-${stop.key}`}>Stop name <Counter value={stop.name} max={limits.stopName}/></label>
        <input id={`stop-name-${stop.key}`} className="text-field" value={stop.name} maxLength={limits.stopName + 20} placeholder={stop.place.kind === 'campus' ? 'Defaults to the place name' : 'The fountain bench'} onChange={event => update(stop.key, { name: event.target.value })}/>
        <label className="field-label" htmlFor={`stop-lore-${stop.key}`}>Lore <span className="optional">optional</span><Counter value={stop.lore} max={limits.lore}/></label>
        <textarea id={`stop-lore-${stop.key}`} className="text-field" rows={2} value={stop.lore} maxLength={limits.lore + 40} placeholder="A story, a tradition, or a clue for this stop." onChange={event => update(stop.key, { lore: event.target.value })}/>
      </li>)}</ol>
      <button type="button" className="button secondary add-stop" disabled={stops.length >= limits.stops} onClick={addStop}><Icon name="spark" size={16}/>Add a stop</button>
    </section>

    <Card className="creator-section reward-section"><h2>Reward sticker</h2><p className="section-sub">Earned for finishing every stop before the challenge ends. Quest parties can still upgrade it.</p>
      <div className="reward-designer">
        <div className="reward-preview"><StickerImage stickerKey={reward.art} name={reward.name || 'Your reward'} variant="special" size={140} rarity={reward.rarity} colors={reward.colors}/><strong>{reward.name.trim() || 'Your reward'}</strong><RarityBadge rarity={reward.rarity}/></div>
        <div className="reward-fields">
          <AiDesigner id="reward-ai" role="reward" questTitle={title} accessToken={accessToken} hasColors={!!reward.colors}
            onDesign={sticker => setReward(value => ({ ...value, art: sticker.key, colors: normalizePalette(sticker.colors), name: sticker.name.slice(0, limits.stickerName), lore: sticker.lore.slice(0, limits.lore) }))}
            onResetColors={() => setReward(value => withoutColors(value))}/>
          <label className="field-label" htmlFor="reward-name">Sticker name <Counter value={reward.name} max={limits.stickerName}/></label>
          <input id="reward-name" className="text-field" value={reward.name} maxLength={limits.stickerName + 20} placeholder="Night Owl" onChange={event => setReward(value => ({ ...value, name: event.target.value }))}/>
          <span className="field-label">Design</span><ArtPicker label="Reward sticker design" value={reward.art} rarity={reward.rarity} colors={reward.colors} onChange={art => setReward(value => ({ ...value, art }))}/>
          <span className="field-label">Rarity</span><div className="segmented" role="radiogroup" aria-label="Reward rarity">{creatorRarities.map(rarity => <button type="button" key={rarity} role="radio" aria-checked={reward.rarity === rarity} className={reward.rarity === rarity ? 'active' : ''} onClick={() => setReward(value => ({ ...value, rarity }))}>{rarityLabels[rarity]}</button>)}</div>
          <p className="field-hint">Legendary and Exclusive are reserved for official campus quests.</p>
          <label className="field-label" htmlFor="reward-lore">Lore <span className="optional">optional</span><Counter value={reward.lore} max={limits.lore}/></label>
          <textarea id="reward-lore" className="text-field" rows={2} value={reward.lore} maxLength={limits.lore + 40} placeholder="What does this sticker remember?" onChange={event => setReward(value => ({ ...value, lore: event.target.value }))}/>
        </div>
      </div>
    </Card>

    {problems.length ? <div className="creator-problems" ref={problemBox} role="alert"><strong>A few things to fix</strong><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul></div> : null}
    <div className="creator-actions"><Link className="button secondary" to="/challenges">Cancel</Link><button className="button primary">Post challenge<Icon name="arrow" size={16}/></button></div>
    <p className="quiet-note">In the demo, challenges go live right away and stay in this browser. Once accounts are live, a quick review will come first.</p>
  </form>
}
