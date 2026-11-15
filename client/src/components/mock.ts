import type { Catch, Category, DemoState, Friend, Quest, Spot } from './types'
import { addDemoVisit } from './collection'

// Hunt pins: USC's Bovard venue listing and OpenStreetMap; sources in docs/hunt-plan.md.
// shortcut: places outside the authored trails still use illustrative preview coordinates.
const huntPins: Record<string, [number, number]> = {
  bovard: [34.020914, -118.285537], leavey: [34.021773, -118.282881],
  doheny: [34.020197, -118.283725], alumni: [34.020638, -118.284520],
  mccarthy: [34.020940, -118.283150],
}
const places: [string, string, Category, string][] = [
  ['leavey', 'Leavey Library', 'study', 'book'], ['doheny', 'Doheny Library', 'study', 'book'], ['philosophy', 'Philosophy Library', 'study', 'star'],
  ['village', 'USC Village', 'eat', 'bowl'], ['campus-center', 'Tutor Campus Center', 'eat', 'bubble'], ['mccarthy', 'McCarthy Quad', 'hangout', 'flag'],
  ['alumni', 'Alumni Park', 'chill', 'leaf'], ['bovard', 'Bovard Auditorium', 'hangout', 'flag'], ['exposition', 'Exposition Park', 'chill', 'leaf'],
  ['health', 'Student Health', 'essentials', 'heart'], ['career', 'Career Center', 'essentials', 'bolt'], ['cultural', 'Cultural Centers', 'essentials', 'heart'],
  ['tutoring', 'Tutoring Resources', 'essentials', 'book'], ['fertitta', 'Fertitta Hall', 'study', 'bolt'], ['tutor', 'Ronald Tutor Hall', 'hangout', 'star'],
]
// Each spot's sticker_key is its catalogue entry in content/stickers.json (same as the spot id here).
export const demoSpots: Spot[] = places.map(([id, name, category]) => ({
  id, name, category, sticker_key: id, lat: huntPins[id]?.[0] ?? 34.0257, lng: huntPins[id]?.[1] ?? -118.2856,
  card_text: 'A new corner of campus for your collection. This is a sample card; verified details and opening hours will come with the campus catalogue.',
  tip: 'Come back in the morning, afternoon, or evening to collect a different time-of-day edition.',
}))
export const demoQuests: Quest[] = [
  { id: 'study-tour', title: 'Find your focus', blurb: 'Three libraries. Three chances to find your new favorite study spot.', spot_ids: ['leavey', 'doheny', 'philosophy'], reward_sticker_key: 'quest-study-tour' },
  { id: 'campus-break', title: 'The campus catch-up', blurb: 'Take a break, find a bite, and spend a little time outside.', spot_ids: ['village', 'campus-center', 'mccarthy'], reward_sticker_key: 'quest-campus-break' },
  { id: 'first-week', title: 'Your first-week toolkit', blurb: 'Get to know the people and places that can help you along the way.', spot_ids: ['health', 'career', 'cultural'], reward_sticker_key: 'quest-first-week' },
  { id: 'fresh-air', title: 'A little fresh air', blurb: 'Close the laptop. Find a different view of campus.', spot_ids: ['alumni', 'bovard', 'exposition'], reward_sticker_key: 'quest-fresh-air' },
  // Sample exclusive quests: one running now, one whose window has closed.
  { id: 'fall-trail', title: 'Fall trail', blurb: 'A limited-time loop through campus green space. Gone after November.', spot_ids: ['alumni', 'exposition', 'philosophy'], reward_sticker_key: 'quest-fall-trail' },
  { id: 'homecoming', title: 'Homecoming weekend', blurb: 'The Homecoming route. This one has already wrapped up.', spot_ids: ['mccarthy', 'bovard', 'village'], reward_sticker_key: 'quest-homecoming' },
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
export const initialDemoState: DemoState = { catches: [], friendIds: [] }
