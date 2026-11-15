import type { Category, Friend, Catch } from '../../../shared/types'
export type { Category, Variant, Source, Sticker, Spot, Catch, Quest, Friend } from '../../../shared/types'
export type Profile = Pick<Friend, 'display_name' | 'friend_code'>
export interface DemoState { catches: Catch[]; friendIds: string[] }
export interface Citation { title: string; url: string }
export const categories: { key: Category; label: string }[] = [
  { key: 'study', label: 'Study' }, { key: 'eat', label: 'Eat' }, { key: 'hangout', label: 'Hang out' }, { key: 'chill', label: 'Chill' }, { key: 'essentials', label: 'Essentials' },
]
export const timeVariants = ['morning', 'day', 'night'] as const
