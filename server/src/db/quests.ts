import type { SupabaseClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { QuestAcceptance, QuestAcceptanceResult } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { databaseFailure, getAdminClient } from './client.js';
import { questIdSchema } from './schemas.js';
import { loadAuthoredQuests } from './quest-content.js';

export interface QuestStore {
  list(userId: string): Promise<QuestAcceptance[]>;
  accept(userId: string, questId: string): Promise<QuestAcceptanceResult>;
}
function acceptanceFailure(error: { code?: string } | null): never {
  if (error?.code === '42501') throw new ApiError(403, 'A verified USC account is required for this action.');
  if (error?.code === '22023' || error?.code === '22P02') throw new ApiError(400, 'Invalid quest fields.');
  if (error?.code === 'PT409') throw new ApiError(409, 'This quest reward is not available yet.');
  if (error?.code === 'PT410') throw new ApiError(410, 'This quest reward has ended.');
  if (error?.code === 'PT503') throw new ApiError(503, 'Seed this quest’s spots and reward catalogue before accepting it.');
  databaseFailure(error);
}
const defaultFile = fileURLToPath(new URL('../../../content/quests.json', import.meta.url));

export function createQuestStore(client: () => SupabaseClient = getAdminClient, questFile = defaultFile): QuestStore {
  return {
    async list(userId) {
      const actor = z.uuid().parse(userId);
      const { data, error } = await client().rpc('list_quest_acceptances', { p_user_id: actor });
      if (error || !Array.isArray(data)) acceptanceFailure(error);
      return (data as QuestAcceptance[]).map(({ quest_id, accepted_at }) => ({ quest_id, accepted_at }));
    },
    async accept(userId, questId) {
      const actor = z.uuid().parse(userId);
      const id = questIdSchema.parse(questId);
      let quests;
      try { quests = await loadAuthoredQuests(questFile); }
      catch { throw new ApiError(503, 'The authored quest catalogue is missing or invalid.'); }
      const quest = quests.find(item => item.id === id);
      if (!quest) throw new ApiError(404, 'This quest is not in the authored catalogue.');
      const { data, error } = await client().rpc('accept_authored_quest', { p_user_id: actor, p_quest: quest });
      if (error || !data) acceptanceFailure(error);
      const { quest_id, accepted_at, already_accepted } = data as QuestAcceptanceResult;
      return { quest_id, accepted_at, already_accepted };
    },
  };
}
