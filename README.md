# TrojanQuest

Collect stickers, discover USC, meet other Trojans. Built with React/Vite, Express/TypeScript, Supabase and local Ollama.

## Work without sign-in

Sign-in/SMTP setup is paused. To test Sohail's AI features locally:

```sh
npm ci
ollama pull qwen3-vl:4b-instruct
npm run dev:demo
```

Keep Ollama running. Open http://127.0.0.1:5173 for the clue-led campus hunt, sticker book, quests, friends and guide preview. Your first clue leads to Bovard Auditorium. Click **Start finding** for browser GPS, or **Try a simulated walk** → **At the venue** to test from your room. A fresh, accurate nearby fix unlocks its time-of-day sticker; demo collection stays in this browser. Try a day visit to Philosophy Library to finish a demo quest, and TQRINA to add a friend. See [the hunt notes](docs/hunt-plan.md), [the frontend handoff](docs/shibhiya-handoff.md) and [the short collection walkthrough](docs/previews/collection-walkthrough.mp4).

`npm run dev` and `npm run dev:demo` use a Node launcher for Windows, macOS and Linux; there are no shell-specific environment assignments and no new dependency. Normal startup keeps authentication. Demo startup stays loopback-only.

The hunt displays approximate distance and a north-up bearing, not phone-relative precision finding. It needs location permission and HTTPS on a real phone (localhost works on this computer). Accuracy must be ±25 m or better, the fix must be at most 30 seconds old, and distance plus uncertainty must fit within 50 m. Live collection still goes through Kartik's authoritative `/api/catch` route. No location trail is stored; OpenStreetMap tiles load only after GPS or simulation is enabled.

The separate AI workbench remains at http://127.0.0.1:5173/dev/ai. Upload a pop-up photo to generate a sticker and temporary pin; report it again to test merging, or try an unrelated photo to test rejection. The real guide still needs Cal's saved USC pages; its UI displays a clear unavailable state until they exist.

Demo mode uses real Ollama inference and an isolated in-memory popup store, requires no Supabase credentials, and shares one local demo identity. Pins and hourly limits reset when the server restarts. It bypasses sign-in only with `DEMO_MODE=true` and `NODE_ENV=development`; both dev servers bind to loopback. Demo mode refuses to start outside development and does not mount Kartik's production database routes. The regular `npm run dev` keeps the USC session checks.

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

If Ollama is already running, skip `ollama serve`. Open http://localhost:5173. Vite proxies `/api` to Express on port 3001. Set Supabase URL/publishable keys in `.env` and configure USC email OTP as described below. The client sends its verified USC session access token as `Authorization: Bearer <token>` for all AI routes. Service-role keys remain server-only.

```sh
npm test
npm run typecheck
npm run build
npm start
```

After building, Express serves the client at http://localhost:3001. The hunt and collection/social screens are implemented; Kartik's catch, confirmation, profile and friend routes are now merged. Live data still needs the three hosted migrations, private server-side database credentials and Cal's content. `GET /api/health` is available without credentials. Normal operation requires a verified USC session; use the explicit local demo while sign-in is deferred.

## Sohail's implementation

- `POST /api/popups/report`: multipart `photo` (JPEG/PNG/WebP, max 5 MB), `lat`, `lng`; returns the team's accepted/rejected/merged JSON. Requires a verified `@usc.edu` email session before reading the upload. Three attempts per verified user per hour, including invalid reports. Non-pop-up photos are rejected without database access; accepted reports require Kartik's helpers. Photos stay in memory and are never uploaded, logged or saved by this server.
- Native Ollama `/api/chat` with JSON-schema output and Zod validation, using the Apache-2.0 Qwen3-VL 4B instruct vision model. No paid LLM API key or image generation. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [model and license](https://ollama.com/library/qwen3-vl:4b-instruct).
- Duplicate reports merge only when brand matches, pin is live, distance is at most 100 m and creation is within two hours. Merging returns the existing sticker and does not count as a confirmation. Unconfirmed pins start with at most 30 minutes; Kartik's confirm route extends them.
- `POST /api/quests/suggest`: `{ "interests": "CS freshman who studies late" }`; ranks authored quests, drops invented IDs and duplicates, appends omitted quests. Returns existing quest objects only.
- `GET /api/quests`: returns Cal's authored quest catalogue without invoking the LLM.
- `POST /api/guide/ask`: `{ "question": "Where can I get help?" }`; returns exact, verified source excerpts with server-owned citations, or a refusal. This deliberately uses quotations to prevent unsupported paraphrases. Guide and quest routes allow 30 requests per user per hour.

Missing credentials, database helpers or content produce explicit errors rather than fake results. See [team integration handoff](docs/sohail-handoff.md).

## Supabase setup (deferred)

Put the project's URL and publishable (or legacy anon) key in your local `.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Keep anonymous sign-ins disabled. Enable the Email provider and email confirmation in Supabase Auth. Once custom SMTP is configured to unlock template editing, include `{{ .Token }}` in both Confirm signup and Magic Link templates so the message contains an OTP code. The frontend uses Supabase's built-in `signInWithOtp({ email })`, then `verifyOtp({ email, token, type: 'email' })`; no custom OTP server or USC SSO is required. Use an exact `@usc.edu` address. [Email OTP setup](https://supabase.com/docs/guides/auth/auth-email-passwordless).

AI routes validate sessions through Supabase and reject anonymous users, unverified email, and addresses outside `@usc.edu`. No database password or service-role key is needed by this auth code. Kartik owns migrations, USC-aware row-level security policies, database helpers and Realtime publication for `popups`; those are still needed for persisted live pins. To restrict account creation in Supabase itself, configure a [Before User Created domain hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook). The API checks alone do not restrict direct database access.

For sending OTPs to arbitrary USC students, configure custom SMTP in Supabase; its built-in sender is restricted to authorized project-team addresses. A privileged key, if Kartik's server-side helpers need one, belongs only in `SUPABASE_SERVICE_ROLE_KEY`, never any `VITE_` variable. Do not send OTPs through the AI model.

## Hosting

No hosting provider is required for local development. Build with `npm run build`, then serve the app with `npm start`. The original team plan is preserved in `docs/team-build-plan.md`; its Replit and anonymous-auth requirements have been superseded by local hosting and USC email OTP.

If you host Express separately from Ollama, set `OLLAMA_BASE_URL` to a reachable, private Ollama host; `127.0.0.1` always refers to the server's own machine. Keep the laptop awake for a local demo. Ollama cloud is not a drop-in for this implementation because its structured-output support differs. Never expose an unauthenticated Ollama port publicly.

Optional tooling: I strongly recommend `npm i -g vercel` if you want agentic Vercel features such as `vercel env pull`, `vercel deploy` and `vercel logs`.

## Ownership

Sohail owns root configuration, `server/src/index.ts` and `server/src/ai/`, and has taken over Shibhiya's components and collection/social screens with user authorization. Kartik owns database code, non-AI routes and shared types. Manaswi owns map/capture/app/lib; Cal owns content, art and pitch. Skeleton-only `.gitkeep` files preserve their empty folders.
