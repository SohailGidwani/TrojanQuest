import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Catch, Friend, Profile, SaveProfileRequest } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { databaseFailure, getAdminClient } from './client.js';
import { addFriendSchema, saveProfileSchema } from './schemas.js';

export interface FriendsStore {
  profile(userId: string): Promise<Profile>;
  saveProfile(userId: string, input: SaveProfileRequest): Promise<Profile>;
  list(userId: string): Promise<Friend[]>;
  add(userId: string, code: string): Promise<Friend>;
  catches(userId: string, friendId: string): Promise<Catch[]>;
}

function socialFailure(error: { code?: string } | null): never {
  switch (error?.code) {
    case '42501': throw new ApiError(403, 'A verified USC account is required for this action.');
    case 'PT400': throw new ApiError(400, 'You cannot add your own friend code.');
    case 'PT404': throw new ApiError(404, 'That friend code or sticker book was not found.');
    case 'PT409': throw new ApiError(409, 'Save your profile before adding friends.');
    case '22023': case '22P02': throw new ApiError(400, 'Invalid request fields.');
    default: databaseFailure(error);
  }
}
function publicProfile(row: Friend): Friend {
  return { user_id: row.user_id, display_name: row.display_name, friend_code: row.friend_code };
}

export function createFriendsStore(client: () => SupabaseClient = getAdminClient): FriendsStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client().rpc(name, args);
    if (error) socialFailure(error);
    return data;
  }
  return {
    async profile(userId) {
      const data = await rpc('read_traveller_profile', { p_user_id: z.uuid().parse(userId) });
      if (!data) throw new ApiError(404, 'Save your profile to get a friend code.');
      return publicProfile(data as Profile);
    },
    async saveProfile(userId, input) {
      const actor = z.uuid().parse(userId);
      const clean = saveProfileSchema.parse(input);
      const data = await rpc('save_traveller_profile', { p_user_id: actor, p_display_name: clean.display_name });
      if (!data) databaseFailure(null);
      return publicProfile(data as Profile);
    },
    async list(userId) {
      const data = await rpc('list_traveller_friends', { p_user_id: z.uuid().parse(userId) });
      if (!Array.isArray(data)) databaseFailure(null);
      return (data as Friend[]).map(publicProfile);
    },
    async add(userId, code) {
      const actor = z.uuid().parse(userId);
      const clean = addFriendSchema.parse({ friend_code: code });
      const data = await rpc('add_traveller_friend', { p_user_id: actor, p_friend_code: clean.friend_code });
      if (!data) databaseFailure(null);
      return publicProfile(data as Friend);
    },
    async catches(userId, friendId) {
      const actor = z.uuid().parse(userId);
      const friend = z.uuid().parse(friendId);
      const data = await rpc('read_friend_catches', { p_user_id: actor, p_friend_id: friend });
      if (!Array.isArray(data)) databaseFailure(null);
      return (data as Catch[]).map(({ id, source, source_id, variant, caught_at }) => ({ id, source, source_id, variant, caught_at }));
    },
  };
}
