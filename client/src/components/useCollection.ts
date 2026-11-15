import { useCallback, useEffect, useRef, useState } from 'react'
import type { Catch, DemoState, Friend, Profile, Quest, Spot } from './types'
import { addDemoVisit, awardCompletedQuests, parseAcceptedQuests, parseDemoState } from './collection'
import type { AcceptedQuests } from './collection'
import { stickerCatalogue } from './catalogue'
import { canEarn, rarityLabels } from './stickers'
import { joinedFriends, maxPartySize, parseParties, parseRolls, rollReward } from './party'
import type { RewardRoll, RewardRolls } from './party'
import { demoFriendBooks, demoFriends, demoQuests, demoSpots, initialDemoState } from './mock'
import { requestJSON, RequestError } from './api'
import { collectLiveSpot, loadLiveCollection } from '../map/liveCollection'
import type { SessionState } from '../map/session'

const storageKey = 'trojanquest:collection-demo:v2'
// Accepted quests live in this browser until there is a backend route for them, scoped per demo/account.
const acceptedKey = 'trojanquest:accepted-quests:v1'
function readAccepted(): Record<string, AcceptedQuests> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(acceptedKey) ?? '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).map(([scope, value]) => [scope, parseAcceptedQuests(value)]))
  } catch { return {} }
}
// Quest parties and their reward rolls are demo-only until the server supports them (docs/quest-parties.md).
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
        if (controller.signal.aborted) return
        setRemote(result.data); setErrors(result.errors); setMode('live')
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
    setDemo(initialDemoState); setAcceptedByScope(withoutDemo); setMessage('')
  }
  const isDemo = mode === 'demo'
  const currentProfile = isDemo ? { display_name: 'Sohail', friend_code: 'TQSOHAIL' } : profile
  const spots = isDemo ? demoSpots : remote.spots
  const catches = isDemo ? demo.catches : remote.catches
  const quests = isDemo ? demoQuests : remote.quests
  const friends = isDemo ? demoFriends.filter(friend => demo.friendIds.includes(friend.user_id)) : remote.friends
  const acceptedScope = isDemo ? 'demo' : currentProfile?.friend_code ?? 'account'
  const accepted = acceptedByScope[acceptedScope] ?? {}
  const parties = partiesByScope[acceptedScope] ?? {}
  const rolls = rollsByScope[acceptedScope] ?? {}
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
    const next = addDemoVisit(demo, id, variant, spots, quests.filter(quest => accepted[quest.id]), undefined, stickerCatalogue)
    saveDemo(next)
    setMessage(rollNewRewards(demo.catches, next.catches) || 'Demo sticker added. Your quest progress is up to date.')
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
    if (!isDemo || questDone(questId)) return
    setPartyMember(questId, friendId, null)
  }
  function acceptQuest(id: string) {
    const quest = quests.find(item => item.id === id)
    if (!quest || accepted[id]) return
    if (!canEarn(stickerCatalogue, quest.reward_sticker_key)) { setMessage('This exclusive quest isn’t available right now.'); return }
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
    if (catches) setRemote(previous => ({ ...previous, catches }))
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
  return { mode, isDemo, profile: currentProfile, spots, catches, quests, friends, errors, message, setMessage, storageWarning, visit, collectSpot, accepted, acceptQuest, parties, rolls, inviteFriend, removeFromParty, partiesAvailable: isDemo, addFriend, friendBook, resetDemo, accessToken, reload: () => setRevision(value => value + 1) }
}
export type CollectionData = ReturnType<typeof useCollection>
