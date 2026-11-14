import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ApiError, type PopupStore } from './contracts.js';
import { authenticate, getStore } from './integrations.js';
import { loadGuidePages, loadQuests } from './content.js';
import { Ollama } from './ollama.js';
import { answerGuide, reportPopup, suggestQuests } from './service.js';

export interface RouterDependencies {
  authenticate: (token: string) => Promise<string>;
  getStore: () => Promise<PopupStore>;
  model: Ollama;
  contentDirectory: string;
  guideDirectory: string;
}
const defaultContent = fileURLToPath(new URL('../../../content/', import.meta.url));
const coordinate = (min: number, max: number) => z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(min).max(max));
const coordinates = z.object({ lat: coordinate(-90, 90), lng: coordinate(-180, 180) });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 100 } });
function isImage(file: Express.Multer.File) {
  const b = file.buffer;
  return (file.mimetype === 'image/jpeg' && b.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    || (file.mimetype === 'image/png' && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (file.mimetype === 'image/webp' && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
}

export function createAiRouter(overrides: Partial<RouterDependencies> = {}) {
  const deps: RouterDependencies = { authenticate, getStore, model: new Ollama(), contentDirectory: defaultContent, guideDirectory: join(overrides.contentDirectory ?? defaultContent, 'guide-pages'), ...overrides };
  const router = Router();
  // shortcut: limits reset on restart and apply to one server; move to shared storage when scaling.
  const attempts = new Map<string, { count: number; until: number }>();
  const limit = (kind: string, max: number): RequestHandler => (_req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = `${kind}:${res.locals.userId}`;
    const entry = attempts.get(key) ?? { count: 0, until: now + 3_600_000 };
    attempts.set(key, entry);
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return next(new ApiError(429, 'Hourly request limit reached. Please try again later.'));
    }
    next();
  };
  const requireUser: RequestHandler = async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new ApiError(401, 'Sign in anonymously and send your Bearer token.');
    try { res.locals.userId = await deps.authenticate(token); }
    catch (error) { throw error instanceof ApiError ? error : new ApiError(401, 'Invalid or expired session.'); }
    next();
  };
  router.post('/popups/report', requireUser, limit('report', 3), upload.single('photo'), async (req, res) => {
    try {
      const position = coordinates.parse(req.body);
      if (!req.file || !isImage(req.file)) throw new ApiError(400, 'Attach a JPEG, PNG or WebP photo as photo.');
      const result = await reportPopup({ ...position, photo: req.file.buffer, userId: res.locals.userId }, { model: deps.model, store: await deps.getStore() });
      res.json(result);
    } finally {
      // Release the upload; photos are never written to storage or logs.
      if (req.file) req.file.buffer = Buffer.alloc(0);
    }
  });
  router.post('/quests/suggest', requireUser, limit('quest', 30), express.json({ limit: '8kb' }), async (req, res) => {
    const { interests } = z.object({ interests: z.string().trim().min(1).max(1000) }).parse(req.body);
    res.json(await suggestQuests(interests, await loadQuests(deps.contentDirectory), deps.model));
  });
  router.post('/guide/ask', requireUser, limit('guide', 30), express.json({ limit: '8kb' }), async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(1).max(1000) }).parse(req.body);
    res.json(await answerGuide(question, await loadGuidePages(deps.guideDirectory), deps.model));
  });
  return router;
}

export const aiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request fields.' }); return; }
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 5 MB or smaller.' : 'Send one photo plus lat and lng.' }); return;
  }
  if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON.' }); return; }
  if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large.' }); return; }
  console.error('API request failed:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ error: 'The request could not be completed.' });
};
