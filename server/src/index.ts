import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createAiRouter, aiErrorHandler } from './ai/router.js';

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createAiRouter());
  // Kartik exports his combined Express router from routes/index.ts.
  const backendUrl = new URL('./routes/index.ts', import.meta.url);
  if (existsSync(backendUrl)) {
    const { default: router } = await import(backendUrl.href);
    app.use('/api', express.json({ limit: '16kb' }), router);
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not available.' }));
  const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (existsSync(clientDirectory)) {
    app.use(express.static(clientDirectory));
    app.get('/{*path}', (_req, res) => res.sendFile(`${clientDirectory}/index.html`));
  }
  app.use(aiErrorHandler);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const app = await createApp();
  app.listen(port, '0.0.0.0', () => console.log(`TrojanQuest server listening on :${port}`));
}
