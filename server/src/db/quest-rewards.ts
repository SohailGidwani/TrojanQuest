import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { QuestCompletionResult } from '../../../shared/types.js';
import { getAdminClient } from './client.js';
import { questIdSchema } from './schemas.js';
import { challengeFailure } from './challenges.js';

export interface QuestRewardStore { complete(userId: string, questId: string): Promise<QuestCompletionResult> }
export function createQuestRewardStore(client: () => SupabaseClient = getAdminClient): QuestRewardStore {
  return {
    async complete(userId, questId) {
      const { data, error } = await client().rpc('complete_accepted_quest', {
        p_user_id: z.uuid().parse(userId), p_quest_id: questIdSchema.parse(questId),
      });
      if (error || data === null) challengeFailure(error);
      return data as QuestCompletionResult;
    },
  };
}
