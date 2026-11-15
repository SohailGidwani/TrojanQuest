# Sticker catalogue: rarity, tags and images

Stickers now have a name, an image, a rarity and tags. The catalogue lives in
`content/stickers.json` and the frontend reads it at build time. The client
enforces it today in the demo only. The live server does not yet, and that needs
backend changes (below).

## Authoring `content/stickers.json` (Cal)

```json
{ "stickers": [
  { "key": "leavey", "name": "Leavey Library", "image": "leavey.png", "art": "book",
    "rarity": "common", "tags": ["study", "library", "late night"] },
  { "key": "quest-fall-trail", "name": "Fall Trail 2026", "art": "leaf", "rarity": "exclusive",
    "tags": ["quest reward", "seasonal"],
    "available_from": "2026-11-01T00:00:00-08:00", "available_until": "2026-12-01T00:00:00-08:00" }
] }
```

| Field | Required | Notes |
| --- | --- | --- |
| `key` | yes | Lowercase letters, digits, dashes. Spots use it as `sticker_key`, quests as `reward_sticker_key`, org drops as `sticker_key`. |
| `name` | yes | Shown in the app. |
| `rarity` | yes | `common`, `rare`, `epic`, `legendary` or `exclusive`. One rarity per sticker; its morning/day/night editions share it. |
| `tags` | yes | Free-form words for what the sticker shows or where it is found. They are lowercased and searchable in the collection (`#library`). |
| `image` | no | A `.svg`, `.png` or `.webp` file in `client/public/stickers/`. Optional editions: `leavey-night.png`, etc. |
| `art` | no | Built-in fallback design used when there is no image: `book`, `bowl`, `leaf`, `star`, `bubble`, `bolt`, `heart`, `flag`. |
| `lore` | no | One short line. Keep facts hand-checked. |
| `available_from` / `available_until` | exclusive only | ISO dates. `available_until` is required for exclusive stickers and is the moment it can **never be earned again**. Other rarities may not have dates. |

`npm test` validates the real file and lists each bad entry. The current entries
match the demo's places and quests, including two sample exclusive quests (one
open, one ended). Replace them with the real catalogue.

## Needed on the server (Kartik)

The client blocks ended exclusives, but a client check is not security. To
enforce the rule for real users:

1. **Shared types.** Add `Rarity` and a `StickerDefinition` matching the table
   above to `shared/types.ts` (the client copy is in
   `client/src/components/stickers.ts`). Consider adding `rarity` to `Sticker` so
   `CatchResult` can return it.
2. **Stickers table.** Add a `stickers` table with
   `(key, name, image, rarity, tags text[], available_from, available_until)`
   and seed it from `content/stickers.json` in `scripts/seed.ts`. Add a check
   constraint that exclusive rows have `available_until`.
3. **`catch_sticker`.** Before inserting a catch, look up the spot's (or quest
   reward's) sticker and refuse when it is exclusive and `now()` is outside the
   window. The existing `not_started` and `expired` failure reasons fit.
4. **Accepted quests.** These are currently stored only in the browser. They
   need a table such as `quest_acceptances(user_id, quest_id, accepted_at)` and
   a route, so quest rewards are only awarded for accepted quests.

## Pop-ups and org drops (Sohail / Kartik)

Both are time-limited, so their stickers are exclusive by nature. A pop-up's
window is its `expires_at`; an org drop's is `starts_at` to `ends_at`. The AI
sticker contract could set `rarity: "exclusive"` on pop-up stickers. This is
not changed yet.
