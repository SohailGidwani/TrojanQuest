import type { Catch, CatchResult, Friend, Quest, Spot } from '../../../shared/types'
import { requestJSON, RequestError } from '../components/api'

type Request = typeof requestJSON
export interface LiveCollection { spots: Spot[]; catches: Catch[]; quests: Quest[]; friends: Friend[] }

function array<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new Error('Unexpected collection response.')
  return value as T[]
}

export async function loadLiveCollection(accessToken: string, signal: AbortSignal, request: Request = requestJSON) {
  const options = { accessToken, signal }
  // Places and saved catches are required before the hunt can decide what is next.
  const [spots, catches, quests, friends] = await Promise.allSettled([
    request<Spot[]>('/api/spots', options).then(array<Spot>),
    request<Catch[]>('/api/me/catches', options).then(array<Catch>),
    request<Quest[]>('/api/quests', options).then(array<Quest>),
    request<Friend[]>('/api/friends', options).then(array<Friend>),
  ])
  for (const result of [spots, catches, quests, friends]) {
    if (result.status === 'rejected' && result.reason instanceof RequestError && [401, 403].includes(result.reason.status)) throw result.reason
  }
  if (spots.status === 'rejected') throw spots.reason
  if (catches.status === 'rejected') throw catches.reason
  return {
    data: { spots: spots.value, catches: catches.value,
      quests: quests.status === 'fulfilled' ? quests.value : [],
      friends: friends.status === 'fulfilled' ? friends.value : [] } satisfies LiveCollection,
    errors: [quests.status === 'rejected' ? 'Quests aren’t available yet.' : '', friends.status === 'rejected' ? 'Friends aren’t available yet.' : ''].filter(Boolean),
  }
}

export class CatchReadbackError extends Error {
  constructor() { super('Your discovery was saved, but we couldn’t refresh your book. Retry loading your collection before continuing.') }
}

export async function collectLiveSpot(spotId: string, fix: { lat: number; lng: number }, accessToken: string, request: Request = requestJSON) {
  const result = await request<CatchResult>('/api/catch', {
    accessToken, body: { source: 'spot', source_id: spotId, lat: fix.lat, lng: fix.lng },
  })
  if (!result.ok) return { result }
  try {
    const catches = array<Catch>(await request<Catch[]>('/api/me/catches', { accessToken }))
    if (!catches.some(item => item.source === 'spot' && item.source_id === spotId && item.variant === result.variant)) throw new Error('Catch not visible yet.')
    return { result, catches }
  } catch { throw new CatchReadbackError() }
}
