import { readFile } from 'node:fs/promises';
import type { Quest, Spot, StickerDefinition } from '../../../shared/types.js';
import { authoredQuestsFileSchema } from './schemas.js';

export async function loadAuthoredQuests(path: string): Promise<Quest[]> {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Quest file not found. Ask Cal for content/quests.json.'); }
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Quest file is not valid JSON.'); }
  return authoredQuestsFileSchema.parse(data);
}

export function validateQuestReferences(quests: Quest[], spots: Spot[], stickers: StickerDefinition[]): void {
  const places = new Map(spots.map(spot => [spot.id, spot]));
  const keys = new Set(stickers.map(sticker => sticker.key));
  const errors: string[] = [];
  for (const quest of quests) {
    for (const id of quest.spot_ids) {
      const spot = places.get(id);
      if (!spot) errors.push(`${quest.id}: missing spot ${id}`);
      else if (!keys.has(spot.sticker_key)) errors.push(`${quest.id}: missing sticker ${spot.sticker_key} for ${id}`);
    }
    if (!keys.has(quest.reward_sticker_key)) errors.push(`${quest.id}: missing reward sticker ${quest.reward_sticker_key}`);
  }
  if (errors.length) throw new Error(`Invalid quest references: ${errors.join('; ')}.`);
}
