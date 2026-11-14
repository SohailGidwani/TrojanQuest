# TrojanQuest

Collect stickers, discover USC, meet other Trojans.

Team skeleton: React/Vite client and Express/TypeScript server. Requires Node 22.12+.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Express on port 3001. `GET /api/health` checks the server. Put secrets in `.env` or Replit Secrets, never in Git.

See [the team build plan](docs/team-build-plan.md) for folder ownership, shared contracts, branch names and checkpoints. Product code is developed on each owner's branch; Sohail's AI work follows on `sohail/ai`.
