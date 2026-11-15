import { Router } from 'express';
import { ApiError } from '../ai/contracts.js';
import { authenticate } from '../ai/integrations.js';
import { createReadStore, type ReadStore } from '../db/read.js';

export interface BackendDependencies {
  authenticate(token: string): Promise<string>;
  store: ReadStore;
}
export function createBackendRouter(overrides: Partial<BackendDependencies> = {}) {
  const deps: BackendDependencies = { authenticate, store: createReadStore(), ...overrides };
  const router = Router();
  // Authenticate only owned endpoints; unknown paths should keep the app's 404 behavior.
  for (const path of ['/spots', '/popups', '/org-drops', '/me/catches']) {
    router.get(path, async (req, res, next) => {
      const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (!token) throw new ApiError(401, 'Sign in with your USC email and send your Bearer token.');
      res.locals.userId = await deps.authenticate(token);
      res.set('Cache-Control', 'no-store');
      next();
    });
  }
  router.get('/spots', async (_req, res) => { res.json(await deps.store.spots()); });
  router.get('/popups', async (_req, res) => { res.json(await deps.store.popups()); });
  router.get('/org-drops', async (_req, res) => { res.json(await deps.store.orgDrops()); });
  router.get('/me/catches', async (_req, res) => { res.json(await deps.store.catches(res.locals.userId)); });
  return router;
}

export default createBackendRouter();
