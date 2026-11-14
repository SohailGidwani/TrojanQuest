# TrojanQuest

Collect stickers, discover USC, meet other Trojans. Built for Replit with React/Vite, Express/TypeScript, Supabase and local Ollama.

## Run locally

Requires Node 22.12+ and Ollama 0.12.7+.

```sh
npm ci
cp .env.example .env
ollama pull qwen3-vl:4b-instruct
ollama serve
# In another terminal:
npm run dev
```

If Ollama is already running, skip `ollama serve`. Open http://localhost:5173. Vite proxies `/api` to Express on port 3001. Set Supabase URL/anon keys in `.env` and enable anonymous sign-ins in Supabase. The client sends its anonymous session access token as `Authorization: Bearer <token>` for all AI routes. Service-role keys remain server-only.

```sh
npm test
npm run typecheck
npm run build
npm start
```

After building, Express serves the client at http://localhost:3001. The client is the generated Vite starter; teammates own the product screens. `GET /api/health` is available without credentials.

## Sohail's implementation

- `POST /api/popups/report`: multipart `photo` (JPEG/PNG/WebP, max 5 MB), `lat`, `lng`; returns the team's accepted/rejected/merged JSON. Verifies the session before reading the upload. Three attempts per verified user per hour, including invalid reports. Photos stay in memory and are never uploaded, logged or saved by this server.
- Native Ollama `/api/chat` with JSON-schema output and Zod validation, using the Apache-2.0 Qwen3-VL 4B instruct vision model. No paid LLM API key or image generation. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [model and license](https://ollama.com/library/qwen3-vl:4b-instruct).
- Duplicate reports merge only when brand matches, pin is live, distance is at most 100 m and creation is within two hours. Merging returns the existing sticker and does not count as a confirmation. Unconfirmed pins start with at most 30 minutes; Kartik's confirm route extends them.
- `POST /api/quests/suggest`: `{ "interests": "CS freshman who studies late" }`; ranks authored quests, drops invented IDs and duplicates, appends omitted quests. Returns existing quest objects only.
- `POST /api/guide/ask`: `{ "question": "Where can I get help?" }`; returns exact, verified source excerpts with server-owned citations, or a refusal. This deliberately uses quotations to prevent unsupported paraphrases. Guide and quest routes allow 30 requests per user per hour.

Missing credentials, database helpers or content produce explicit errors rather than fake results. See [team integration handoff](docs/sohail-handoff.md).

## Replit

Import the GitHub repository, run `npm ci`, copy `.env.example` values into Replit Secrets and click Run. `.replit` runs both services in development; deployment builds the client and serves it through Express.

**Ollama networking matters:** Replit's `127.0.0.1` refers to Replit, not your laptop. Set `OLLAMA_BASE_URL` to a reachable, private Ollama host for the deployed server, or run the demo server locally. Keep the laptop awake for a local demo. Ollama cloud is not a drop-in for this implementation because its structured-output support differs. Never expose an unauthenticated Ollama port publicly.

Optional tooling: I strongly recommend `npm i -g vercel` if you want agentic Vercel features such as `vercel env pull`, `vercel deploy` and `vercel logs`. The team deployment target remains Replit.

## Ownership

Sohail owns root configuration, `server/src/index.ts` and `server/src/ai/`. Kartik owns database code, non-AI routes and shared types. Manaswi owns map/capture/app/lib; Shibhiya owns components and collection/social screens; Cal owns content, art and pitch. Skeleton-only `.gitkeep` files preserve their empty folders.
