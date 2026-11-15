import type { Catch, Category, DemoState, Friend, Quest, Spot } from './types'
import { addDemoVisit } from './collection'

// shortcut: clearly labeled preview content until Cal's catalogue and Kartik's APIs land.
const places: [string, string, Category, string][] = [
  ['leavey', 'Leavey Library', 'study', 'book'], ['doheny', 'Doheny Library', 'study', 'book'], ['philosophy', 'Philosophy Library', 'study', 'star'],
  ['village', 'USC Village', 'eat', 'bowl'], ['campus-center', 'Tutor Campus Center', 'eat', 'bubble'], ['mccarthy', 'McCarthy Quad', 'hangout', 'flag'],
  ['alumni', 'Alumni Park', 'chill', 'leaf'], ['bovard', 'Bovard Auditorium', 'hangout', 'flag'], ['exposition', 'Exposition Park', 'chill', 'leaf'],
  ['health', 'Student Health', 'essentials', 'heart'], ['career', 'Career Center', 'essentials', 'bolt'], ['cultural', 'Cultural Centers', 'essentials', 'heart'],
  ['tutoring', 'Tutoring Resources', 'essentials', 'book'], ['fertitta', 'Fertitta Hall', 'study', 'bolt'], ['tutor', 'Ronald Tutor Hall', 'hangout', 'star'],
]
export const demoSpots: Spot[] = places.map(([id, name, category, sticker_key]) => ({
  id, name, category, sticker_key, lat: 34.0257, lng: -118.2856,
  card_text: 'A new corner of campus for your collection. This is a sample card; verified details and opening hours will come with the campus catalogue.',
  tip: 'Come back in the morning, afternoon, or evening to collect a different time-of-day edition.',
}))
export const demoQuests: Quest[] = [
  { id: 'study-tour', title: 'Find your focus', blurb: 'Three libraries. Three chances to find your new favorite study spot.', spot_ids: ['leavey', 'doheny', 'philosophy'], reward_sticker_key: 'book' },
  { id: 'campus-break', title: 'The campus catch-up', blurb: 'Take a break, find a bite, and spend a little time outside.', spot_ids: ['village', 'campus-center', 'mccarthy'], reward_sticker_key: 'bowl' },
  { id: 'first-week', title: 'Your first-week toolkit', blurb: 'Get to know the people and places that can help you along the way.', spot_ids: ['health', 'career', 'cultural'], reward_sticker_key: 'heart' },
  { id: 'fresh-air', title: 'A little fresh air', blurb: 'Close the laptop. Find a different view of campus.', spot_ids: ['alumni', 'bovard', 'exposition'], reward_sticker_key: 'leaf' },
]
export const demoFriends: Friend[] = [
  { user_id: 'maya', display_name: 'Maya', friend_code: 'TQMAYA' },
  { user_id: 'rina', display_name: 'Rina', friend_code: 'TQRINA' },
  { user_id: 'leo', display_name: 'Leo', friend_code: 'TQLEO' },
]
function catchesFor(ids: string[]): Catch[] {
  return ids.reduce((state, id) => addDemoVisit(state, id, 'day', demoSpots, demoQuests, '2026-11-14T19:00:00Z'), { catches: [], friendIds: [] } as DemoState).catches
}
export const demoFriendBooks: Record<string, Catch[]> = {
  maya: catchesFor(demoSpots.map(s => s.id)), rina: catchesFor(['leavey', 'doheny', 'village', 'alumni', 'career', 'cultural', 'tutor', 'mccarthy']), leo: catchesFor(['health', 'career', 'cultural', 'bovard']),
}
let initial: DemoState = { catches: [], friendIds: ['maya'] }
for (const id of ['leavey', 'doheny', 'village', 'campus-center', 'mccarthy', 'health']) initial = addDemoVisit(initial, id, 'day', demoSpots, demoQuests, '2026-11-14T19:00:00Z')
export const initialDemoState = addDemoVisit(initial, 'leavey', 'night', demoSpots, demoQuests, '2026-11-15T01:00:00Z')
