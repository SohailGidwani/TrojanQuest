# TrojanQuest: Team Build Plan

Nov 14, 2026 · @Sohail Haresh Gidwani

## The pitch

**Collect stickers, discover USC, meet other Trojans.** TrojanQuest is an exploration app that rewards students for discovering campus to its fullest: places to study, eat, hang out and chill, resources they would otherwise miss, org events and live pop-ups. AI turns any real pop-up into a limited-time sticker in seconds. Closing line: "Welcome Week, but all year."

| Judging criterion | What we show |
| --- | --- |
| Impact (30%) | Freshmen find study spots, Student Health, tutoring, the Career Center and org events before they need them; nobody misses free stuff at the Village |
| AI execution | A photo of a pop-up becomes a verified, expiring sticker with zero admin work; quests fit each student's interests |
| Feasibility | Student Government launches it at orientation and the involvement fair; brands sponsor pop-up stickers, which pays to keep it running |

We build on Replit to stay eligible for the AirPods prize.

## Core loop

Every sticker proves you physically went somewhere; a catch requires being within about 50 m of the pin.

1. **Spot stickers.** 15 seeded spots across five categories: study, eat, hang out, chill and essentials (Student Health, tutoring, the Career Center, cultural centers). Visiting unlocks the spot's sticker and a card with what it offers, hours and one insider tip.
   - **Variants:** the same spot gives a different sticker by time of day (morning 6 to 11 AM, day 11 AM to 5 PM, night 5 PM to 6 AM). A seasonal edition (fall, finals week) is a Should.
2. **Quests.** A Quest is a themed route of 3 to 5 spots, such as "Late-night study spots", "Cheap eats near the Village" or "First-week essentials". Finishing one awards a rare sticker. AI suggests the quests that fit your interests.
3. **Org drops.** An org places a limited-time sticker at its event. Collecting it proves you showed up, which makes the app a recruiting tool.
4. **Pop-up stickers (the hero feature).** A student photographs a pop-up (OGX at the Village, free food, a giveaway). AI generates a sticker tied to it, and it appears on everyone's map with a countdown.
   - Confirmations from other students extend the countdown; no confirmations and it fades early.
   - When the pop-up ends, the sticker is gone for good, which is what gets people walking over.
   - The first reporter earns a Scout badge.
5. **Friends.** Add other students by friend code, see their sticker books and compare progress. Friends never see your location.

Everything you collect lives in your sticker book.

## AI features

Snap-to-sticker is the one AI feature the demo cannot lose; everything else is ranked behind it.

| Feature | What it does | Priority | Hackathon shortcut |
| --- | --- | --- | --- |
| Snap-to-sticker | Vision reads the brand, what is free and how long it will likely last, then picks one of 8 base sticker designs and restyles it with the brand's colors, a name and a lore line | Must | Pre-made base stickers; no live image generation |
| Report check | Rejects photos that are not pop-ups and merges duplicate reports of the same pop-up | Must | Distance plus time rules for merging; one LLM yes/no for spam |
| Quest suggestions | Picks and orders quests from quests.json for the student's interests ("CS freshman who studies late") | Should | One LLM call over quests.json; no generated routes |
| Mascot guide | Answers campus questions from real USC pages and cites them | Should | 15 to 20 pages saved as text and pasted into context; no vector database |
| Sticker lore | One fun line per spot sticker | Nice | Cal hand-writes the USC facts; the LLM only styles them, so it never invents history |

POST /api/popups/report returns this JSON. Frontend and AI work in parallel against it from the first hour:

```json
{
  "accepted": true,
  "reject_reason": null,
  "merged_into": null,
  "popup": {
    "id": "p_123",
    "lat": 34.0257,
    "lng": -118.2856,
    "brand": "Bubble Co.",
    "freebies": ["shampoo samples", "tote bags"],
    "expires_at": "2026-11-15T19:00:00Z",
    "confirmations": 1,
    "status": "live",
    "sticker": {
      "key": "bubble",
      "name": "Lathergeist",
      "source": "popup",
      "variant": "special",
      "colors": ["#7FD3F7", "#FFFFFF"],
      "lore": "Appears only where the free samples flow."
    }
  }
}
```

## Scope

If it is not on the Must list by the 2 AM freeze, it does not ship.

**Must ship**

- [ ] Map with browser GPS plus a fake-GPS dev mode, so the demo works from any room
- [ ] 15 seeded spots, each with a sticker and a card
- [ ] Morning, day and night variants
- [ ] Snap-to-sticker end to end: photo in, sticker on everyone's map with a countdown
- [ ] Live pop-up pins with confirm and automatic expiry
- [ ] 4 quests with progress and a reward sticker
- [ ] Sticker book
- [ ] One seeded org drop

**Should ship**

- [ ] Friends by code, with a view of a friend's sticker book
- [ ] AI quest suggestions
- [ ] Mascot guide with citations
- [ ] Seasonal variants and the Scout badge

**Cut first, in this order:** sticker lore, seasonal variants, mascot guide, AI quest suggestions (show all 4 quests instead). **Never build:** real AR, live image generation, full accounts (anonymous sign-in plus a display name), leaderboards, push notifications, chat between friends, a native app.

## Tech stack and data model

One choice per layer, already made, so nobody burns an hour debating it.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript, react-router | Fast to scaffold, everyone knows it |
| Map | Leaflet (react-leaflet) + OpenStreetMap tiles, browser Geolocation API | No API key, works in 10 minutes |
| Backend | Node + Express + TypeScript, run with tsx | One server for AI and data routes; Vite proxies /api to it |
| Data | Supabase: Postgres, Realtime for live pins, Storage for photos, anonymous auth | One service covers all four needs |
| AI | One vision-capable LLM API, whichever we have credits for | Same model handles vision and chat |
| Hosting | Replit, imported from the GitHub repo | AirPods prize; secrets live in Replit Secrets |
| Sticker art | 8 base designs as SVG, recolored per variant with CSS variables | Looks custom, renders instantly |

| Table | Key fields |
| --- | --- |
| profiles | user\_id, display\_name, friend\_code |
| spots | id, name, lat, lng, category, card\_text, tip, sticker\_key |
| popups | id, lat, lng, brand, freebies, sticker (jsonb), expires\_at, confirmations, status, reporter\_id |
| reports | id, popup\_id, user\_id, created\_at, ai\_verdict |
| org\_drops | id, org\_name, event\_name, lat, lng, starts\_at, ends\_at, sticker\_key |
| catches | id, user\_id, source (spot, popup, org, quest), source\_id, variant, caught\_at |
| friends | user\_id, friend\_id, created\_at |

Quests are not a table: they live in content/quests.json, and progress is computed from catches. Expiry is checked on read (expired once now passes expires\_at), so there is no cron job.

## Who owns what

Every folder in the repo has exactly one owner, so no two people ever edit the same file.

| Person | Role | Owns (folders and routes) |
| --- | --- | --- |
| Sohail | AI and repo lead | server/src/index.ts, server/src/ai/\*\* (POST /api/popups/report, POST /api/guide/ask, POST /api/quests/suggest), .env.example, root config, merging PRs |
| Kartik | Backend and data | supabase/migrations/**, server/src/db/**, server/src/routes/\*\* (spots, catch, popups confirm, friends, org drops), shared/types.ts, scripts/seed.ts |
| Manaswi | Frontend: map and capture | client/src/app/\*\* (shell, routing, nav), client/src/map/**, client/src/report/**, client/src/lib/\*\* (api.ts, geo.ts, supabase.ts) |
| Shibhiya | Frontend: collection and social | client/src/components/\*\* (shared UI, StickerImage), client/src/stickerbook/**, client/src/spots/**, client/src/quests/**, client/src/guide/**, client/src/friends/\*\* |
| Cal | Content, art and pitch | content/\*\* (spots.json, quests.json, guide-pages/, facts.json), client/public/stickers/**, pitch/**, the Bubble Co. prop |

**Repo rules**

1. Touch only your own folders. Need a change somewhere else? Ask its owner in the group chat.
2. shared/types.ts is the contract between everyone. Only Kartik edits it, and he posts every change in the chat.
3. One branch per person (sohail/ai, kartik/backend, manaswi/map, shibhiya/screens, cal/content). Open a PR to main at least every 2 hours; Sohail merges within 15 minutes.
4. Never block on someone else: build against a mock.ts in your own folder until the real route or component lands, then delete the mock.
5. Secrets go in Replit Secrets or your local .env, never in the repo.

## Repo setup

Sohail pushes this skeleton by 3:30 PM; everyone else clones it and starts in their own folder.

```bash
mkdir trojanquest && cd trojanquest && git init
npm create vite@latest client -- --template react-ts
mkdir -p server/src/ai server/src/routes server/src/db shared supabase/migrations scripts \
  content/guide-pages pitch client/public/stickers
cd server && npm init -y
npm i express cors multer @supabase/supabase-js
npm i -D typescript tsx @types/express @types/cors @types/multer @types/node
cd ../client && npm i react-router-dom leaflet react-leaflet @supabase/supabase-js
npm i -D @types/leaflet
cd .. && git add . && git commit -m "Skeleton" && git push
```

```text
trojanquest/
  client/                       React + Vite
    public/stickers/            Cal
    src/app/                    Manaswi   shell, routing, nav
    src/map/                    Manaswi
    src/report/                 Manaswi   camera + report flow
    src/lib/                    Manaswi   api.ts, geo.ts, supabase.ts
    src/components/             Shibhiya  shared UI, StickerImage
    src/stickerbook/            Shibhiya
    src/spots/                  Shibhiya  spot card
    src/quests/                 Shibhiya
    src/guide/                  Shibhiya  mascot chat
    src/friends/                Shibhiya
  server/
    src/index.ts                Sohail    Express app, mounts all routers on :3001
    src/ai/                     Sohail
    src/routes/                 Kartik
    src/db/                     Kartik
  shared/types.ts               Kartik
  supabase/migrations/          Kartik
  scripts/seed.ts               Kartik
  content/                      Cal
  pitch/                        Cal
  .env.example                  Sohail
```

```bash
# .env.example
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server only
LLM_API_KEY=                 # server only
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
PORT=3001
```

In client/vite.config.ts, proxy /api to http://localhost:3001 so the frontend never hard-codes the server URL. Run the server with `npx tsx watch src/index.ts` and the client with `npm run dev`.

## API contract

These routes and types are the only meeting points between people; build against them, not against each other's code.

| Route | Owner | Request | Response | Ready by |
| --- | --- | --- | --- | --- |
| GET /api/spots | Kartik | none | Spot\[\] | 6 PM |
| POST /api/catch | Kartik | { source, source\_id, lat, lng } | { ok, sticker, variant } or { ok: false, reason: "too\_far" } | 10 PM |
| GET /api/me/catches | Kartik | none | Catch\[\] | 10 PM |
| POST /api/popups/report | Sohail | multipart: photo, lat, lng | the JSON in AI features | 6 PM |
| POST /api/popups/:id/confirm | Kartik | { lat, lng } | { expires\_at, confirmations } | 10 PM |
| GET /api/org-drops | Kartik | none | OrgDrop\[\] | 10 PM |
| POST /api/quests/suggest | Sohail | { interests } | Quest\[\] in suggested order | 2 AM |
| POST /api/guide/ask | Sohail | { question } | { answer, citations: { title, url }\[\] } | 2 AM |
| POST /api/friends | Kartik | { friend\_code } | Friend | 2 AM |
| GET /api/friends/:id/catches | Kartik | none | Catch\[\] | 2 AM |

Live pop-up pins do not go through the server: the client subscribes to the popups table with Supabase Realtime. Kartik's db/popups.ts exports createPopup() and findNearbyPopup(), which Sohail's report route calls; Sohail never writes SQL.

Starting shared/types.ts (Kartik owns it from here):

```typescript
export type Category = 'study' | 'eat' | 'hangout' | 'chill' | 'essentials';
export type Variant = 'morning' | 'day' | 'night' | 'seasonal' | 'special';
export type Source = 'spot' | 'popup' | 'org' | 'quest';

export interface Sticker { key: string; name: string; source: Source; variant: Variant; colors?: string[]; lore?: string; }
export interface Spot { id: string; name: string; lat: number; lng: number; category: Category; card_text: string; tip: string; sticker_key: string; }
export interface Popup { id: string; lat: number; lng: number; brand: string; freebies: string[]; sticker: Sticker; expires_at: string; confirmations: number; status: 'live' | 'expired'; }
export interface OrgDrop { id: string; org_name: string; event_name: string; lat: number; lng: number; starts_at: string; ends_at: string; sticker_key: string; }
export interface Catch { id: string; source: Source; source_id: string; variant: Variant; caught_at: string; }
export interface Quest { id: string; title: string; blurb: string; spot_ids: string[]; reward_sticker_key: string; }
export interface Friend { user_id: string; display_name: string; friend_code: string; }
```

## Task checklists

Tick your own boxes as you go; anything unticked at a checkpoint gets raised in the group chat right away.

**Sohail: AI and repo lead**

- [ ] 3:30 PM: skeleton pushed, all four invited, Replit imported from GitHub
- [ ] 6 PM: POST /api/popups/report turns a real photo into the AI features JSON and writes it with Kartik's createPopup()
- [ ] 10 PM: non-pop-up photos rejected; a second report within 100 m and 2 hours merges instead of duplicating
- [ ] 2 AM: POST /api/quests/suggest and POST /api/guide/ask (answers only from content/guide-pages, with citations)
- [ ] Morning: integration fixes only; own the final merge to main

**Kartik: backend and data**

- [ ] 4:30 PM: Supabase project up, keys sent to the team privately, migrations for all seven tables applied
- [ ] 6 PM: scripts/seed.ts loads Cal's content/spots.json; GET /api/spots live; createPopup() and findNearbyPopup() exported; Realtime on popups
- [ ] 10 PM: POST /api/catch with the 50 m check and the morning/day/night rule; POST /api/popups/:id/confirm adds 30 minutes per confirmation; GET /api/me/catches; GET /api/org-drops with one seeded drop
- [ ] 2 AM: profiles with friend codes, POST /api/friends, GET /api/friends/:id/catches
- [ ] Morning: seed the demo state (a friend with a full book, one live pop-up)

**Manaswi: frontend, map and capture**

- [ ] 6 PM: app shell with bottom nav (Map, Stickers, Quests, Friends); map shows spot pins from GET /api/spots; fake-GPS toggle moves your dot
- [ ] 10 PM: tap a pin in range to catch (POST /api/catch) with a sticker reveal using Shibhiya's StickerImage; live pop-up pins with countdowns via Realtime; org drop pins
- [ ] 2 AM: report flow (camera, POST /api/popups/report, new pin appears) and a Confirm button on pop-up pins
- [ ] Morning: mobile layout pass on a real phone

**Shibhiya: frontend, collection and social**

- [ ] 6 PM: StickerImage (renders Cal's SVG by key and variant) and Card components shared with Manaswi; spot card screen on mock data
- [ ] 10 PM: sticker book grid (locked and unlocked, variants) from GET /api/me/catches; quests screen with progress and the reward sticker
- [ ] 2 AM: friends screen (add by code, open a friend's book); mascot chat screen on POST /api/guide/ask
- [ ] Morning: film and edit the demo video with Cal

**Cal: content, art and pitch**

- [ ] 4 PM: content/spots.json with 15 spots (name, lat, lng, category, card\_text, tip, sticker\_key), coordinates checked on a map
- [ ] 6 PM: 8 base sticker SVGs in client/public/stickers plus a morning/day/night color rule; content/quests.json with 4 quests
- [ ] 10 PM: 15 to 20 USC pages saved as text in content/guide-pages (URL on the first line); content/facts.json for sticker lore
- [ ] 2 AM: pitch deck draft in pitch/; Bubble Co. prop made
- [ ] Morning: lead the pitch; rehearse twice with the team

## Timeline

The two checkpoints matter more than the hour blocks: if the 6 PM check fails, drop everything else until a photo becomes a pin.

&#91;embedded content: Build timeline · Sat 3 PM to Sun 11 AM, 2 checkpoints\]

After the 2 AM freeze, only bug fixes and polish land.

## Demo script (3 minutes)

The live photo-to-sticker moment is the climax; everything before it sets it up.

1. **0:00 to 0:20, hook.** "Who here found out about a free giveaway at the Village after it ended? Who found the tutoring center only after failing a midterm?" Name the problem: students miss what USC already offers.
2. **0:20 to 1:10, explore.** Fake GPS at Leavey at night: collect Leavey's night sticker, open its card, and watch the "Late-night study spots" quest tick forward. Show tonight's org drop on the map.
3. **1:10 to 2:10, the hero moment.** A teammate photographs the Bubble Co. prop. Seconds later a new sticker appears on every phone with a countdown. A second phone confirms and the countdown extends. Then snap a random photo and show it rejected.
4. **2:10 to 2:40, social and AI.** Open a friend's sticker book to compare progress. Ask the mascot a campus question; it answers with a citation.
5. **2:40 to 3:00, feasibility.** Student Government launches it at orientation; brands sponsor pop-up stickers. "Imagine this with OGX." Close on "Welcome Week, but all year."

**Video:** film a real catch at USC Village Sunday morning. At the 2 AM freeze, record a full screen capture of the demo path as a backup in case venue wifi fails.

## Rules and risks

Each of these is cheap to handle now and expensive if a judge spots it first.

| Risk | What we do |
| --- | --- |
| Pokemon IP | No Pokemon names, art, sounds or catch animations. Original stickers only |
| USC trademarks | Tommy Trojan, Traveler and possibly "Trojan" and "Fight On" are USC marks. Fine in a prototype; the feasibility slide says licensing goes through Student Government |
| Real brands | The video uses the fictional Bubble Co.; OGX is only mentioned in the pitch |
| Location privacy | Never show where other players or friends are, only pins. No location history stored; position is checked only at catch time |
| Friends | Added only by a code you share; friends see your sticker book and display name, nothing else. No chat |
| Photos of people | Photos are deleted once the AI has read them; only the generated sticker is kept |
| Fake reports | Unconfirmed pop-ups fade early, non-pop-up photos are rejected, and each user can report at most a few times an hour |
| Hallucinated facts | The mascot answers only from content/guide-pages and cites them; lore facts are hand-written |
| Demo failure | Fake-GPS mode, seeded demo state, and the backup video recorded at the 2 AM freeze |

## Decide in the next 15 minutes

- [ ] Confirm the submission deadline is Sunday 11 AM and get the full rubric weights
- [ ] Confirm the AirPods prize only requires building on Replit
- [ ] Pick the LLM API we have credits for (Sohail)
- [ ] Everyone confirms their row in Who owns what before writing code
