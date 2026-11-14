import express from 'express';

const app = express();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ ok: true }));
const port = Number(process.env.PORT ?? 3001);
app.listen(port, '0.0.0.0', () => console.log(`TrojanQuest skeleton listening on :${port}`));
