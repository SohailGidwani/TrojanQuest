# Challenges: backend spec

**Current status (2026-11-15):** migrations 007–009 and the authenticated backend are deployed to hosted Supabase. The live client supports submission/status/history/archive, approved-org selection, separate-account review, acceptance and server-verified completion. Automated screening is recorded and must pass before independent human approval. The local demo remains explicitly browser-local and publishes immediately only in that demo.

**For:** Kartik and the frontend/AI team. The user subsequently authorised completing the integration across the original folder ownership boundaries. See [the integration/deployment record](live-integration-20261115.md) and [API contract](challenges-backend-handoff.md) for behaviour and verification limits.

## The feature

**Challenges** is its own tab (`/challenges`) for **limited-time quests made by students and student orgs**. The Quests tab keeps the official, authored quests.

Anyone can post a challenge (**Post a challenge** → `/challenges/new`):

- **Post as** yourself (your display name) or your student org.
- **Runs for:**
  - students: 1, 3 or 7 days;
  - orgs: 1, 3, 7, 14 or 30 days.

  The challenge starts when posted. After it ends it can't be accepted, and its stickers can't be earned.
- **Stops (at least 1, at most 8).** Each stop is either an existing campus place, or a pin dropped within 1.5 km of the University Park campus center.
- **A name and optional lore** (up to 400 characters) for every stop.
- **A sticker for each pinned stop**, always Common. A campus-place stop awards that place's own sticker.
- **A reward sticker:** name, design, optional lore, and a rarity of **Common, Rare or Epic** only. Quest-party bonuses can still bump it to Legendary.
- **Design with AI**, for the reward and for any pinned stop: describe the sticker and the local model picks one of the 8 built-in designs, a 3-color palette (background, highlight, outline), a name and lore. There's no image generation, by design; see the README.

The client logic and tests are in `client/src/components/customQuests.ts` and `customQuests.test.ts`: `validateDraft`, `durations`, `normalizePalette` and `timeLeft`. The server must enforce the same rules itself.

A challenge is turned into the shapes the app already uses:
- the challenge becomes a `Quest` with id `cq-<id>`;
- each pinned stop becomes a `Spot` with id `cq-<id>-<n>` and its own sticker;
- the reward becomes a catalogue sticker `cq-<id>-reward`, with an optional `colors` palette.

The `cq-` prefix is how the client separates Challenges from official Quests. Keep it.

## AI sticker designer (built; Sohail's area)

`POST /api/stickers/design` lives in `server/src/ai/router.ts` and `service.ts` (`designSticker`).

- **Request body:** `{ prompt (3–300 chars), role: 'reward' | 'stop', quest_title?, stop_name? }`.
- **Response:** `{ accepted, reject_reason, sticker: { key, name, colors[2..3], lore } | null }`.
- **Login and limits:** same session check as the other AI routes, and 20 requests per user per hour.
- **Temperature 0.8**, so "Try again" gives a fresh design. The other AI tasks still run at 0.
- **Refusals:** the prompt rejects copyrighted characters, real people, brands and logos, and hateful, sexual, violent or harassing ideas. A test request for a soda brand's logo was refused.
- **Speed:** about 10 seconds warm. The first call after the model loads can hit the 120-second Ollama timeout, and the UI warns about that.

## What the server still needs (Kartik)

1. **Org membership.**
   - Add `orgs` and `org_members (org_id, user_id, role)`.
   - Only org admins can post as an org. Start with a team-approved list of orgs, since anyone could claim to be one.
   - Students post as themselves, using their profile's display name.
2. **Tables.**
   - `challenges (id, author_kind, author_user_id, org_id?, title, blurb, status, starts_at, ends_at, created_at, reviewed_by, reviewed_at)`, with `status` one of `pending | live | rejected | archived`.
   - `challenge_stops (challenge_id, position, name, lore, spot_id | lat,lng, art, colors?)`.
   - Reward rows go into `stickers` with `cq-` keys and an optional `colors jsonb`.
   - Check `ends_at - starts_at` against the author kind's maximum.
3. **Review.** New challenges start `pending`.
   - Pre-screen the text, pins and sticker names with the AI pipeline, then have the team approve.
   - Consider letting verified org challenges skip manual review.
   - Only `live` challenges whose `ends_at` is in the future appear to others.
4. **Expiry enforced on the server.**
   - Accepting or completing a challenge after `ends_at` must fail, like exclusive stickers outside their window.
   - Pinned stops need to be in `spots` (or an equivalent table) so `POST /api/catch` applies the same 50 m and time-of-day rules.
5. **Routes:**

   | Method | Path | Who | Purpose |
   |---|---|---|---|
   | GET | `/api/challenges` | signed in | Live, unexpired challenges, plus your own pending ones |
   | POST | `/api/challenges` | student / org admin | Post (starts `pending`) |
   | DELETE | `/api/challenges/:id` | author | Archive; earned stickers stay with students |
   | POST | `/api/challenges/:id/review` | team | Approve or reject |

6. **Shared types.**
   - Add `Challenge`, `ChallengeStop` and `CreateChallengeRequest`, mirroring `CustomQuest` and `QuestDraft`.
   - Add `colors?: string[]` to `StickerDefinition`.
   - Optionally add `by` / `ends_at` to `Quest` so cards can render without the extra lookup.

The existing `accept_authored_quest` function requires 3 to 5 stops. Challenges allow 1 to 8, so give them their own acceptance path.

## Client hand-off

When the routes exist, change `useCollection.ts`:
- `createCustomQuest` and `deleteCustomQuest` call the API;
- set `canCreateQuests` from the session (and offer "Post as org" only to org admins);
- load challenges from `/api/challenges`, so `registerStickers` gets their stickers from the server;
- show `pending` and `rejected` on the author's own cards.

The demo's delete removes earned stickers too. In live mode, archiving should keep them.

## Not built yet

**AR milestone characters** aren't built. The natural hook is the stop sticker: a stop could reference a 3D character instead of a flat design, which would need an asset pipeline and a WebXR viewer.
