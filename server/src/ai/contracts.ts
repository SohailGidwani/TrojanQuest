import { z } from 'zod';

// Runtime schemas validate model and content data against the shared API contract.
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
export type { Quest, Popup, PopupRecord, NewPopup, PopupStore } from '../../../shared/types.js';
export interface GuidePage { title: string; url: string; text: string }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
