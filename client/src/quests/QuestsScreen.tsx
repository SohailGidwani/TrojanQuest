import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { Card, EmptyState, PageHeading } from '../components/Card'
import { Dialog } from '../components/Dialog'
import { StickerImage } from '../components/StickerImage'
import { Icon } from '../components/Icon'
import { questProgress, questStatus } from '../components/collection'
import type { AcceptedQuests, QuestStatus } from '../components/collection'
import type { Catch, Quest, Spot } from '../components/types'
import { AvailabilityNote, RarityBadge, StickerDetails } from '../components/StickerMeta'
import { stickerFor } from '../components/catalogue'
import { availability } from '../components/stickers'

const tabs: { value: QuestStatus; label: string }[] = [{ value: 'new', label: 'New' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Completed' }]
const emptyCopy: Record<QuestStatus, { title: string; body: string; action?: QuestStatus; actionLabel?: string }> = {
  new: { title: 'You’ve taken on every quest', body: 'Check your active quests to see what’s left to discover.', action: 'active', actionLabel: 'See active quests' },
  active: { title: 'No active quests yet', body: 'Accept a new quest to start tracking your progress.', action: 'new', actionLabel: 'Browse new quests' },
  complete: { title: 'Nothing completed yet', body: 'Finish every place in an active quest to earn its rare sticker.', action: 'active', actionLabel: 'See active quests' },
}
// Horizontal swipe distance (px) needed to change tabs; must also be clearly more sideways than vertical.
const swipeThreshold = 60

type QuestsProps = { quests: Quest[]; spots: Spot[]; catches: Catch[]; accepted: AcceptedQuests; onAccept: (id: string) => void; onSpot: (spot: Spot) => void }
export function QuestsScreen({ quests, spots, catches, accepted, onAccept, onSpot }: QuestsProps) {
  const statusOf = (quest: Quest) => questStatus(quest, catches, accepted)
  const [filter, setFilter] = useState<QuestStatus>(() => quests.some(quest => statusOf(quest) === 'active') ? 'active' : 'new')
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [selected, setSelected] = useState<Quest | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const completed = quests.filter(quest => statusOf(quest) === 'complete').length
  const visible = quests.filter(quest => statusOf(quest) === filter)
  const empty = emptyCopy[filter]

  function showTab(next: QuestStatus) {
    const from = tabs.findIndex(tab => tab.value === filter), to = tabs.findIndex(tab => tab.value === next)
    if (from === to) return
    setDirection(to > from ? 'left' : 'right')
    setFilter(next)
  }
  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    touchStart.current = event.touches.length === 1 && !selected ? { x: touch.clientX, y: touch.clientY } : null
  }
  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const touch = event.changedTouches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.abs(dx) < swipeThreshold || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const index = tabs.findIndex(tab => tab.value === filter) + (dx < 0 ? 1 : -1)
    if (index >= 0 && index < tabs.length) showTab(tabs[index].value)
  }

  return <div className="quests-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null }}>
    <PageHeading title="Take the scenic route." aside={<span className="count-badge"><Icon name="quest"/>{completed} of {quests.length} complete</span>}>A few places, a little purpose, and a rare sticker at the end.</PageHeading>
    <div className="quest-intro"><div className="quest-intro-icon"><Icon name="quest" size={35}/></div><div><h2>Small adventures. Good discoveries.</h2><p>Accept a quest, then visit each place in any order. Your collection keeps track.</p></div><StickerImage stickerKey="star" name="Rare reward" variant="special" size={96}/></div>
    <div className="segmented page-segments" role="tablist" aria-label="Quest filter">{tabs.map(tab => <button key={tab.value} role="tab" aria-selected={filter === tab.value} className={filter === tab.value ? 'active' : ''} onClick={() => showTab(tab.value)}>{tab.label}</button>)}</div>
    <div key={filter} className={direction ? `quest-panel from-${direction}` : 'quest-panel'} role="tabpanel">
      {visible.length ? <div className="quest-grid">{visible.map(quest => {
        const progress = questProgress(quest, catches), status = statusOf(quest), earned = catches.some(c => c.source === 'quest' && c.source_id === quest.id)
        const tone = quests.indexOf(quest) % 4
        // Exclusive rewards can only be earned inside their window; outside it the quest can't be accepted or finished.
        const reward = stickerFor(quest.reward_sticker_key), rewardWindow = availability(reward), closed = rewardWindow !== 'available' && !earned
        const tag = status === 'complete' ? <><Icon name="check" size={13}/>Complete</> : closed ? (rewardWindow === 'ended' ? 'Ended' : 'Coming soon') : status === 'active' ? 'Active' : 'New'
        return <Card className={`quest-card quest-tone-${tone}${closed ? ' is-closed' : ''}`} key={quest.id}>
          <div className="quest-card-top"><span className={`state-tag ${closed ? 'ended' : status}`}>{tag}</span>{reward ? <RarityBadge rarity={reward.rarity} suffix="reward"/> : <span className="rare-tag"><Icon name="spark" size={13}/>Reward</span>}</div>
          <div className="quest-card-body"><div><h2>{quest.title}</h2><p>{quest.blurb}</p>{status !== 'complete' ? <AvailabilityNote sticker={reward}/> : null}</div><StickerImage stickerKey={quest.reward_sticker_key} name={quest.title} variant="special" locked={!earned} size={96}/></div>
          {status === 'new'
            ? <div className="quest-progress-label"><span>{progress.total} {progress.total === 1 ? 'place' : 'places'} to discover</span><span>Accept to start</span></div>
            : <><div className="quest-progress-label"><span>{progress.visited} of {progress.total} places</span><span>{Math.round(progress.visited / Math.max(1, progress.total) * 100)}%</span></div><progress value={progress.visited} max={Math.max(1, progress.total)} aria-label={`${quest.title} progress`}/></>}
          <div className="quest-card-bottom">
            {status === 'new'
              ? <button className="button primary quest-accept" disabled={closed} onClick={() => onAccept(quest.id)}>{closed ? <><Icon name="lock" size={14}/>{rewardWindow === 'ended' ? 'Event ended' : 'Coming soon'}</> : <><Icon name="check" size={15}/>Accept</>}</button>
              : <span>{earned ? `${reward?.name ?? 'Reward'} added to your collection` : status === 'complete' ? 'Reward pending sync' : closed ? 'This event has ended' : 'Go at your own pace'}</span>}
            <button className="text-button" onClick={() => setSelected(quest)}>View places<Icon name="arrow" size={17}/></button>
          </div>
        </Card>
      })}</div> : <Card><EmptyState title={quests.length ? empty.title : 'The next adventure is on its way'} action={quests.length && empty.action ? <button className="button secondary" onClick={() => showTab(empty.action!)}>{empty.actionLabel}</button> : undefined}>{quests.length ? empty.body : 'Campus quests will appear here once the collection is ready.'}</EmptyState></Card>}
    </div>
    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Quest places'}>{selected ? <><p className="dialog-description">{selected.blurb}</p><ol className="quest-stops">{selected.spot_ids.map((id, index) => { const spot = spots.find(item => item.id === id), visited = catches.some(c => c.source === 'spot' && c.source_id === id); return <li key={id}><span className={visited ? 'stop-number visited' : 'stop-number'}>{visited ? <Icon name="check" size={16}/> : index + 1}</span>{spot ? <button onClick={() => { setSelected(null); onSpot(spot) }}><span><strong>{spot.name}</strong><small>{visited ? 'Already in your collection' : 'Still to discover'}</small></span><Icon name="arrow" size={17}/></button> : <span>Place details aren’t available yet.</span>}</li> })}</ol><div className="quest-reward-note"><StickerImage stickerKey={selected.reward_sticker_key} name={selected.title} variant="special" size={70}/><div><strong>{stickerFor(selected.reward_sticker_key)?.name ?? 'A little thank-you'}</strong><StickerDetails stickerKey={selected.reward_sticker_key}/><p>{statusOf(selected) === 'new' ? 'Accept this quest, then complete every stop to add this reward to your collection.' : 'Complete every stop to add this reward to your collection.'}</p></div></div>{statusOf(selected) === 'new' ? <button className="button primary full-width" disabled={availability(stickerFor(selected.reward_sticker_key)) !== 'available'} onClick={() => { onAccept(selected.id); setSelected(null) }}><Icon name="check" size={15}/>{availability(stickerFor(selected.reward_sticker_key)) === 'available' ? 'Accept quest' : 'Not available'}</button> : null}</> : null}</Dialog>
  </div>
}
