import { useCallback, useEffect, useState } from 'react'
import type { Catch, DemoState, Friend, Profile, Quest, Spot } from './types'
import { addDemoVisit, parseDemoState } from './collection'
import { demoFriendBooks, demoFriends, demoQuests, demoSpots, initialDemoState } from './mock'
import { requestJSON, RequestError } from './api'

const storageKey = 'trojanquest:collection-demo:v2'
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
    try {
      for (const key of ['trojanquest:collection-demo:v1', storageKey, 'trojanquest:trail:v1']) localStorage.removeItem(key)
      setStorageWarning(false)
    } catch { setStorageWarning(true) }
    setDemo(initialDemoState); setMessage('')
  }
  const isDemo = mode === 'demo'
  const currentProfile = isDemo ? { display_name: 'Sohail', friend_code: 'TQSOHAIL' } : profile
  const spots = isDemo ? demoSpots : remote.spots
  const catches = isDemo ? demo.catches : remote.catches
  const quests = isDemo ? demoQuests : remote.quests
  const friends = isDemo ? demoFriends.filter(friend => demo.friendIds.includes(friend.user_id)) : remote.friends
  function visit(id: string, variant: 'morning' | 'day' | 'night') {
    if (!isDemo) return
    saveDemo(addDemoVisit(demo, id, variant, spots, quests))
    setMessage('Demo sticker added. Your quest progress is up to date.')
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
  return { mode, isDemo, profile: currentProfile, spots, catches, quests, friends, errors, message, setMessage, storageWarning, visit, addFriend, friendBook, resetDemo, accessToken, reload: () => setRevision(value => value + 1) }
}
export type CollectionData = ReturnType<typeof useCollection>
