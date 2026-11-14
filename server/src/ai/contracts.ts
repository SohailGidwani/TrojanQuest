import { z } from 'zod';

// These AI-owned boundary schemas will consume Kartik's shared types when available.
export const stickerSchema = z.object({
  key: z.enum(['bubble', 'star', 'book', 'bowl', 'leaf', 'bolt', 'heart', 'flag']),
  name: z.string().trim().min(1).max(60),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(3),
  lore: z.string().trim().min(1).max(180),
});
export const verdictSchema = z.object({
  accepted: z.boolean(),
  reject_reason: z.string().max(240).nullable(),
  brand: z.string().trim().min(1).max(80).nullable(),
  freebies: z.array(z.string().trim().min(1).max(80)).max(10),
  duration_minutes: z.number().int().min(15).max(120).nullable(),
  sticker: stickerSchema.nullable(),
});
export const questSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), blurb: z.string(),
  spot_ids: z.array(z.string()).min(3).max(5), reward_sticker_key: z.string().min(1),
});
export type Quest = z.infer<typeof questSchema>;
export interface Popup {
  id: string; lat: number; lng: number; brand: string; freebies: string[];
  sticker: z.infer<typeof stickerSchema> & { source: 'popup'; variant: 'special' };
  expires_at: string; confirmations: number; status: 'live' | 'expired';
}
export interface PopupRecord extends Popup { created_at: string }
export type NewPopup = Omit<Popup, 'id'> & { reporter_id: string };
export interface PopupStore {
  createPopup(input: NewPopup): Promise<Popup>;
  findNearbyPopup(input: { lat: number; lng: number; withinMeters: number; since: string; brand: string }): Promise<PopupRecord | null>;
}
export interface GuidePage { title: string; url: string; text: string }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
