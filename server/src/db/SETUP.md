# Backend foundation (Kartik)

This branch adds shared types, seven tables with RLS, read routes, and the two
database helpers consumed by Sohail's AI. It does not implement catches,
confirmation writes, profiles/friend management, or quest completion yet.

## Set up Supabase

1. Use the team's existing project. Apply
   `supabase/migrations/202611140001_backend_foundation.sql` once through the SQL
   editor or your Supabase migration workflow. It creates new tables; it does not
   delete or reset existing data. If those tables already exist, reconcile their
   migrations first rather than resetting a shared project.
2. For database-backed operation, use the verified USC email OTP configuration in
   the repository README. Sign-in setup is currently deferred by the team; the
   separate `npm run dev:demo` workbench uses in-memory data and does not mount
   these database routes.
3. Put the server-side privileged key in `SUPABASE_SERVICE_ROLE_KEY` in the root
   `.env`. Do not put it in a `VITE_` variable. If that value is blank,
   URL/publishable keys alone cannot run these write helpers.
4. Ask Cal for `content/spots.json`. Do not invent coordinates as real content.
   From the repository root:

   ```sh
   node --import tsx --env-file=.env scripts/seed.ts --dry-run
   node --import tsx --env-file=.env scripts/seed.ts
   ```

   Use `--file <path>` to validate another spots file. Seeding updates matching IDs
   and preserves other rows; it never deletes spots.
5. Run `npm run dev`. Restart the server once after first adding the route module.

## API handoff

All four read routes require `Authorization: Bearer <verified USC session token>`:

- `GET /api/spots`: authored places, sorted by name.
- `GET /api/popups`: live, unexpired pins for the initial map load.
- `GET /api/org-drops`: events that have started and have not ended.
- `GET /api/me/catches`: the signed-in user's collection, newest first. A query
  parameter cannot select another user. Until catch writes land, this is empty.

Real missing configuration produces 503 errors; there are no fake database results.

`server/src/db/popups.ts` exports `createPopup()` and `findNearbyPopup()` with the
existing AI signatures. The SQL RPC searches normalized brands within the given
radius (up to 100 m), since the supplied timestamp, and only live/unexpired pins.
Creation locks by brand and rechecks within 100 m/two hours in one transaction.
Concurrent creation returns the existing row; the current AI interface may still
label that race as a new report (`merged_into: null`). Clients should upsert map
pins by ID. A richer helper result requires agreement with Sohail.

Only new accepted pop-ups create a private `reports` entry. Rejected/merged report
audit records and per-user confirmation records need a later agreed interface.

Realtime publishes `public.popups`. Reporter identity lives in `reports`, which
has no client grants and is not published. Subscribe after USC authentication;
load existing pins through `/api/popups` and remove pins at `expires_at` even if
there is no new database event. Expiry is checked on read; there is no cron job.

All seven tables enable RLS. Verified USC users can read places, public pins and
org drops, and only their own profile, catches and friendship rows. Browser writes
are disabled. Future server write routes must validate the user and enforce game
rules before using the privileged client. Friend-book access is not enabled yet.

## Verify

The root test command currently only discovers Sohail's AI tests. Run both suites:

```sh
npm test
node --import tsx --test server/src/db/*.test.ts server/src/routes/*.test.ts
npm run typecheck
npm run build
```

To check the SQL and access policies against a disposable in-memory PostgreSQL
database (never the shared Supabase project), install the optional PGlite test
tool outside the application dependencies:

```sh
npm install --prefix .backend-tools --no-save --package-lock=false @electric-sql/pglite
node scripts/test-migration.mjs .backend-tools/node_modules/@electric-sql/pglite/dist/index.js
```

Keep `.backend-tools/` and any local npm cache out of commits. The migration test
creates isolated auth fixtures, checks privileged RPCs, distance/expiry/deduplication,
RLS, direct-write denial and the publication table list. It cannot test Supabase's
hosted email delivery, PostgREST configuration or actual WebSocket delivery.

Quest ordering/photo proof, avatars, NPCs, organiser quest creation and sticker
wagers are outside this foundation. No changes to team-owned files are required.
