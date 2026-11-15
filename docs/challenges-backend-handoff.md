# PR #10 backend implementation and frontend handoff

The initial backend followed `docs/challenges.md`. The subsequent user-authorised integration connects live frontend flows and automated AI screening; see the dated integration record below.

## Setup

Apply migrations **007 and 008** after 001–006 in order. They are prepared SQL, not automatically applied to hosted Supabase. Configure the existing server-only service-role environment. Do not expose that key to the client.

An authorized database administrator must provision the team-approved `orgs` rows (`approved=true`), their `org_members` rows (`role='admin'` to post), and `challenge_reviewers`. There are deliberately no self-enrolment or public reviewer-assignment routes. No real identities or invented org memberships are seeded by the migration.

All challenges start **pending**, including verified orgs. The trusted reviewer must check text, pin safety and artwork/name suitability before approving. Automated AI prescreening remains a Sohail-owned integration; this backend does not claim an AI review occurred. Nothing pending can be accepted or earned.

## API contract for frontend owners

Every route uses the existing verified-USC Bearer session, `Cache-Control: no-store`, and the same safe API error shape.

- `GET /api/challenges`: live, unexpired challenges plus the current author's own records (including pending/rejected/archived history). Only active `live` rows may be played; render other own rows as status/history. Other users never receive pending records.
- `GET /api/challenges?review=true`: pending review queue, authorized team reviewers only.
- `GET /api/me/orgs`: the caller's approved organizations and membership roles. Only admins may post as an org; the database checks this again.
- `POST /api/challenges`: `CreateChallengeRequest` in `shared/types.ts`, mirroring the demo draft. An org post adds `org_id`. Server derives identity/display name, UUID, times and pending status. Returns 201 with a `Challenge`.
- `DELETE /api/challenges/:uuid`: author-only archive; earned catches and sticker metadata remain.
- `POST /api/challenges/:uuid/review`: `{status:'live'|'rejected',reason?:string}`. Provisioned reviewers only, no self-review. Publishing materializes pinned spots and their Common stickers plus the capped reward, atomically.
- `POST /api/challenges/:uuid/accept`: empty body. Returns the existing `QuestAcceptanceResult`, with `quest_id='cq-'+uuid`. This path supports 1–8 stops; authored acceptance stays 3–5.
- `POST /api/quests/:id/complete`: empty body, works for official quest IDs and `cq-<uuid>`. Reads the server-saved acceptance snapshot and the traveller's own spot catches. Returns `QuestCompletionResult` including the saved party outcome. Client-supplied stops, reward, rarity or party size are refused.

Expand UUID challenge records using the shipped prefix convention: quest `cq-<uuid>`, pinned stop `cq-<uuid>-<1-based position>`, reward `cq-<uuid>-reward`. UUIDs contain hyphens; do not pass live records through the demo localStorage parser's old short-ID regex. Fields use the shared `Challenge` types. `GET /api/spots` remains the official campus catalogue; merge active challenge pins from the challenge expansion. `/api/stickers` includes colors and keeps historical earned definitions.

For live quest completion, call `/complete` when progress reaches all stops and after acceptance if all stops were previously visited, then refresh catches. Never mint or roll the live reward in the browser. Each traveller's **own previously collected visits count**, matching current `questProgress`; there is no new order, photo or post-acceptance-only requirement. A party never substitutes someone else's visits. The existing trigger freezes party size and rolls once; a retry returns the same catch. Keep the existing `/api/catch` rejection of direct quest-source requests.

Expired/archived challenges cannot be accepted, completed or have pinned stickers collected, including via stale clients or outstanding invites. The existing 50 m catch check applies to pins. Common campus stops remain ordinary collectable places independently of a challenge. No catch or catalogue row is deleted when archiving.

## Validation

Unit/API tests cover field validation, authentication, caller-spoof prevention, error handling and RPC contracts. `node scripts/test-challenges.mjs .backend-tools/node_modules/@electric-sql/pglite/dist/index.js` exercises all migrations and real PostgreSQL RPCs in a disposable local database: review/visibility, org roles, GPS, expiry/archive, colors, party integration and idempotent own-visit completion. It never loads `.env` or connects to hosted Supabase.

Validation performed: 136 server tests, 48 client tests and the startup test pass; server typecheck/build and client production build pass. The existing `scripts/test-migration.mjs` database regression suite and the new challenge script both pass. PGlite fixtures use one connection; simultaneous transactions and hosted authenticated flows have not been exercised by these tests.

Frontend wiring in `useCollection.ts`, live pending/rejected cards, org/admin selectors and the AI prescreen hookup are handoffs to their owners; this change does not unlock the live client by pretending demo persistence is server persistence.

## Hosted deployment update — 2026-11-15

Migrations 007–008 are now applied to the configured TrojanQuest Supabase project and all seven post-deployment SQL checks passed. The hosted REST schema is refreshed and rejects an invalid actor. See [rollout verification](hosted-rollout-20261115.md) for the exact checks and remaining integration work. Earlier setup wording describes the pre-deployment state.

## Full integration update — 2026-11-15

The user authorised completing frontend and AI-owner wiring across the original ownership boundaries. Live challenge submission, status/history, archive, approved-org selectors, team review, invitation inbox, party membership and server-only quest completion are connected. The creator waits for the server; live acceptances and reward rolls are never minted in localStorage. A place-card collection control supports challenge pins using the existing fresh-location and 50 m checks.

Migration 009 persists the automated screen, restricts its recording to the server, and blocks publication without a passing result. Submission remains pending if the model is unavailable; approval re-screens the stored content after reviewer authorisation. A human must independently inspect public access, text, pins and designs; self-review remains blocked.

See [live integration record](live-integration-20261115.md) for deployment state, reproducible checks and remaining external/hardware checks. The preceding handoff sections describe the original PR and pre-integration state.
