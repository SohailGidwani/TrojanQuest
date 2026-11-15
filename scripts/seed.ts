import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spotsFileSchema } from '../server/src/db/schemas.js';
import { getAdminClient } from '../server/src/db/client.js';

export async function loadSpots(path: string) {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error('Spots file not found. Ask Cal for content/spots.json, or pass --file <path>.'); }
  return spotsFileSchema.parse(JSON.parse(raw.replace(/^\uFEFF/, '')));
}

async function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') continue;
    if (args[i] === '--file' && args[i + 1] && !args[i + 1].startsWith('--')) { i++; continue; }
    throw new Error('Usage: seed.ts [--file <path>] [--dry-run]');
  }
  const fileFlag = args.indexOf('--file');
  const path = fileFlag >= 0 ? resolve(args[fileFlag + 1]) : fileURLToPath(new URL('../content/spots.json', import.meta.url));
  const spots = await loadSpots(path);
  if (args.includes('--dry-run')) { console.log(`Validated ${spots.length} spots; database unchanged.`); return; }
  const { error } = await getAdminClient().from('spots').upsert(spots, { onConflict: 'id' });
  if (error) throw new Error('Seeding failed. Check Supabase credentials and apply the migration first.');
  console.log(`Seeded ${spots.length} spots. Existing IDs updated; other spots preserved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seeding failed.');
    process.exitCode = 1;
  });
}
