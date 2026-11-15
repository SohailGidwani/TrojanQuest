import type { SupabaseClient } from '@supabase/supabase-js';
import type { Catch, OrgDrop, Popup, Spot } from '../../../shared/types.js';
import { databaseFailure, getAdminClient } from './client.js';
import { publicCatch } from './catch-fields.js';

export interface ReadStore {
  spots(): Promise<Spot[]>;
  popups(): Promise<Popup[]>;
  orgDrops(): Promise<OrgDrop[]>;
  catches(userId: string): Promise<Catch[]>;
}
export function createReadStore(client: () => SupabaseClient = getAdminClient): ReadStore {
  return {
    async spots() {
      const { data, error } = await client().from('spots')
        .select('id,name,lat,lng,category,card_text,tip,sticker_key').order('name');
      if (error) databaseFailure(error);
      return data as Spot[];
    },
    async popups() {
      const { data, error } = await client().from('popups')
        .select('id,lat,lng,brand,freebies,sticker,expires_at,confirmations,status')
        .eq('status', 'live').gt('expires_at', new Date().toISOString()).order('expires_at');
      if (error) databaseFailure(error);
      return data as Popup[];
    },
    async orgDrops() {
      const now = new Date().toISOString();
      const { data, error } = await client().from('org_drops')
        .select('id,org_name,event_name,lat,lng,starts_at,ends_at,sticker_key')
        .lte('starts_at', now).gt('ends_at', now).order('ends_at');
      if (error) databaseFailure(error);
      return data as OrgDrop[];
    },
    async catches(userId) {
      const { data, error } = await client().from('catches')
        .select('id,source,source_id,variant,caught_at,rarity,copies,party_size').eq('user_id', userId).order('caught_at', { ascending: false });
      if (error) databaseFailure(error);
      return (data as Catch[]).map(publicCatch);
    },
  };
}
