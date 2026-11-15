import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CatchRequest, CatchResult, ConfirmPopupResult, Position } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { databaseFailure, getAdminClient } from './client.js';
import { catchRequestSchema, confirmRequestSchema } from './schemas.js';

export interface CollectionStore {
  catchSticker(userId: string, input: CatchRequest): Promise<CatchResult>;
  confirmPopup(userId: string, popupId: string, input: Position): Promise<ConfirmPopupResult>;
}

function actionFailure(error: { code?: string } | null): never {
  if (error?.code === '42501') throw new ApiError(403, 'A verified USC account is required for this action.');
  if (error?.code === '22023' || error?.code === '22P02') throw new ApiError(400, 'Invalid request fields.');
  if (error?.code === 'PT410') throw new ApiError(410, 'This challenge has ended or is no longer live.');
  if (error?.code === 'PT409') throw new ApiError(409, 'This challenge is not available yet.');
  if (error?.code === 'PT503') throw new ApiError(503, 'Seed the sticker catalogue before collecting this sticker.');
  databaseFailure(error);
}

export function createCollectionStore(client: () => SupabaseClient = getAdminClient): CollectionStore {
  return {
    async catchSticker(userId, input) {
      const actor = z.uuid().parse(userId);
      const clean = catchRequestSchema.parse(input);
      const { data, error } = await client().rpc('catch_sticker', {
        p_user_id: actor, p_source: clean.source, p_source_id: clean.source_id,
        p_lat: clean.lat, p_lng: clean.lng,
      });
      if (error || !data) actionFailure(error);
      return data as CatchResult;
    },
    async confirmPopup(userId, popupId, input) {
      const actor = z.uuid().parse(userId);
      const target = z.uuid().parse(popupId);
      const clean = confirmRequestSchema.parse(input);
      const { data, error } = await client().rpc('confirm_popup', {
        p_user_id: actor, p_popup_id: target, p_lat: clean.lat, p_lng: clean.lng,
      });
      if (error || !data) actionFailure(error);
      return data as ConfirmPopupResult;
    },
  };
}
