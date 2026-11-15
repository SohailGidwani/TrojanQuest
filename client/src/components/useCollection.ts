import { useCallback, useEffect, useState } from 'react'
import type { Catch, DemoState, Friend, Profile, Quest, Spot } from './types'
import { addDemoVisit, awardCompletedQuests, parseAcceptedQuests, parseDemoState } from './collection'
import type { AcceptedQuests } from './collection'
import { stickerCatalogue } from './catalogue'
import { canEarn } from './stickers'
import { demoFriendBooks, demoFriends, demoQuests, demoSpots, initialDemoState } from './mock'
import { requestJSON, RequestError } from './api'

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
function readDemo() { try { return parseDemoState(localStorage.getItem(storageKey)) ?? initialDemoState } catch { return initialDemoState } }
interface RemoteData { spots: Spot[]; catches: Catch[]; quests: Quest[]; friends: Friend[] }
const empty: RemoteData = { spots: [], catches: [], quests: [], friends: [] }
export function useCollection(accessToken?: string, profile?: Profile) {
  const [mode, setMode] = useState<'loading' | 'demo' | 'live' | 'offline'>('loading')
  const [demo, setDemo] = useState<DemoState>(readDemo)
  const [remote, setRemote] = useState<RemoteData>(empty)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)
  const [revision, setRevision] = useState(0)
  const [acceptedByScope, setAcceptedByScope] = useState(readAccepted)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const health = await requestJSON<{ mode: string }>('/api/health', { signal: controller.signal })
        if (controller.signal.aborted) return
        if (health.mode === 'local-demo') { setMode('demo'); setErrors([]); return }
        const paths = ['/api/spots', '/api/me/catches', '/api/quests', '/api/friends']
        const results = await Promise.allSettled(paths.map(path => requestJSON<unknown>(path, { accessToken, signal: controller.signal })))
        if (controller.signal.aborted) return
        const names = ['Campus places', 'Your stickers', 'Quests', 'Friends']
        const failed = results.flatMap((result, index) => result.status === 'rejected' ? [`${names[index]} aren't available yet.`] : [])
        const value = <T,>(index: number): T[] => { const result = results[index]; return result.status === 'fulfilled' && Array.isArray(result.value) ? result.value as T[] : [] }
        setRemote({ spots: value<Spot>(0), catches: value<Catch>(1), quests: value<Quest>(2), friends: value<Friend>(3) })
        setErrors(failed); setMode('live')
      } catch { if (!controller.signal.aborted) { setMode('offline'); setErrors(['We couldn’t reach the campus server. Try again in a moment.']) } }
    }
    void load()
    return () => controller.abort()
  }, [revision, accessToken])
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
  function visit(id: string, variant: 'morning' | 'day' | 'night') {
    if (!isDemo) return
    const spot = spots.find(item => item.id === id)
    if (spot && !canEarn(stickerCatalogue, spot.sticker_key)) { setMessage('This exclusive sticker isn’t available right now.'); return }
    saveDemo(addDemoVisit(demo, id, variant, spots, quests.filter(quest => accepted[quest.id]), undefined, stickerCatalogue))
    setMessage('Demo sticker added. Your quest progress is up to date.')
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
      if (catches.length !== demo.catches.length) { saveDemo({ ...demo, catches }); setMessage(`Quest complete! “${quest.title}” reward added.`); return }
    }
    setMessage(`Quest accepted: “${quest.title}”. Visit its places in any order.`)
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
  return { mode, isDemo, profile: currentProfile, spots, catches, quests, friends, errors, message, setMessage, storageWarning, visit, accepted, acceptQuest, addFriend, friendBook, resetDemo, accessToken, reload: () => setRevision(value => value + 1) }
}
export type CollectionData = ReturnType<typeof useCollection>
