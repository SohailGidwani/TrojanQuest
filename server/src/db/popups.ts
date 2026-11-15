import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewPopup, NearbyPopupQuery, Popup, PopupRecord, PopupStore } from '../../../shared/types.js';
import { databaseFailure, getAdminClient } from './client.js';
import { nearbyPopupSchema, newPopupSchema } from './schemas.js';

// Explicit fields prevent database-only metadata from leaking into API responses.
function publicPopup(row: Popup): Popup {
  return {
    id: row.id, lat: row.lat, lng: row.lng, brand: row.brand, freebies: row.freebies,
    sticker: row.sticker, expires_at: row.expires_at, confirmations: row.confirmations, status: row.status,
  };
}

export function createPopupStore(client: () => SupabaseClient = getAdminClient): PopupStore {
  return {
    async createPopup(input: NewPopup): Promise<Popup> {
      const clean = newPopupSchema.parse(input);
      const { data, error } = await client().rpc('create_popup', { input: clean });
      if (error || !data) databaseFailure(error);
      return publicPopup(data as Popup);
    },
    async findNearbyPopup(input: NearbyPopupQuery): Promise<PopupRecord | null> {
      const clean = nearbyPopupSchema.parse(input);
      const { data, error } = await client().rpc('find_nearby_popup', {
        p_lat: clean.lat, p_lng: clean.lng, p_within_meters: clean.withinMeters,
        p_since: clean.since, p_brand: clean.brand,
      });
      if (error) databaseFailure(error);
      if (!data) return null;
      return { ...publicPopup(data as PopupRecord), created_at: (data as PopupRecord).created_at };
    },
  };
}

const store = createPopupStore();
export const createPopup = store.createPopup;
export const findNearbyPopup = store.findNearbyPopup;
