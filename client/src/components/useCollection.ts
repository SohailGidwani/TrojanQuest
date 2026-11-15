import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Catch, DemoState, Friend, Profile, Quest, Spot } from './types'
import { addDemoVisit, awardCompletedQuests, parseAcceptedQuests, parseDemoState } from './collection'
import type { AcceptedQuests } from './collection'
import { registerStickers, stickerCatalogue } from './catalogue'
import { challengeOpen, createQuest, expandQuest, isChallengeId, parseCustomQuests, validateDraft } from './customQuests'
import type { CustomQuest, QuestDraft } from './customQuests'
import { canEarn, rarityLabels } from './stickers'
import { joinedFriends, maxPartySize, parseParties, parseRolls, rollReward } from './party'
import type { RewardRoll, RewardRolls } from './party'
import { demoFriendBooks, demoFriends, demoQuests, demoSpots, initialDemoState } from './mock'
import { requestJSON, RequestError } from './api'
import { collectLiveSpot, loadLiveCollection } from '../map/liveCollection'
import type { SessionState } from '../map/session'
import type { Challenge, QuestAcceptanceResult, QuestParty as ServerParty, Profile as ServerProfile, StickerDefinition } from '../../../shared/types'
import { challengePlayable, completeReadyQuests, emptyQuestState, expandLiveChallenges, loadLiveQuestState, partyRecord, savedRewardRolls } from '../map/liveQuests'
import type { LiveQuestState } from '../map/liveQuests'

const storageKey = 'trojanquest:collection-demo:v2'
// Legacy browser state is used only for the explicit demo; live state always comes from the server.
const acceptedKey = 'trojanquest:accepted-quests:v1'
function readAccepted(): Record<string, AcceptedQuests> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(acceptedKey) ?? '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).map(([scope, value]) => [scope, parseAcceptedQuests(value)]))
  } catch { return {} }
}
// Browser-local party simulation is retained only for the explicit demo.
const partiesKey = 'trojanquest:quest-parties:v1'
const rollsKey = 'trojanquest:quest-rolls:v1'
function readScoped<T>(key: string, parse: (value: unknown) => T): Record<string, T> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).map(([scope, value]) => [scope, parse(value)]))
  } catch { return {} }
}
function rewardMessage(title: string, roll: RewardRoll) {
  const tier = rarityLabels[roll.rarity]
  if (!roll.partySize) return `Quest complete! “${title}” reward added.`
  if (roll.bumped && roll.copies === 2) return `Party bonus! “${title}” upgraded to ${tier}, and you got 2 copies!`
  if (roll.bumped) return `Party bonus! “${title}” upgraded to ${tier}.`
  if (roll.copies === 2) return `Party bonus! 2× “${title}” stickers${roll.capped ? ` (already ${tier}, the top tier)` : ''}.`
  return `Quest complete! “${title}” reward added. The party bonus didn’t land this time.`
}
// Demo challenges remain local; live submissions use the authenticated moderation workflow.
const customQuestsKey = 'trojanquest:custom-quests:v1'
/** The demo user also manages a sample student org, so both kinds of challenge can be tried. */
export const demoOrg = { name: 'Demo Student Org' }
function readCustomQuests() { try { return parseCustomQuests(JSON.parse(localStorage.getItem(customQuestsKey) ?? '[]')) } catch { return [] } }
function readDemo() { try { return parseDemoState(localStorage.getItem(storageKey)) ?? initialDemoState } catch { return initialDemoState } }
interface RemoteData { spots: Spot[]; catches: Catch[]; quests: Quest[]; friends: Friend[] }
const empty: RemoteData = { spots: [], catches: [], quests: [], friends: [] }
export function useCollection(accessToken?: string, profile?: Profile, session: SessionState = { ready: true }) {
  const [mode, setMode] = useState<'loading' | 'demo' | 'live' | 'offline' | 'signed-out'>('loading')
  const [demo, setDemo] = useState<DemoState>(readDemo)
  const [remote, setRemote] = useState<RemoteData>(empty)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)
  const [revision, setRevision] = useState(0)
  const [acceptedByScope, setAcceptedByScope] = useState(readAccepted)
  const [partiesByScope, setPartiesByScope] = useState(() => readScoped(partiesKey, parseParties))
  const [rollsByScope, setRollsByScope] = useState(() => readScoped(rollsKey, parseRolls))
  const [customQuests, setCustomQuests] = useState<CustomQuest[]>(readCustomQuests)
  const [live, setLive] = useState<LiveQuestState>(emptyQuestState)
  const liveRef = useRef(live)
  liveRef.current = live
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [clock, setClock] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { try { localStorage.setItem(customQuestsKey, JSON.stringify(customQuests)) } catch { setStorageWarning(true) } }, [customQuests])
  // Created quests contribute a quest, pinned stops and stickers; register the stickers before anything renders them.
  const created = useMemo(() => {
    const expanded = customQuests.map(expandQuest)
    registerStickers(expanded.flatMap(item => item.stickers))
    return { quests: expanded.map(item => item.quest), spots: expanded.flatMap(item => item.spots) }
  }, [customQuests])
  const joinTimers = useRef<number[]>([])
  useEffect(() => () => joinTimers.current.forEach(timer => window.clearTimeout(timer)), [])
  useEffect(() => {
    try { localStorage.setItem(partiesKey, JSON.stringify(partiesByScope)); localStorage.setItem(rollsKey, JSON.stringify(rollsByScope)) } catch { setStorageWarning(true) }
  }, [partiesByScope, rollsByScope])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const health = await requestJSON<{ mode: string }>('/api/health', { signal: controller.signal })
        if (controller.signal.aborted) return
        if (health.mode === 'local-demo') { setMode('demo'); setErrors([]); return }
        if (health.mode !== 'authenticated') throw new Error('Unknown server mode.')
        if (!session.ready) { setMode('loading'); return }
        if (!accessToken) { setRemote(empty); setMode('signed-out'); setErrors(session.failed ? ['We couldn’t restore a campus session. Check the public Supabase configuration, or try again.'] : []); return }
        const result = await loadLiveCollection(accessToken, controller.signal)
        const [state, stickers] = await Promise.all([
          loadLiveQuestState(accessToken, controller.signal),
          requestJSON<StickerDefinition[]>('/api/stickers', { accessToken, signal: controller.signal }),
        ])
        if (controller.signal.aborted) return
        registerStickers(stickers)
        setLive(state); liveRef.current = state
        const active = expandLiveChallenges(state.challenges)
        // Also reconcile a saved final visit after a reload or an interrupted response.
        let catches = result.data.catches
        try {
          const completed = await completeReadyQuests([...result.data.quests, ...active.quests], state.accepted, catches, accessToken)
          if (controller.signal.aborted) return
          catches = completed.catches
        } catch { result.errors.push('Your visits are saved, but a quest reward could not be synced. Retry loading your collection.') }
        setRemote({ ...result.data, catches }); setErrors(result.errors); setMode('live')
      } catch (error) {
        if (!controller.signal.aborted) {
          setRemote(empty)
          const denied = error instanceof RequestError && [401, 403].includes(error.status)
          setMode(denied ? 'signed-out' : 'offline')
          setErrors([denied ? 'A verified @usc.edu session is required. Your session may have expired.' : 'We couldn’t load your campus places and saved stickers. Try again before continuing.'])
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [revision, accessToken, session.ready, session.failed])
  function saveDemo(next: DemoState) {
    setDemo(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageWarning(false) } catch { setStorageWarning(true) }
  }
  function resetDemo() {
    if (mode !== 'demo') return
    const { demo: _, ...withoutDemo } = acceptedByScope
    try {
      for (const key of ['trojanquest:collection-demo:v1', storageKey, 'trojanquest:trail:v1']) localStorage.removeItem(key)
      localStorage.setItem(acceptedKey, JSON.stringify(withoutDemo))
      setStorageWarning(false)
    } catch { setStorageWarning(true) }
    joinTimers.current.forEach(timer => window.clearTimeout(timer)); joinTimers.current = []
    setPartiesByScope(previous => ({ ...previous, demo: {} })); setRollsByScope(previous => ({ ...previous, demo: {} }))
    setDemo(initialDemoState); setAcceptedByScope(withoutDemo); setCustomQuests([]); setMessage('')
  }
  const isDemo = mode === 'demo'
  const currentProfile = isDemo ? { display_name: 'Sohail', friend_code: 'TQSOHAIL' } : live.profile ?? profile
  const liveCreated = expandLiveChallenges(live.challenges, clock)
  const campusSpots = isDemo ? demoSpots : remote.spots
  const spots = isDemo ? [...demoSpots, ...created.spots] : [...remote.spots, ...liveCreated.spots]
  const catches = isDemo ? demo.catches : remote.catches
  const quests = isDemo ? [...demoQuests, ...created.quests] : [...remote.quests, ...liveCreated.quests]
  const friends = isDemo ? demoFriends.filter(friend => demo.friendIds.includes(friend.user_id)) : remote.friends
  const acceptedScope = isDemo ? 'demo' : currentProfile?.friend_code ?? 'account'
  const accepted = isDemo ? acceptedByScope[acceptedScope] ?? {} : live.accepted
  const parties = isDemo ? partiesByScope[acceptedScope] ?? {} : live.parties
  const rolls = isDemo ? rollsByScope[acceptedScope] ?? {} : savedRewardRolls(quests, catches, stickerCatalogue)
  async function refreshLive() {
    if (!accessToken) return
    const [state, catches] = await Promise.all([loadLiveQuestState(accessToken), requestJSON<Catch[]>('/api/me/catches', { accessToken })])
    setLive(state); liveRef.current = state; setRemote(previous => ({ ...previous, catches }))
  }
  async function liveAction(action: () => Promise<void>) {
    if (busyRef.current || mode !== 'live' || !accessToken) return
    busyRef.current = true; setBusy(true)
    try { await action() } catch (e) { setMessage(e instanceof Error ? e.message : 'That action could not be saved. Please retry.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function syncRewards(book: Catch[], acceptances = liveRef.current.accepted) {
    if (!accessToken) return
    const completed = await completeReadyQuests(quests, acceptances, book, accessToken)
    setRemote(previous => ({ ...previous, catches: completed.catches }))
    if (completed.results.length) setMessage('Quest complete! Your server-verified reward is in your collection.')
  }
  // Rolls the party bonus for every quest reward that was just added; returns the toast for the last one.
  function rollNewRewards(before: Catch[], after: Catch[]) {
    const fresh = after.filter(c => c.source === 'quest' && !before.some(previous => previous.id === c.id))
    const now = new Date().toISOString()
    const added: RewardRolls = {}
    let text = ''
    for (const reward of fresh) {
      const quest = quests.find(item => item.id === reward.source_id)
      if (!quest || rolls[quest.id]) continue
      const roll = rollReward(stickerCatalogue.get(quest.reward_sticker_key)?.rarity ?? 'rare', joinedFriends(parties[quest.id]).length, Math.random, now)
      added[quest.id] = roll
      text = rewardMessage(quest.title, roll)
    }
    if (Object.keys(added).length) setRollsByScope(previous => ({ ...previous, [acceptedScope]: { ...previous[acceptedScope], ...added } }))
    return text
  }
  function visit(id: string, variant: 'morning' | 'day' | 'night') {
    if (!isDemo) return
    const spot = spots.find(item => item.id === id)
    if (spot && !canEarn(stickerCatalogue, spot.sticker_key)) { setMessage('This exclusive sticker isn’t available right now.'); return }
    // Ended challenges stop counting, so their rewards can no longer be earned.
    const next = addDemoVisit(demo, id, variant, spots, quests.filter(quest => accepted[quest.id] && questOpen(quest.id)), undefined, stickerCatalogue)
    saveDemo(next)
    setMessage(rollNewRewards(demo.catches, next.catches) || 'Demo sticker added. Your quest progress is up to date.')
  }
  /** Official quests stay open; challenges close at their end date. */
  function questOpen(questId: string) {
    if (!isChallengeId(questId)) return true
    if (!isDemo) return live.challenges.some(c => `cq-${c.id}` === questId && challengePlayable(c))
    const challenge = customQuests.find(item => `cq-${item.id}` === questId)
    return !!challenge && challengeOpen(challenge)
  }
  const questDone = (questId: string) => catches.some(c => c.source === 'quest' && c.source_id === questId)
  function setPartyMember(questId: string, friendId: string, status: 'invited' | 'joined' | null, onlyIf?: 'invited') {
    setPartiesByScope(previous => {
      const party = { ...previous[acceptedScope]?.[questId] }
      if (onlyIf && party[friendId] !== onlyIf) return previous
      if (status) party[friendId] = status
      else delete party[friendId]
      return { ...previous, [acceptedScope]: { ...previous[acceptedScope], [questId]: party } }
    })
  }
  /** Invites a friend to an accepted, unfinished quest. Parties hold at most three friends. */
  function inviteFriend(questId: string, friendId: string) {
    if (!isDemo) { void liveAction(async () => {
      const party = await requestJSON<ServerParty>(`/api/quests/${encodeURIComponent(questId)}/party`, { accessToken, body: { friend_id: friendId } })
      setLive(previous => ({ ...previous, parties: { ...previous.parties, [questId]: partyRecord(party) } }))
      setMessage('Quest invite sent. Your friend can respond from their Quests tab.')
    }); return }
    const quest = quests.find(item => item.id === questId), friend = friends.find(person => person.user_id === friendId)
    if (!isDemo || !quest || !friend || !accepted[questId] || questDone(questId)) return
    const party = parties[questId] ?? {}
    if (party[friendId] || Object.keys(party).length >= maxPartySize) return
    setPartyMember(questId, friendId, 'invited')
    setMessage(`Quest invite sent to ${friend.display_name}.`)
    // Demo friends accept after a moment; real invites wait for the friend to respond (docs/quest-parties.md).
    joinTimers.current.push(window.setTimeout(() => {
      setPartyMember(questId, friendId, 'joined', 'invited')
      setMessage(`${friend.display_name} joined “${quest.title}”!`)
    }, 1500))
  }
  function removeFromParty(questId: string, friendId: string) {
    if (!isDemo) { void liveAction(async () => {
      const party = await requestJSON<ServerParty>(`/api/quests/${encodeURIComponent(questId)}/party/${encodeURIComponent(friendId)}`, { accessToken, method: 'DELETE' })
      setLive(previous => ({ ...previous, parties: { ...previous.parties, [questId]: partyRecord(party) } }))
    }); return }
    if (!isDemo || questDone(questId)) return
    setPartyMember(questId, friendId, null)
  }
  function acceptQuest(id: string) {
    if (!isDemo) { void liveAction(async () => {
      const path = isChallengeId(id) ? `/api/challenges/${encodeURIComponent(id.slice(3))}/accept` : `/api/quests/${encodeURIComponent(id)}/accept`
      const saved = await requestJSON<QuestAcceptanceResult>(path, { accessToken, body: {} })
      const accepted = { ...liveRef.current.accepted, [saved.quest_id]: saved.accepted_at }
      setLive(previous => ({ ...previous, accepted })); liveRef.current = { ...liveRef.current, accepted }
      setMessage('Quest accepted. Your previously collected visits count.')
      await syncRewards(remote.catches, accepted)
      await refreshLive()
    }); return }
    const quest = quests.find(item => item.id === id)
    if (!quest || accepted[id]) return
    if (!canEarn(stickerCatalogue, quest.reward_sticker_key)) { setMessage('This exclusive quest isn’t available right now.'); return }
    if (!questOpen(id)) { setMessage('This challenge has ended.'); return }
    const now = new Date().toISOString()
    const next = { ...acceptedByScope, [acceptedScope]: { ...accepted, [id]: now } }
    setAcceptedByScope(next)
    try { localStorage.setItem(acceptedKey, JSON.stringify(next)); setStorageWarning(false) } catch { setStorageWarning(true) }
    // Places visited before accepting still count, so an already-finished quest is rewarded right away.
    if (isDemo) {
      const catches = awardCompletedQuests(demo.catches, [quest], now, stickerCatalogue)
      if (catches.length !== demo.catches.length) { saveDemo({ ...demo, catches }); setMessage(rollNewRewards(demo.catches, catches) || `Quest complete! “${quest.title}” reward added.`); return }
    }
    setMessage(`Quest accepted: “${quest.title}”. Visit its places in any order.`)
  }
  async function collectSpot(id: string, fix: { lat: number; lng: number }) {
    if (mode !== 'live' || !accessToken) throw new Error('A verified campus session is required to save this discovery.')
    const { result, catches } = await collectLiveSpot(id, fix, accessToken)
    if (catches) {
      setRemote(previous => ({ ...previous, catches }))
      try { await syncRewards(catches) } catch { setErrors(previous => [...previous, 'Your visit is saved, but its quest reward needs a refresh. Please retry loading your collection.']) }
    }
    return result
  }
  async function addFriend(code: string) {
    const friend_code = code.trim().toUpperCase()
    if (!friend_code || friend_code.length > 64) throw new Error('Enter a friend code.')
    if (friend_code === currentProfile?.friend_code.toUpperCase()) throw new Error('That’s your own code. Try a friend’s code instead.')
    if (isDemo) {
      const friend = demoFriends.find(person => person.friend_code === friend_code)
      if (!friend) throw new Error('That code wasn’t found. In this demo, try TQRINA or TQLEO.')
      saveDemo({ ...demo, friendIds: [...new Set([...demo.friendIds, friend.user_id])] })
      return friend
    }
    const friend = await requestJSON<Friend>('/api/friends', { body: { friend_code }, accessToken })
    setRemote(previous => ({ ...previous, friends: [...previous.friends.filter(person => person.user_id !== friend.user_id), friend] }))
    return friend
  }
  const friendBook = useCallback(async (id: string, signal?: AbortSignal): Promise<Catch[]> => {
    if (isDemo) {
      if (!demo.friendIds.includes(id) || !demoFriendBooks[id]) throw new RequestError(404, 'This friend book isn’t available.')
      return demoFriendBooks[id]
    }
    return requestJSON<Catch[]>(`/api/friends/${encodeURIComponent(id)}/catches`, { accessToken, signal })
  }, [isDemo, demo.friendIds, accessToken])
  /** Demo publishes locally; live mode submits for review and returns any server errors. */
  async function createCustomQuest(draft: QuestDraft): Promise<string[]> {
    if (!isDemo) {
      if (!accessToken || mode !== 'live') return ['Sign in before submitting a challenge.']
      try {
        const saved = await requestJSON<Challenge>('/api/challenges', { accessToken, body: draft, signal: AbortSignal.timeout(180_000) })
        setLive(previous => ({ ...previous, challenges: [saved, ...previous.challenges.filter(c => c.id !== saved.id)] }))
        setMessage('Challenge submitted for review. It becomes playable only after approval.')
        return []
      } catch (e) { return [e instanceof Error ? e.message : 'Your challenge could not be submitted.'] }
    }
    const problems = validateDraft(draft, campusSpots)
    if (problems.length) return problems
    const quest = createQuest(draft, { student: currentProfile?.display_name ?? 'A student', org: demoOrg.name })
    setCustomQuests(previous => [quest, ...previous])
    setMessage(`“${quest.title}” is live on the Challenges tab.`)
    return []
  }
  /** Live mode archives without deleting earned rewards; the demo removes its local records. */
  function deleteCustomQuest(questId: string) {
    if (!isDemo) { void liveAction(async () => {
      await requestJSON<Challenge>(`/api/challenges/${encodeURIComponent(questId.slice(3))}`, { accessToken, method: 'DELETE' })
      await refreshLive(); setMessage('Challenge archived. Earned stickers stay in collections.')
    }); return }
    const quest = customQuests.find(item => `cq-${item.id}` === questId)
    if (!isDemo || !quest) return
    const prefix = `cq-${quest.id}-`
    saveDemo({ ...demo, catches: demo.catches.filter(c => !(c.source === 'spot' && c.source_id.startsWith(prefix)) && !(c.source === 'quest' && c.source_id === questId)) })
    const drop = <T,>(record: Record<string, T> | undefined) => { const next = { ...record }; delete next[questId]; return next }
    const nextAccepted = { ...acceptedByScope, [acceptedScope]: drop(accepted) }
    setAcceptedByScope(nextAccepted)
    try { localStorage.setItem(acceptedKey, JSON.stringify(nextAccepted)) } catch { setStorageWarning(true) }
    setPartiesByScope(previous => ({ ...previous, [acceptedScope]: drop(previous[acceptedScope]) }))
    setRollsByScope(previous => ({ ...previous, [acceptedScope]: drop(previous[acceptedScope]) }))
    setCustomQuests(previous => previous.filter(item => item.id !== quest.id))
    setMessage(`“${quest.title}” was deleted.`)
  }
  function respondInvite(questId: string, ownerId: string, accept: boolean) { void liveAction(async () => {
    await requestJSON(`/api/quest-invites/${encodeURIComponent(questId)}/${encodeURIComponent(ownerId)}`, { accessToken, body: { accept } })
    await refreshLive()
    // A newly accepted invitation may already have all of its visits.
    await syncRewards(remote.catches)
    setMessage(accept ? 'You joined the quest. Your own visits count toward your reward.' : 'Invitation declined.')
  }) }
  function reviewChallenge(id: string, status: 'live' | 'rejected', reason: string) { void liveAction(async () => {
    await requestJSON(`/api/challenges/${encodeURIComponent(id)}/review`, { accessToken, body: { status, reason }, signal: AbortSignal.timeout(180_000) })
    await refreshLive(); setRevision(value => value + 1); setMessage(status === 'live' ? 'Challenge approved and published.' : 'Challenge rejected.')
  }) }
  async function saveProfile(display_name: string) {
    const profile = await requestJSON<ServerProfile>('/api/me/profile', { accessToken, method: 'PUT', body: { display_name } })
    setLive(previous => ({ ...previous, profile })); setRevision(value => value + 1)
  }
  return { mode, isDemo, profile: currentProfile, campusSpots, customQuests: isDemo ? customQuests : live.challenges, createCustomQuest, deleteCustomQuest,
    canCreateQuests: isDemo || mode === 'live' && !!currentProfile, org: isDemo ? demoOrg : live.orgs.find(o => o.role === 'admin') ?? null,
    orgs: isDemo ? [{ id: 'demo', name: demoOrg.name, role: 'admin' as const }] : live.orgs,
    live, busy, respondInvite, reviewChallenge, saveProfile,
    spots, catches, quests, friends, errors, message, setMessage, storageWarning, visit, collectSpot, accepted, acceptQuest, parties, rolls, inviteFriend, removeFromParty,
    partiesAvailable: isDemo || live.partiesAvailable, addFriend, friendBook, resetDemo, accessToken, reload: () => setRevision(value => value + 1) }
}
export type CollectionData = ReturnType<typeof useCollection>
