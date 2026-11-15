import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { QuestInvite, QuestParty } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { databaseFailure, getAdminClient } from './client.js';
import { questIdSchema } from './schemas.js';

export interface PartyStore {
  read(userId: string, questId: string): Promise<QuestParty>;
  invite(userId: string, questId: string, friendId: string): Promise<QuestParty>;
  remove(userId: string, questId: string, friendId: string): Promise<QuestParty>;
  incoming(userId: string): Promise<QuestInvite[]>;
  respond(userId: string, questId: string, ownerId: string, accept: boolean): Promise<QuestParty>;
}
function partyFailure(error: { code?: string } | null): never {
  switch (error?.code) {
    case '42501': throw new ApiError(403, 'A verified USC account is required for this action.');
    case '22023': case '22P02': throw new ApiError(400, 'Invalid quest party fields.');
    case 'PT404': throw new ApiError(404, 'This quest, friend or invitation was not found.');
    case 'PT409': throw new ApiError(409, 'Accept the quest and save your profile first. A party holds at most three friends.');
    case 'PT410': throw new ApiError(410, 'This quest party is closed or its reward has ended.');
    case 'PT503': throw new ApiError(503, 'This quest’s places or reward catalogue are not ready.');
    default: databaseFailure(error);
  }
}
function publicParty(value: unknown): QuestParty {
  const row = value as QuestParty | null;
  if (!row || !Array.isArray(row.members)) databaseFailure(null);
  return { quest_id: row.quest_id, owner_id: row.owner_id,
    members: row.members.map(({ user_id, display_name, status }) => ({ user_id, display_name, status })) };
}
export function createPartyStore(client: () => SupabaseClient = getAdminClient): PartyStore {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client().rpc(name, args);
    if (error) partyFailure(error);
    return data;
  }
  const identity = (user: string, quest: string) => ({ p_user_id: z.uuid().parse(user), p_quest_id: questIdSchema.parse(quest) });
  return {
    async read(user, quest) { return publicParty(await rpc('read_quest_party', identity(user, quest))); },
    async invite(user, quest, friend) {
      return publicParty(await rpc('invite_to_quest', { ...identity(user, quest), p_member_id: z.uuid().parse(friend) }));
    },
    async remove(user, quest, friend) {
      return publicParty(await rpc('remove_quest_party_member', { ...identity(user, quest), p_member_id: z.uuid().parse(friend) }));
    },
    async incoming(user) {
      const rows = await rpc('list_quest_invites', { p_user_id: z.uuid().parse(user) });
      if (!Array.isArray(rows)) databaseFailure(null);
      return (rows as QuestInvite[]).map(({ quest_id, quest_title, invited_at, from }) => ({ quest_id, quest_title, invited_at,
        from: { user_id: from.user_id, display_name: from.display_name, friend_code: from.friend_code } }));
    },
    async respond(user, quest, owner, accept) {
      return publicParty(await rpc('respond_quest_invite', { ...identity(user, quest), p_owner_id: z.uuid().parse(owner), p_accept: z.boolean().parse(accept) }));
    },
  };
}
