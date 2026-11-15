import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CollectionFailureReason } from '../../../shared/types.js';
import { ApiError } from '../ai/contracts.js';
import { authenticate } from '../ai/integrations.js';
import { createReadStore, type ReadStore } from '../db/read.js';
import { createCollectionStore, type CollectionStore } from '../db/collection.js';
import { addFriendSchema, catchRequestSchema, confirmRequestSchema, questIdSchema, saveProfileSchema } from '../db/schemas.js';
import { createFriendsStore, type FriendsStore } from '../db/friends.js';
import { createStickerStore, type StickerStore } from '../db/stickers.js';
import { createQuestStore, type QuestStore } from '../db/quests.js';
import { createPartyStore, type PartyStore } from '../db/parties.js';
import { inviteToQuestSchema, respondToQuestInviteSchema } from '../db/schemas.js';
import { createChallengeStore, createChallengeSchema, challengeIdSchema, reviewChallengeSchema, type ChallengeStore } from '../db/challenges.js';
import { createQuestRewardStore, type QuestRewardStore } from '../db/quest-rewards.js';

export interface BackendDependencies {
  authenticate(token: string): Promise<string>;
  store: ReadStore;
  actions: CollectionStore;
  social: FriendsStore;
  stickers: StickerStore;
  quests: QuestStore;
  parties: PartyStore;
  challenges: ChallengeStore;
  rewards: QuestRewardStore;
}
const failureDetails: Record<CollectionFailureReason, { status: number; error: string }> = {
  too_far: { status: 409, error: 'Move within 50 metres of this location.' },
  not_found: { status: 404, error: 'This location could not be found.' },
  not_started: { status: 409, error: 'This event or sticker edition is not available yet.' },
  expired: { status: 410, error: 'This event or sticker edition has ended.' },
  quest_not_available: { status: 409, error: 'Quest reward collection is not available yet.' },
};
export function createBackendRouter(overrides: Partial<BackendDependencies> = {}) {
  const deps: BackendDependencies = {
    authenticate, store: createReadStore(), actions: createCollectionStore(), social: createFriendsStore(),
    stickers: createStickerStore(), quests: createQuestStore(), parties: createPartyStore(),
    challenges: createChallengeStore(), rewards: createQuestRewardStore(), ...overrides,
  };
  const router = Router();
  const requireUser: RequestHandler = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new ApiError(401, 'Sign in with your USC email and send your Bearer token.');
    res.locals.userId = await deps.authenticate(token);
    next();
  };
  // Authenticate only owned endpoints; unknown paths should keep the app's 404 behavior.
  for (const path of ['/spots', '/popups', '/org-drops', '/me/catches']) {
    router.get(path, requireUser);
  }
  router.get('/spots', async (_req, res) => { res.json(await deps.store.spots()); });
  router.get('/popups', async (_req, res) => { res.json(await deps.store.popups()); });
  router.get('/org-drops', async (_req, res) => { res.json(await deps.store.orgDrops()); });
  router.get('/me/catches', async (_req, res) => { res.json(await deps.store.catches(res.locals.userId)); });
  router.get('/stickers', requireUser, async (_req, res) => { res.json(await deps.stickers.list()); });
  router.get('/me/quests', requireUser, async (_req, res) => { res.json(await deps.quests.list(res.locals.userId)); });
  router.get('/me/orgs', requireUser, async (_req, res) => { res.json(await deps.challenges.orgs(res.locals.userId)); });
  router.get('/challenges', requireUser, async (req, res) => {
    const query = z.object({ review: z.enum(['true', 'false']).optional() }).strict().parse(req.query);
    res.json(await deps.challenges.list(res.locals.userId, query.review === 'true'));
  });
  router.post('/challenges', requireUser, express.json({ limit: '24kb' }), async (req, res) => {
    res.status(201).json(await deps.challenges.create(res.locals.userId, createChallengeSchema.parse(req.body)));
  });
  router.delete('/challenges/:id', requireUser, async (req, res) => {
    res.json(await deps.challenges.archive(res.locals.userId, challengeIdSchema.parse(req.params.id)));
  });
  router.post('/challenges/:id/review', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    res.json(await deps.challenges.review(res.locals.userId, challengeIdSchema.parse(req.params.id), reviewChallengeSchema.parse(req.body)));
  });
  router.post('/challenges/:id/accept', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.json(await deps.challenges.accept(res.locals.userId, challengeIdSchema.parse(req.params.id)));
  });
  router.post('/quests/:id/complete', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.json(await deps.rewards.complete(res.locals.userId, questIdSchema.parse(req.params.id)));
  });
  router.get('/quests/:id/party', requireUser, async (req, res) => {
    res.json(await deps.parties.read(res.locals.userId, questIdSchema.parse(req.params.id)));
  });
  router.post('/quests/:id/party', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    const { friend_id } = inviteToQuestSchema.parse(req.body);
    res.json(await deps.parties.invite(res.locals.userId, questIdSchema.parse(req.params.id), friend_id));
  });
  router.delete('/quests/:id/party/:friendId', requireUser, async (req, res) => {
    res.json(await deps.parties.remove(res.locals.userId, questIdSchema.parse(req.params.id), z.uuid().parse(req.params.friendId)));
  });
  router.get('/me/quest-invites', requireUser, async (_req, res) => { res.json(await deps.parties.incoming(res.locals.userId)); });
  router.post('/quest-invites/:questId/:ownerId', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    const { accept } = respondToQuestInviteSchema.parse(req.body);
    res.json(await deps.parties.respond(res.locals.userId, questIdSchema.parse(req.params.questId), z.uuid().parse(req.params.ownerId), accept));
  });
  router.post('/quests/:id/accept', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.json(await deps.quests.accept(res.locals.userId, questIdSchema.parse(req.params.id)));
  });
  router.post('/catch', requireUser, express.json({ limit: '16kb' }), async (req, res) => {
    const result = await deps.actions.catchSticker(res.locals.userId, catchRequestSchema.parse(req.body));
    // Preserve the agreed 200 {ok:false,reason:'too_far'} contract for map catches.
    if (result.ok || result.reason === 'too_far') { res.json(result); return; }
    const { status, error } = failureDetails[result.reason];
    res.status(status).json({ ...result, error });
  });
  router.post('/popups/:id/confirm', requireUser, express.json({ limit: '16kb' }), async (req, res) => {
    const popupId = z.uuid().parse(req.params.id);
    const result = await deps.actions.confirmPopup(res.locals.userId, popupId, confirmRequestSchema.parse(req.body));
    if (!result.ok) {
      const { status, error } = failureDetails[result.reason];
      res.status(status).json({ ...result, error });
      return;
    }
    const { expires_at, confirmations, already_confirmed } = result;
    res.json({ expires_at, confirmations, already_confirmed });
  });
  router.get('/me/profile', requireUser, async (_req, res) => {
    res.json(await deps.social.profile(res.locals.userId));
  });
  router.put('/me/profile', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    res.json(await deps.social.saveProfile(res.locals.userId, saveProfileSchema.parse(req.body)));
  });
  router.get('/friends', requireUser, async (_req, res) => {
    res.json(await deps.social.list(res.locals.userId));
  });
  router.post('/friends', requireUser, express.json({ limit: '4kb' }), async (req, res) => {
    const { friend_code } = addFriendSchema.parse(req.body);
    res.json(await deps.social.add(res.locals.userId, friend_code));
  });
  router.get('/friends/:id/catches', requireUser, async (req, res) => {
    res.json(await deps.social.catches(res.locals.userId, z.uuid().parse(req.params.id)));
  });
  return router;
}

export default createBackendRouter();
