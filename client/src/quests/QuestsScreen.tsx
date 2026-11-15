import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, EmptyState, PageHeading } from '../components/Card'
import { Dialog } from '../components/Dialog'
import { StickerImage } from '../components/StickerImage'
import { Icon } from '../components/Icon'
import { Pin, PixelIcon } from '../components/Pixel'
import { questProgress, questStatus } from '../components/collection'
import type { AcceptedQuests, QuestStatus } from '../components/collection'
import type { Catch, Friend, Quest, Spot } from '../components/types'
import { AvailabilityNote, RarityBadge, StickerDetails } from '../components/StickerMeta'
import { stickerFor } from '../components/catalogue'
import { availability, rarityLabels } from '../components/stickers'
import type { Rarity } from '../components/stickers'
import { describeOdds, joinedFriends, maxPartySize } from '../components/party'
import type { QuestParties, QuestParty, RewardRoll, RewardRolls } from '../components/party'
import { challengeOpen, isChallengeId, stopDetails, timeLeft } from '../components/customQuests'
import type { CustomQuest } from '../components/customQuests'

// Party slots on a quest card: joined friends, pending invites, then empty seats.
function PartyPanel({ status, party, friends, base, available, onInvite }: { status: QuestStatus; party: QuestParty; friends: Friend[]; base?: Rarity; available: boolean; onInvite: () => void }) {
  const members = Object.entries(party)
  const joined = joinedFriends(party).length
  return <div className="party-panel">
    <div className="party-slots" role="img" aria-label={`Quest party: ${joined} of ${maxPartySize} friends joined${members.length > joined ? `, ${members.length - joined} invited` : ''}`}>
      {Array.from({ length: maxPartySize }, (_, index) => {
        const [id, state] = members[index] ?? []
        const name = friends.find(person => person.user_id === id)?.display_name ?? '?'
        return id ? <span key={index} className={`party-slot ${state}`}>{name.slice(0, 1)}</span> : <span key={index} className="party-slot empty">+</span>
      })}
    </div>
    <div className="party-copy"><strong>{status === 'new' ? 'Better with friends' : joined ? `Party of ${joined + 1}` : 'Quest party'}</strong><small>{status === 'new' ? `Accept, then invite up to ${maxPartySize} friends for a rarer reward.` : describeOdds(joined, base)}</small></div>
    {status === 'active' ? <button className="button secondary party-invite" disabled={!available} onClick={onInvite}>{available ? 'Invite' : 'Soon'}</button> : null}
  </div>
}
function PartyResult({ roll }: { roll: RewardRoll }) {
  const text = roll.bumped ? `Upgraded ${rarityLabels[roll.base]} → ${rarityLabels[roll.rarity]}` : roll.capped ? `Already ${rarityLabels[roll.rarity]}, the top tier` : 'No rarity bump this time'
  return <div className="party-result"><span className="party-result-size">{roll.partySize ? `Party of ${roll.partySize + 1}` : 'Solo'}</span><span>{roll.partySize ? text : 'Invite friends next time for a rarer reward'}</span>{roll.copies === 2 ? <span className="copies-badge">2×</span> : null}</div>
}
const oddsRows = [1, 2, 3].map(size => ({ size, text: describeOdds(size) }))

const tabs: { value: QuestStatus; label: string }[] = [{ value: 'new', label: 'New' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Completed' }]
type EmptyCopy = Record<QuestStatus, { title: string; body: string; action?: QuestStatus; actionLabel?: string }>
const challengeCopy: EmptyCopy = {
  new: { title: 'No open challenges right now', body: 'Post one yourself, or check back soon for new ones from students and orgs.', action: 'active', actionLabel: 'See active challenges' },
  active: { title: 'No active challenges yet', body: 'Accept a challenge to start tracking it. They only run for a limited time.', action: 'new', actionLabel: 'Browse challenges' },
  complete: { title: 'No challenges completed yet', body: 'Finish every stop before a challenge ends to earn its sticker.', action: 'active', actionLabel: 'See active challenges' },
}
const emptyCopy: EmptyCopy = {
  new: { title: 'You’ve taken on every quest', body: 'Check your active quests to see what’s left to discover.', action: 'active', actionLabel: 'See active quests' },
  active: { title: 'No active quests yet', body: 'Accept a new quest to start tracking your progress.', action: 'new', actionLabel: 'Browse new quests' },
  complete: { title: 'Nothing completed yet', body: 'Finish every place in an active quest to earn its rare sticker.', action: 'active', actionLabel: 'See active quests' },
}
// Horizontal swipe distance (px) needed to change tabs; must also be clearly more sideways than vertical.
const swipeThreshold = 60

type PartyProps = { friends: Friend[]; parties: QuestParties; rolls: RewardRolls; partiesAvailable: boolean; onInvite: (questId: string, friendId: string) => void; onRemove: (questId: string, friendId: string) => void }
type CreatorProps = { customQuests: CustomQuest[]; canCreate: boolean; onDeleteQuest: (questId: string) => void; variant?: 'quests' | 'challenges' }
type QuestsProps = { quests: Quest[]; spots: Spot[]; catches: Catch[]; accepted: AcceptedQuests; onAccept: (id: string) => void; onSpot: (spot: Spot) => void } & PartyProps & CreatorProps
/** Official quests, or (variant "challenges") the limited-time quests students and orgs post. */
export function QuestsScreen({ variant = 'quests', quests: allQuests, spots, catches, accepted, onAccept, onSpot, friends, parties, rolls, partiesAvailable, onInvite, onRemove, customQuests, canCreate, onDeleteQuest }: QuestsProps) {
  const challenges = variant === 'challenges'
  const quests = allQuests.filter(quest => isChallengeId(quest.id) === challenges)
  const createdBy = (quest: Quest) => customQuests.find(item => `cq-${item.id}` === quest.id)
  const requestedTab = (useLocation().state as { tab?: QuestStatus } | null)?.tab
  const statusOf = (quest: Quest) => questStatus(quest, catches, accepted)
  const [filter, setFilter] = useState<QuestStatus>(() => requestedTab ?? (quests.some(quest => statusOf(quest) === 'active') ? 'active' : 'new'))
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [selected, setSelected] = useState<Quest | null>(null)
  const [inviting, setInviting] = useState<Quest | null>(null)
  const invitingParty = inviting ? parties[inviting.id] ?? {} : {}
  const invitingJoined = joinedFriends(invitingParty).length
  const partyFull = Object.keys(invitingParty).length >= maxPartySize
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const selectedCustom = selected ? createdBy(selected) : undefined
  const selectedDetails = selectedCustom ? stopDetails(selectedCustom) : {}
  const completed = quests.filter(quest => statusOf(quest) === 'complete').length
  const visible = quests.filter(quest => statusOf(quest) === filter)
  const empty = (challenges ? challengeCopy : emptyCopy)[filter]

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
    {challenges
      ? <><PageHeading title="Challenges" aside={<span className="count-badge"><Icon name="quest"/>{completed} of {quests.length} complete</span>}>Limited-time quests made by students and student orgs. Finish them before the clock runs out.</PageHeading>
        <div className="quest-intro"><div className="quest-intro-icon"><PixelIcon name="star" size={40}/></div><div><h2>Made by Trojans, for Trojans.</h2><p>Students and orgs post their own routes, stories and stickers. Each challenge only runs for a few days.</p></div><Pin size={80} mood="cheer"/></div></>
      : <><PageHeading title="Take the scenic route." aside={<span className="count-badge"><Icon name="quest"/>{completed} of {quests.length} complete</span>}>A few places, a little purpose, and a rare sticker at the end.</PageHeading>
        <div className="quest-intro"><div className="quest-intro-icon"><PixelIcon name="trophy" size={40}/></div><div><h2>Small adventures. Good discoveries.</h2><p>Accept a quest, then visit each place in any order. Your collection keeps track.</p></div><StickerImage stickerKey="star" name="Rare reward" variant="special" size={96}/></div></>}
    <div className="segmented page-segments" role="tablist" aria-label={challenges ? 'Challenge filter' : 'Quest filter'}>{tabs.map(tab => <button key={tab.value} role="tab" aria-selected={filter === tab.value} className={filter === tab.value ? 'active' : ''} onClick={() => showTab(tab.value)}>{tab.label}</button>)}</div>
    <div key={filter} className={direction ? `quest-panel from-${direction}` : 'quest-panel'} role="tabpanel">
      {challenges && filter === 'new' ? canCreate ? <Link className="create-quest-card" to="/challenges/new"><PixelIcon name="star" size={40}/><span><strong>Post a challenge</strong><small>As yourself or your student org: pick stops, write the lore, design the stickers.</small></span><Icon name="arrow" size={18}/></Link> : <div className="create-quest-card is-locked"><PixelIcon name="star" size={40} gray/><span><strong>Post a challenge</strong><small>Posting challenges is coming with the server update.</small></span><Icon name="lock" size={16}/></div> : null}
      {visible.length ? <div className="quest-grid">{visible.map(quest => {
        const progress = questProgress(quest, catches), status = statusOf(quest), earned = catches.some(c => c.source === 'quest' && c.source_id === quest.id)
        const tone = quests.indexOf(quest) % 4
        // Exclusive rewards can only be earned inside their window; outside it the quest can't be accepted or finished.
        const custom = createdBy(quest), ended = !!custom && !challengeOpen(custom)
        const reward = stickerFor(quest.reward_sticker_key), rewardWindow = ended ? 'ended' : availability(reward), closed = rewardWindow !== 'available' && !earned
        const tag = status === 'complete' ? <><Icon name="check" size={13}/>Complete</> : closed ? (rewardWindow === 'ended' ? 'Ended' : 'Coming soon') : status === 'active' ? 'Active' : 'New'
        const roll = earned ? rolls[quest.id] : undefined
        return <Card className={`quest-card quest-tone-${tone}${closed ? ' is-closed' : ''}`} key={quest.id}>
          <div className="quest-card-top"><span className={`state-tag ${closed ? 'ended' : status}`}>{tag}</span>{reward ? <RarityBadge rarity={roll?.rarity ?? reward.rarity} suffix="reward"/> : <span className="rare-tag"><Icon name="spark" size={13}/>Reward</span>}</div>
          <div className="quest-card-body"><div><h2>{quest.title}</h2>{custom ? <span className="challenge-meta"><span className={`org-byline ${custom.author}`}>{custom.author === 'org' ? 'Org' : 'Student'} · {custom.by}</span>{!earned ? <span className={ended ? 'time-left ended' : 'time-left'}>{timeLeft(custom)}</span> : null}</span> : null}<p>{quest.blurb}</p>{status !== 'complete' ? <AvailabilityNote sticker={reward}/> : null}</div><span className="quest-reward-art"><StickerImage stickerKey={quest.reward_sticker_key} name={quest.title} variant="special" locked={!earned} size={96} rarity={roll?.rarity}/>{roll?.copies === 2 ? <span className="copies-badge">2×</span> : null}</span></div>
          {status === 'new'
            ? <div className="quest-progress-label"><span>{progress.total} {progress.total === 1 ? 'place' : 'places'} to discover</span><span>Accept to start</span></div>
            : <><div className="quest-progress-label"><span>{progress.visited} of {progress.total} places</span><span>{Math.round(progress.visited / Math.max(1, progress.total) * 100)}%</span></div><progress value={progress.visited} max={Math.max(1, progress.total)} aria-label={`${quest.title} progress`}/></>}
          <ol className="quest-path" aria-hidden="true">{quest.spot_ids.map((id, index) => { const done = catches.some(c => c.source === 'spot' && c.source_id === id); return <li key={id} className={done ? 'done' : ''}>{done ? <PixelIcon name="check" size={20}/> : index + 1}</li> })}<li className={earned ? 'reward done' : 'reward'}><PixelIcon name="chest" size={22} gray={!earned}/></li></ol>
          {roll ? <PartyResult roll={roll}/> : status !== 'complete' && !closed ? <PartyPanel status={status} party={parties[quest.id] ?? {}} friends={friends} base={reward?.rarity} available={partiesAvailable} onInvite={() => setInviting(quest)}/> : null}
          <div className="quest-card-bottom">
            {status === 'new'
              ? <button className="button primary quest-accept" disabled={closed} onClick={() => onAccept(quest.id)}>{closed ? <><Icon name="lock" size={14}/>{ended ? 'Challenge ended' : rewardWindow === 'ended' ? 'Event ended' : 'Coming soon'}</> : <><Icon name="check" size={15}/>Accept</>}</button>
              : <span>{earned ? `${reward?.name ?? 'Reward'}${roll?.copies === 2 ? ' ×2' : ''} added to your collection` : status === 'complete' ? 'Reward pending sync' : closed ? `This ${ended ? 'challenge' : 'event'} has ended` : custom ? 'Beat the clock' : 'Go at your own pace'}</span>}
            <button className="text-button" onClick={() => setSelected(quest)}>View places<Icon name="arrow" size={17}/></button>
          </div>
        </Card>
      })}</div> : <Card><EmptyState title={quests.length ? empty.title : 'The next adventure is on its way'} action={quests.length && empty.action ? <button className="button secondary" onClick={() => showTab(empty.action!)}>{empty.actionLabel}</button> : undefined}>{quests.length ? empty.body : 'Campus quests will appear here once the collection is ready.'}</EmptyState></Card>}
    </div>
    <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Quest places'}>{selected ? <><p className="dialog-description">{selected.blurb}</p><ol className="quest-stops">{selected.spot_ids.map((id, index) => { const spot = spots.find(item => item.id === id), visited = catches.some(c => c.source === 'spot' && c.source_id === id); return <li key={id}><span className={visited ? 'stop-number visited' : 'stop-number'}>{visited ? <Icon name="check" size={16}/> : index + 1}</span>{spot ? <button onClick={() => { setSelected(null); onSpot(spot) }}><span><strong>{selectedDetails[id]?.name ?? spot.name}</strong>{selectedDetails[id]?.lore ? <em className="stop-lore">{selectedDetails[id].lore}</em> : null}<small>{visited ? 'Already in your collection' : 'Still to discover'}</small></span><Icon name="arrow" size={17}/></button> : <span>Place details aren’t available yet.</span>}</li> })}</ol><div className="quest-reward-note"><StickerImage stickerKey={selected.reward_sticker_key} name={selected.title} variant="special" size={70}/><div><strong>{stickerFor(selected.reward_sticker_key)?.name ?? 'A little thank-you'}</strong><StickerDetails stickerKey={selected.reward_sticker_key}/><p>{statusOf(selected) === 'new' ? 'Accept this quest, then complete every stop to add this reward to your collection.' : 'Complete every stop to add this reward to your collection.'}</p></div></div>{statusOf(selected) === 'new' ? <button className="button primary full-width" disabled={availability(stickerFor(selected.reward_sticker_key)) !== 'available'} onClick={() => { onAccept(selected.id); setSelected(null) }}><Icon name="check" size={15}/>{availability(stickerFor(selected.reward_sticker_key)) === 'available' ? 'Accept quest' : 'Not available'}</button> : null}{selectedCustom ? <button className="text-button delete-quest" onClick={() => { if (window.confirm(`Delete “${selected.title}”? Its stickers will be removed from this demo.`)) { onDeleteQuest(selected.id); setSelected(null) } }}><Icon name="close" size={15}/>Delete this challenge</button> : null}</> : null}</Dialog>
    <Dialog open={!!inviting} onClose={() => setInviting(null)} title={inviting ? `Invite friends · ${inviting.title}` : 'Invite friends'}>{inviting ? <div className="invite-dialog">
      <p className="dialog-description">Invite up to {maxPartySize} friends. They count once they accept, and everyone who finishes the quest gets their own reward roll.</p>
      <ol className="party-odds">{oddsRows.map(row => <li key={row.size} className={row.size === invitingJoined ? 'current' : row.size < invitingJoined ? 'reached' : ''}><span className="party-odds-size">{row.size} {row.size === 1 ? 'friend' : 'friends'}</span><span>{row.text}</span></li>)}</ol>
      <p className="party-odds-note">{invitingJoined ? `Right now: ${describeOdds(invitingJoined, stickerFor(inviting.reward_sticker_key)?.rarity)}.` : describeOdds(0)} Rarity tops out at Legendary.</p>
      {friends.length ? <ul className="invite-list">{friends.map(person => {
        const state = invitingParty[person.user_id]
        return <li key={person.user_id}><span className={`party-slot ${state ?? 'empty'}`} aria-hidden="true">{person.display_name.slice(0, 1)}</span><span className="invite-name"><strong>{person.display_name}</strong><small>{state === 'joined' ? 'In your party' : state === 'invited' ? 'Invite sent, waiting…' : 'Not invited yet'}</small></span>
          {state ? <button className="text-button" onClick={() => onRemove(inviting.id, person.user_id)}>{state === 'joined' ? 'Remove' : 'Cancel'}</button> : <button className="button secondary" disabled={partyFull} onClick={() => onInvite(inviting.id, person.user_id)}>Invite</button>}</li>
      })}</ul> : <EmptyState title="Add a friend first" action={<Link className="button secondary" to="/friends" onClick={() => setInviting(null)}>Find friends</Link>}>Trade friend codes on the Friends tab, then invite them here.</EmptyState>}
      {partyFull ? <p className="quiet-note">Your party is full. Remove someone to invite a different friend.</p> : null}
    </div> : null}</Dialog>
  </div>
}
