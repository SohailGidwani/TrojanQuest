// Temporary frontend contract until Kartik publishes shared/types.ts.
export type Category = 'study' | 'eat' | 'hangout' | 'chill' | 'essentials'
export type Variant = 'morning' | 'day' | 'night' | 'seasonal' | 'special'
export type Source = 'spot' | 'popup' | 'org' | 'quest'
export interface Sticker { key: string; name: string; source: Source; variant: Variant; colors?: string[]; lore?: string }
export interface Spot { id: string; name: string; lat: number; lng: number; category: Category; card_text: string; tip: string; sticker_key: string }
export interface Catch { id: string; source: Source; source_id: string; variant: Variant; caught_at: string }
export interface Quest { id: string; title: string; blurb: string; spot_ids: string[]; reward_sticker_key: string }
export interface Friend { user_id: string; display_name: string; friend_code: string }
export type Profile = Pick<Friend, 'display_name' | 'friend_code'>
export interface DemoState { catches: Catch[]; friendIds: string[] }
export interface Citation { title: string; url: string }
export const categories: { key: Category; label: string }[] = [
  { key: 'study', label: 'Study' }, { key: 'eat', label: 'Eat' }, { key: 'hangout', label: 'Hang out' }, { key: 'chill', label: 'Chill' }, { key: 'essentials', label: 'Essentials' },
]
export const timeVariants = ['morning', 'day', 'night'] as const
