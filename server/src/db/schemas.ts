import { z } from 'zod';

export const positionSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
const id = z.string().trim().min(1).max(120);
export const spotSchema = positionSchema.extend({
  id,
  name: z.string().trim().min(1).max(200),
  category: z.enum(['study', 'eat', 'hangout', 'chill', 'essentials']),
  card_text: z.string().trim().min(1).max(4000),
  tip: z.string().trim().min(1).max(2000),
  sticker_key: id,
});
export const spotsFileSchema = z.array(spotSchema).min(1).superRefine((spots, ctx) => {
  const seen = new Set<string>();
  spots.forEach((spot, index) => {
    if (seen.has(spot.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate spot ID.' });
    seen.add(spot.id);
  });
});
const popupSticker = z.object({
  key: z.enum(['bubble', 'star', 'book', 'bowl', 'leaf', 'bolt', 'heart', 'flag']),
  name: z.string().trim().min(1).max(60),
  source: z.literal('popup'),
  variant: z.literal('special'),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(3),
  lore: z.string().max(180),
});
export const newPopupSchema = positionSchema.extend({
  brand: z.string().trim().min(1).max(80),
  freebies: z.array(z.string().trim().min(1).max(80)).max(10),
  sticker: popupSticker,
  expires_at: z.iso.datetime({ offset: true }),
  confirmations: z.literal(1),
  status: z.literal('live'),
  reporter_id: z.uuid(),
});
export const nearbyPopupSchema = positionSchema.extend({
  withinMeters: z.number().finite().positive().max(100),
  since: z.iso.datetime({ offset: true }),
  brand: z.string().trim().min(1).max(80),
});
