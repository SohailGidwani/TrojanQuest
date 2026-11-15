import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spotsFileSchema, stickerFileSchema } from '../server/src/db/schemas.js';
import { getAdminClient } from '../server/src/db/client.js';
import type { Spot, StickerDefinition } from '../shared/types.js';
import { existsSync } from 'node:fs';
import { loadAuthoredQuests, validateQuestReferences } from '../server/src/db/quest-content.js';

export async function loadSpots(path: string) {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Spots file not found. Ask Cal for content/spots.json, or pass --file <path>.'); }
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Spots file is not valid JSON.'); }
  return spotsFileSchema.parse(data);
}

export async function loadStickers(path: string) {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Sticker catalogue not found. Ask Cal for content/stickers.json, or pass --stickers <path>.'); }
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Sticker catalogue is not valid JSON.'); }
  return stickerFileSchema.parse(data).stickers;
}

export function validateStickerReferences(spots: Spot[], stickers: StickerDefinition[]) {
  const keys = new Set(stickers.map(sticker => sticker.key));
  const missing = [...new Set(spots.filter(spot => !keys.has(spot.sticker_key)).map(spot => spot.sticker_key))];
  if (missing.length) throw new Error(`Spots reference missing sticker keys: ${missing.join(', ')}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (seen.has(args[i])) throw new Error(`Repeated seed option: ${args[i]}.`);
    seen.add(args[i]);
    if (args[i] === '--dry-run' || args[i] === '--stickers-only') continue;
    if (['--file','--stickers','--quests'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) { i++; continue; }
    throw new Error('Usage: seed.ts [--file <spots-path>] [--stickers <catalogue-path>] [--quests <quests-path>] [--stickers-only] [--dry-run]');
  }
  const fileFlag = args.indexOf('--file');
  const stickerFlag = args.indexOf('--stickers');
  const questFlag = args.indexOf('--quests');
  if (args.includes('--stickers-only') && fileFlag >= 0) throw new Error('--file cannot be combined with --stickers-only.');
  if (args.includes('--stickers-only') && questFlag >= 0) throw new Error('--quests requires spots; remove --stickers-only.');
  const path = fileFlag >= 0 ? resolve(args[fileFlag + 1]) : fileURLToPath(new URL('../content/spots.json', import.meta.url));
  const stickerPath = stickerFlag >= 0 ? resolve(args[stickerFlag + 1]) : fileURLToPath(new URL('../content/stickers.json', import.meta.url));
  const stickers = await loadStickers(stickerPath);
  const spots = args.includes('--stickers-only') ? null : await loadSpots(path);
  if (spots) validateStickerReferences(spots, stickers);
  const questPath = questFlag >= 0 ? resolve(args[questFlag + 1]) : fileURLToPath(new URL('../content/quests.json', import.meta.url));
  let questCount = 0;
  if (spots && (questFlag >= 0 || existsSync(questPath))) {
    const quests = await loadAuthoredQuests(questPath);
    validateQuestReferences(quests, spots, stickers);
    questCount = quests.length;
  }
  if (questCount) console.log(`Validated ${questCount} authored quests and their references.`);
  if (args.includes('--dry-run')) { console.log(`Validated ${stickers.length} stickers and ${spots?.length ?? 0} spots; database unchanged.`); return; }
  const { error } = await getAdminClient().rpc('seed_sticker_catalogue', { p_stickers: stickers, p_spots: spots });
  if (error?.code === 'PT409') throw new Error('Seeding refused: an exclusive sticker cannot lose exclusivity or reopen after ending.');
  if (error) throw new Error('Seeding failed. Check the catalogue, Supabase credentials and the fourth migration.');
  console.log(`Seeded ${stickers.length} stickers and ${spots?.length ?? 0} spots. Other rows preserved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seeding failed.');
    process.exitCode = 1;
  });
}
