# Collection and social frontend handoff

Sohail completed Shibhiya's implementation with user authorization on November 14, 2026. Sign-in remains deferred. No services were purchased.

## Run and preview

```sh
npm ci
npm run dev:demo
```

Open http://127.0.0.1:5173 for the collection preview. The separate AI workbench remains at `/dev/ai`. The preview includes 15 clearly labeled sample places, four quests and sample friends. Demo visits/friends are saved only under `trojanquest:collection-demo:v2` in this browser's local storage. Real mode never silently substitutes sample data. AI report pins remain a separate in-memory server demo.

Fresh demos start with an empty collection for Bovard onboarding. To test a quest reward separately, use the demo spot cards to collect Leavey, Doheny and Philosophy Library in one edition each. The prior seeded v1 demo state is left untouched. Day/night/morning editions do not count as multiple places for quest progress. Try friend code TQRINA or TQLEO. Maya's read-only book is seeded with all sample places. Sign-in, SMTP, hosted database setup and real-world footage remain deferred. The Hunt screen now supports browser GPS and authenticated server catches; physical campus GPS still needs calibration.

## Components and screens

- `components/Card.tsx`: Card, PageHeading, EmptyState.
- `components/StickerImage.tsx`: `stickerKey`, `name`, optional `variant`, `locked`, `size`. Uses Cal's SVG assets when present, otherwise original code-native placeholder art. Locked and all five variant styles are supported.
- `components/Dialog.tsx`: native dialog with keyboard Escape, focus restoration and backdrop close.
- `stickerbook/StickerBook.tsx`: catalogue, text/category/ownership filters, three-edition progress, quest rewards and special event/pop-up catches. Friend books reuse the same component.
- `spots/SpotCard.tsx`: details, tip, time-edition selection and collection status. Demo visit control is hidden for friend books. Live catches remain the map owner's job.
- `quests/QuestsScreen.tsx`: four authored/demo quests, active/completed filters, distinct-place progress, stop details and rare reward state.
- `friends/FriendsScreen.tsx`: add by code, own-code copy, invalid-code feedback, list and read-only friend books. No friend geolocation is requested or rendered.
- `guide/GuideChat.tsx`: real guide API, suggested questions, pending/error/retry states, keyboard send and source links. No fabricated answers or fake production sources.

`components/CollectionApp.tsx` is a temporary preview shell mounted by the initial `App.tsx`. It does not edit Manaswi's `app`, `map`, `report` or `lib` folders. Mount the screens in the final shell when ready, or use `<CollectionApp accessToken={session.access_token} profile={{display_name, friend_code}} />` within a BrowserRouter. The entire account-scoped subtree resets when the access token changes; account A data cannot linger in account B's book, chat or dialogs.

`components/types.ts` re-exports Kartik's `shared/types.ts` contract and adds only preview-specific types. `components/api.ts` is the preview's small HTTP boundary; replace it with Manaswi's shared API client when that exists.

## Backend/content/art integration status

Kartik’s backend foundation landed during this work and was preserved by rebasing onto main. Its shared types, popup helpers and authenticated read routes are integrated; the root test command now includes his suites. No migrations were applied to the hosted project and no database credentials were changed. Remaining setup/write/friend/content work is listed below.

| Feature | Expected input |
| --- | --- |
| Places | `GET /api/spots` → plan-shaped Spot[] |
| Own collection | `GET /api/me/catches` → Catch[] |
| Quest catalogue | New Sohail-owned `GET /api/quests` → Cal's `content/quests.json`, no LLM call |
| Friends | `GET /api/friends` → Friend[]; this list route was missing from the original plan and needs Kartik's implementation |
| Add friend | Existing `POST /api/friends` with `{friend_code}` → Friend |
| Friend book | Existing `GET /api/friends/:id/catches` → Catch[] |
| Own profile | Inject display_name/friend_code from the final auth/profile flow; no extra profile endpoint has been invented |
| Guide | Existing `POST /api/guide/ask` with `{question}` → `{answer,citations}` |
| Sticker art | `client/public/stickers/<key>.svg`; optional `<key>-morning.svg`, `<key>-day.svg`, `<key>-night.svg` etc. Restart Vite after adding assets so its manifest updates |

Backend catch/quest rewards must be authoritative in live mode. This preview never grants fake live rewards. Completed routes without a returned reward catch display "Reward pending sync". The original Catch contract has no popup/org title or art metadata, so unknown special catches use descriptive fallback art until the final source catalogue can enrich them.

Cal's sample replacements must include verified card text/tips/hours and real coordinates. The preview does not treat its illustrative coordinates as real navigation data. Guide content remains absent; the UI handles that honestly. An actual sourced AI answer still depends on those saved pages.

## Validation and media

- 45 server/backend tests and six frontend logic tests cover auth/demo boundaries, catalogue route, photo checks, deduplication, progress, rewards, filtering and corrupt demo storage.
- Browser checks: search/category/ownership; missing-place visit; one quest reward; reload persistence; invalid and valid friend code; read-only friend detail; native dialog Escape/focus; guide real missing-content response and test-only citation fixture; 390px mobile layouts and reachable chat composer.
- Account-switch regression: before the session boundary fix, A's place remained visible after B's health request failed; after the fix, the old-place count was zero. The browser harness stayed outside production source.
- TypeScript, lint and production build are required before publishing.
- [Silent 24-second collection walkthrough](previews/collection-walkthrough.mp4) uses six captured browser states, edited into an MP4 with system ffmpeg. It is a UI preview with labeled demo data, not the full three-minute product demo or real campus footage. Guide sources are not simulated in the video.

The full team video still needs Manaswi's map/capture flow, Cal's content and real campus footage. No phone hardware, Supabase end-to-end persistence, email delivery or production hosting has been verified in this pass.
