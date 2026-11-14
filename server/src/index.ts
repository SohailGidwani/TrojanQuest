import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createAiRouter, aiErrorHandler } from './ai/router.js';
import { createDemoStore, demoEnabled } from './ai/demo.js';

export async function createApp(env: NodeJS.ProcessEnv = process.env) {
  const demoMode = demoEnabled(env);
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: demoMode ? 'local-demo' : 'authenticated' }));
  if (demoMode) {
    const store = createDemoStore();
    app.get('/dev/ai', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(fileURLToPath(new URL('./ai/workbench.html', import.meta.url))));
    app.get('/dev/ai/popups', (_req, res) => res.set('Cache-Control', 'no-store').json(store.list()));
    app.use('/api', createAiRouter({ demoMode: true, getStore: async () => store }));
  } else {
    app.use('/api', createAiRouter());
  }
  app.use('/dev', (_req, res) => res.status(404).end());
  // Kartik exports his combined Express router from routes/index.ts.
  const backendUrl = new URL('./routes/index.ts', import.meta.url);
  if (!demoMode && existsSync(backendUrl)) {
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
  const host = demoEnabled() ? '127.0.0.1' : '0.0.0.0';
  app.listen(port, host, () => console.log(`TrojanQuest server listening on ${host}:${port}${demoEnabled() ? ' (local demo, sign-in paused)' : ''}`));
}
