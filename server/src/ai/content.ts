import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ApiError, questSchema, type GuidePage } from './contracts.js';

export async function loadQuests(directory: string) {
  try { return z.array(questSchema).min(1).max(30).parse(JSON.parse(await readFile(join(directory, 'quests.json'), 'utf8'))); }
  catch { throw new ApiError(503, "Cal's content/quests.json is missing or invalid."); }
}
export async function loadGuidePages(directory: string): Promise<GuidePage[]> {
  try {
    const files = (await readdir(directory)).filter(name => /\.(txt|md)$/.test(name)).sort().slice(0, 20);
    const pages = await Promise.all(files.map(async name => {
      const [first, ...lines] = (await readFile(join(directory, name), 'utf8')).split(/\r?\n/);
      const url = new URL(first.trim());
      if (url.protocol !== 'https:' || !(url.hostname === 'usc.edu' || url.hostname.endsWith('.usc.edu')) || url.username || url.password) throw new Error('Not a USC source');
      const title = lines[0]?.startsWith('# ') ? lines.shift()!.slice(2).trim() : name.replace(/\.(txt|md)$/, '').replace(/[-_]/g, ' ');
      // shortcut: first 1,500 characters per page fit local context; add retrieval if coverage suffers.
      const text = lines.join('\n').trim().slice(0, 1500);
      if (!text) throw new Error('Empty source');
      return { title, url: url.href, text };
    }));
    if (!pages.length) throw new Error('No saved sources');
    return pages;
  } catch { throw new ApiError(503, "Cal's guide pages are missing or invalid. Use .txt/.md with a USC HTTPS URL on line one."); }
}
