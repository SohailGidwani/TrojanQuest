# Backend data, collection and friends (Kartik)

The backend provides shared types, seven core tables with RLS, private per-user
pop-up confirmations, read routes, sticker collection, confirmation writes,
profiles/friends, and the two database helpers consumed by Sohail's AI. Quest
reward completion remains future work.

## Set up Supabase

1. Use the team's existing project. Apply these migrations in order, once each,
   through the SQL editor or your Supabase migration workflow:
   - `supabase/migrations/202611140001_backend_foundation.sql`
   - `supabase/migrations/202611140002_collection_and_confirmation.sql`
   - `supabase/migrations/202611140003_profiles_and_friends.sql`

   Apply only migrations not already recorded as applied. The second adds private
   confirmations, reporter backfill and collection functions. The third adds
   profile/friend RPCs and a case-insensitive unique friend-code index; it stops
   rather than changing existing codes if normalized duplicates already exist.
   None deletes existing spots or catches.
   If tables already exist outside this migration history, reconcile them rather
   than resetting a shared project.
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

Every route below requires `Authorization: Bearer <verified USC session token>`:

- `GET /api/spots`: authored places, sorted by name.
- `GET /api/popups`: live, unexpired pins for the initial map load.
- `GET /api/org-drops`: events that have started and have not ended.
- `GET /api/me/catches`: the signed-in user's collection, newest first. A query
  parameter cannot select another user.

### Profiles and friends

The live UI needs a saved profile before adding friends:

1. `GET /api/me/profile` returns `{user_id,display_name,friend_code}` for the
   verified session. A missing profile returns 404; no placeholder is created.
2. `PUT /api/me/profile` with `{display_name:"Your name"}` creates or renames that
   same user's profile. Names are trimmed, 1–80 characters, and cannot contain
   control characters. Friend codes are generated server-side as 12 uppercase
   hexadecimal characters, collision-checked, and preserved through renames.
3. The final auth/profile UI should read/save the profile and pass it to the
   existing `<CollectionApp accessToken={...} profile={...} />`. This backend
   change does not edit the team-owned auth or collection screens.

All friend endpoints match the existing collection screen's live requests:

- `GET /api/friends` returns `Friend[]`, sorted by display name and then user ID.
  An empty list is `[]`, including before profile setup.
- `POST /api/friends` with `{friend_code}` returns the added `Friend`. Codes are
  trimmed and case-insensitive. Repeats return the same friend without duplicate
  links. The caller must have a profile (409 otherwise); self-add is 400, and an
  unknown code or ineligible target is 404.
- `GET /api/friends/:id/catches` returns the added friend's `Catch[]`, newest first.
  A user UUID alone does not grant access. Missing/unadded/ineligible targets all
  return 404. Empty books return `[]`.

Friend additions are directed, matching the demo's code-sharing flow: A adding
B's code lets A view B's book. B must add A's code to view A's book. There is no
automatic reverse addition, friend discovery, friend request inbox or chat.

Only the server chooses the account identity. Extra fields such as `user_id`,
`friend_id`, or a chosen `friend_code` on profile saves are rejected with 400.
Responses use the existing public `Friend`/`Catch` fields only: no email, raw GPS
or location history fields. Source IDs, variants and catch timestamps remain in
the agreed sticker-book contract. Ineligible targets are omitted from lists and
blocked on book reads, even if an older friendship row still exists.

The third migration keeps table RLS own-row-only and grants its checked RPCs only
to the service role. Browser clients cannot call them directly or enumerate other
profiles/catches. The server reuses USC authentication and SQL rechecks the actor.
The explicit no-login demo still uses its separate sample friends/local storage;
these live routes are not mounted in that mode.

### Collect a sticker

`POST /api/catch` accepts numeric coordinates and an existing source ID:

```json
{ "source": "spot", "source_id": "leavey", "lat": 34.0217, "lng": -118.2828 }
```

These example coordinates are illustrative, not seed data. Use the actual source
coordinates from the catalogue. Do not submit user IDs, variants, timestamps,
artwork or other extra fields; the server selects identity and reward details.

- Spots require distance <= 50 metres. Los Angeles local time selects morning
  [06:00,11:00), day [11:00,17:00), or night otherwise, including daylight saving.
- Pop-ups require a live/unexpired pin within 50 metres; the saved sticker and
  `special` variant are returned. Pop-up IDs must be UUIDs.
- Org drops require a started, unended event within 50 metres and award their
  configured sticker with the `special` variant.
- Success is 200 `{ok:true,sticker,variant,already_caught}`. A repeat visit in the
  same variant returns `already_caught:true` without another collection entry.
  A spot's different time variants can each be collected once, across all dates.
- Too far preserves the team's agreed 200 `{ok:false,reason:"too_far"}` shape.
  Check `ok` even on 200. Missing sources return 404, ended events 410, and future
  org drops 409. Other failures include `{ok:false,reason,error}`.
- Quest-source requests return 409 `quest_not_available`; no quest reward is
  granted while ordering/photo-proof decisions are open. The demo frontend's
  illustrative quest rewards do not grant real catches.

After a successful catch, refresh `/api/me/catches` to update the sticker book.
The frontend's demo visit picker does not invoke this real endpoint; the final
GPS/map flow should call it with a verified session.

### Confirm a pop-up

`POST /api/popups/:id/confirm` accepts `{lat,lng}` with numeric coordinates.
It requires the same 50 m proximity and a live/unexpired pin. Success returns
200 `{expires_at,confirmations,already_confirmed}`. Each new verified account adds
exactly 30 minutes to the existing expiry and increments the count once. Repeat
confirmations return the current values with `already_confirmed:true`. The first
reporter already counts as a confirmation and cannot extend their own timer.

Too far is 409, missing pins 404, and expired pins 410, with `{ok:false,reason,error}`.
Expired pins cannot be revived. Malformed bodies, extra fields and non-UUID pin
IDs return 400. A timer extension updates the published `popups` row so connected
Realtime clients can refresh their countdown.

Both write routes enforce their rules in SQL transactions. Catch uniqueness is
enforced by the existing unique constraint, and confirmation locks the pin while
checking expiry/inserting the account record/updating its count. Coordinates are
used only for the check and are never saved in catches or confirmations. Browser
GPS is client-supplied evidence; this is not spoof-proof location verification.

Real missing configuration produces 503 errors; there are no fake database results.

`server/src/db/popups.ts` exports `createPopup()` and `findNearbyPopup()` with the
existing AI signatures. The SQL RPC searches normalized brands within the given
radius (up to 100 m), since the supplied timestamp, and only live/unexpired pins.
Creation locks by brand and rechecks within 100 m/two hours in one transaction.
Concurrent creation returns the existing row; the current AI interface may still
label that race as a new report (`merged_into: null`). Clients should upsert map
pins by ID. A richer helper result requires agreement with Sohail.

Only new accepted pop-ups create a private `reports` entry. Rejected/merged report
audit records still need a later agreed interface. Per-user confirmations are now
recorded separately and never exposed through the public pin shape.

Realtime publishes `public.popups`. Reporter identity lives in `reports` and
confirmation identity in `popup_confirmations`; neither has client grants or is
published. Subscribe after USC authentication;
load existing pins through `/api/popups` and remove pins at `expires_at` even if
there is no new database event. Expiry is checked on read; there is no cron job.

All tables enable RLS. Verified USC users can read places, public pins and
org drops, and only their own profile, catches and friendship rows. Browser writes
are disabled. The write routes validate the session; SQL also rechecks that the
actor is a confirmed, non-anonymous USC user. Friend-book access is available only
through the relationship-checked server route, not by widening browser RLS.

## Verify

The root test command includes AI, backend and collection frontend logic tests:

```sh
npm test
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
RLS, direct-write denial, all three migrations, initial reporter backfill, collection
eligibility, duplicate requests, time boundaries, confirmation extensions, and
profile/code creation and collisions, directed friend authorization, ineligible
targets, private response fields and the publication table list. PGlite queues
queries on one database connection;
multi-connection contention is not exercised by these tests. They cannot test
hosted email delivery, PostgREST configuration or actual WebSocket delivery.

Quest ordering/photo proof, avatars, NPCs, organiser quest creation and sticker
wagers are outside this foundation. No changes to team-owned files are required.
