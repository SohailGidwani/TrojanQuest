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

export const catchRequestSchema = positionSchema.extend({
  source: z.enum(['spot', 'popup', 'org', 'quest']),
  source_id: id,
}).strict().superRefine((value, ctx) => {
  if (value.source === 'popup' && !z.uuid().safeParse(value.source_id).success) {
    ctx.addIssue({ code: 'custom', path: ['source_id'], message: 'Pop-up ID must be a UUID.' });
  }
});
export const confirmRequestSchema = positionSchema.strict();

export const saveProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(80).refine(name => !/\p{Cc}/u.test(name), 'Use a single-line display name.'),
}).strict();
export const addFriendSchema = z.object({
  friend_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,64}$/),
}).strict();

export const stickerDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: z.string().trim().min(1).max(200),
  rarity: z.enum(['common','rare','epic','legendary','exclusive']),
  tags: z.array(z.string().trim().min(1).max(60)).max(30)
    .transform(tags => [...new Set(tags.map(tag => tag.toLowerCase()))]),
  image: z.string().max(255).regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.(svg|png|webp)$/i).optional(),
  art: z.enum(['bubble','star','book','bowl','leaf','bolt','heart','flag']).optional(),
  lore: z.string().trim().max(500).optional(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).length(3).optional(),
  available_from: z.iso.datetime({ offset: true }).optional(),
  available_until: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.rarity === 'exclusive' && !value.available_until) {
    ctx.addIssue({ code:'custom', path:['available_until'], message:'Exclusive stickers require an end time.' });
  }
  if (value.rarity !== 'exclusive' && (value.available_from || value.available_until)) {
    ctx.addIssue({ code:'custom', message:'Only exclusive stickers have availability windows.' });
  }
  if (value.available_from && value.available_until && Date.parse(value.available_from) >= Date.parse(value.available_until)) {
    ctx.addIssue({ code:'custom', path:['available_until'], message:'The end must follow the start.' });
  }
});
export const stickerFileSchema = z.object({ stickers: z.array(stickerDefinitionSchema).min(1) }).strict()
  .superRefine(({ stickers }, ctx) => {
    const keys = new Set<string>();
    stickers.forEach((sticker, index) => {
      if (keys.has(sticker.key)) ctx.addIssue({ code:'custom', path:['stickers',index,'key'], message:'Duplicate sticker key.' });
      keys.add(sticker.key);
    });
  });

export const questIdSchema = z.string().min(1).max(120)
  .refine(value => value === value.trim() && !/\p{Cc}/u.test(value), 'Use a nonempty, trimmed quest ID.');
export const inviteToQuestSchema = z.object({ friend_id: z.uuid() }).strict();
export const respondToQuestInviteSchema = z.object({ accept: z.boolean() }).strict();
export const authoredQuestSchema = z.object({
  id: questIdSchema,
  title: z.string().trim().min(1).max(200),
  blurb: z.string().max(2000),
  spot_ids: z.array(questIdSchema).min(3).max(5),
  reward_sticker_key: z.string().regex(/^[a-z0-9-]{1,60}$/),
}).strict().superRefine((quest, ctx) => {
  if (new Set(quest.spot_ids).size !== quest.spot_ids.length) {
    ctx.addIssue({ code:'custom', path:['spot_ids'], message:'Quest stops must be distinct.' });
  }
});
export const authoredQuestsFileSchema = z.array(authoredQuestSchema).min(1).max(30).superRefine((quests, ctx) => {
  const ids = new Set<string>();
  quests.forEach((quest, index) => {
    if (ids.has(quest.id)) ctx.addIssue({ code:'custom', path:[index,'id'], message:'Duplicate quest ID.' });
    ids.add(quest.id);
  });
});
