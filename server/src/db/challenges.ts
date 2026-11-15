import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Challenge, ChallengeOrg, CreateChallengeRequest, ReviewChallengeRequest, QuestAcceptanceResult } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { databaseFailure, getAdminClient } from './client.js';
import { positionSchema } from './schemas.js';

const art = z.enum(['book', 'bowl', 'leaf', 'star', 'bubble', 'bolt', 'heart', 'flag']);
const palette = z.tuple([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.string().regex(/^#[0-9a-fA-F]{6}$/), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);
const text = (max: number) => z.string().trim().min(1).max(max);
export const challengeStopSchema = z.object({
  name: text(60), lore: z.string().trim().max(400), art, colors: palette.optional(),
  place: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('campus'), spot_id: text(120).refine(id => !id.startsWith('cq-'), 'Choose an official campus place.') }).strict(),
    positionSchema.extend({ kind: z.literal('point') }).strict(),
  ]),
}).strict();
export function distanceFromCampus(lat: number, lng: number) {
  const rad = Math.PI / 180, a = (lat - 34.0205) * rad, b = (lng + 118.2856) * rad;
  const h = Math.sin(a / 2) ** 2 + Math.cos(lat * rad) * Math.cos(34.0205 * rad) * Math.sin(b / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export const createChallengeSchema = z.object({
  title: text(60), blurb: z.string().trim().max(280), author: z.enum(['student', 'org']), org_id: z.uuid().optional(),
  days: z.number().int(), stops: z.array(challengeStopSchema).min(1).max(8),
  reward: z.object({ name: text(40), lore: z.string().trim().max(400), art,
    rarity: z.enum(['common', 'rare', 'epic']), colors: palette.optional() }).strict(),
}).strict().superRefine((draft, ctx) => {
  const allowed = draft.author === 'org' ? [1, 3, 7, 14, 30] : [1, 3, 7];
  if (!allowed.includes(draft.days)) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Choose a duration allowed for this author.' });
  if ((draft.author === 'org') !== !!draft.org_id) ctx.addIssue({ code: 'custom', path: ['org_id'], message: 'Only org challenges require an approved org ID.' });
  const seen = new Set<string>();
  draft.stops.forEach((stop, i) => {
    if (stop.place.kind === 'point' && distanceFromCampus(stop.place.lat, stop.place.lng) > 1500)
      ctx.addIssue({ code: 'custom', path: ['stops', i, 'place'], message: 'Pin must be within 1.5 km of campus.' });
    const key = stop.place.kind === 'campus' ? stop.place.spot_id : `${stop.place.lat.toFixed(6)},${stop.place.lng.toFixed(6)}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['stops', i], message: 'Challenge stops must be distinct.' });
    seen.add(key);
  });
});
export const challengeIdSchema = z.uuid();
export const reviewChallengeSchema = z.object({ status: z.enum(['live', 'rejected']), reason: z.string().trim().max(400).optional() }).strict();

export function challengeFailure(error: { code?: string } | null): never {
  if (error?.code === '42501') throw new ApiError(403, 'You are not allowed to perform this challenge action.');
  if (error?.code === '22023' || error?.code === '22P02' || error?.code === '23514') throw new ApiError(400, 'Invalid challenge fields.');
  if (error?.code === 'PT404') throw new ApiError(404, 'Challenge or required place not found.');
  if (error?.code === 'PT409') throw new ApiError(409, 'This challenge or quest is not ready for that action.');
  if (error?.code === 'PT410') throw new ApiError(410, 'This challenge has ended or is no longer live.');
  if (error?.code === 'PT429') throw new ApiError(429, 'Too many open challenges. Archive one before posting another.');
  if (error?.code === 'PT503') throw new ApiError(503, 'The required quest catalogue is not ready.');
  databaseFailure(error);
}
export interface ChallengeStore {
  list(userId: string, review?: boolean): Promise<Challenge[]>;
  orgs(userId: string): Promise<ChallengeOrg[]>;
  create(userId: string, input: CreateChallengeRequest): Promise<Challenge>;
  archive(userId: string, id: string): Promise<Challenge>;
  review(userId: string, id: string, input: ReviewChallengeRequest): Promise<Challenge>;
  accept(userId: string, id: string): Promise<QuestAcceptanceResult>;
  screen?(userId: string, id: string, screen: NonNullable<Challenge['ai_screen']>): Promise<Challenge>;
}
export function createChallengeStore(client: () => SupabaseClient = getAdminClient): ChallengeStore {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client().rpc(name, args);
    if (error || data === null) challengeFailure(error);
    return data as T;
  }
  return {
    list: (userId, review = false) => call('list_challenges', { p_user_id: z.uuid().parse(userId), p_review: review }),
    orgs: userId => call('list_challenge_orgs', { p_user_id: z.uuid().parse(userId) }),
    create: (userId, input) => call('create_challenge', { p_user_id: z.uuid().parse(userId), p_draft: createChallengeSchema.parse(input) }),
    archive: (userId, id) => call('archive_challenge', { p_user_id: z.uuid().parse(userId), p_id: challengeIdSchema.parse(id) }),
    review: (userId, id, input) => call('review_challenge', { p_user_id: z.uuid().parse(userId), p_id: challengeIdSchema.parse(id), p_review: reviewChallengeSchema.parse(input) }),
    accept: (userId, id) => call('accept_challenge', { p_user_id: z.uuid().parse(userId), p_id: challengeIdSchema.parse(id) }),
    screen: (userId, id, screen) => call('record_challenge_screen', { p_user_id: z.uuid().parse(userId), p_id: challengeIdSchema.parse(id),
      p_screen: z.object({ status: z.enum(['passed', 'flagged', 'unavailable']), reason: z.string().trim().min(1).max(400) }).strict().parse(screen) }),
  };
}
