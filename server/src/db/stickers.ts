import type { SupabaseClient } from '@supabase/supabase-js';
import type { StickerDefinition } from '../../../shared/types.js';
import { databaseFailure, getAdminClient } from './client.js';

export interface StickerStore { list(): Promise<StickerDefinition[]> }

export function createStickerStore(client: () => SupabaseClient = getAdminClient): StickerStore {
  return {
    async list() {
      // Ended editions stay in the catalogue so collected stickers retain their metadata.
      const { data, error } = await client().from('stickers')
        .select('key,name,rarity,tags,image,art,lore,available_from,available_until,colors').order('key');
      if (error) databaseFailure(error);
      return (data ?? []).map(row => ({
        key: row.key, name: row.name, rarity: row.rarity, tags: row.tags,
        ...(row.image === null ? {} : { image: row.image }),
        ...(row.art === null ? {} : { art: row.art }),
        ...(row.lore === null ? {} : { lore: row.lore }),
        ...(row.colors == null ? {} : { colors: row.colors }),
        ...(row.available_from === null ? {} : { available_from: row.available_from }),
        ...(row.available_until === null ? {} : { available_until: row.available_until }),
      })) as StickerDefinition[];
    },
  };
}
