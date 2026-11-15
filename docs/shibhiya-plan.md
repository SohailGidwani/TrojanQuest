# Shibhiya frontend implementation

Authorized by Sohail on November 14, 2026. Complete the collection/social role, keep sign-in deferred, use no paid services, verify and push main, then stop.

Scope: shared Card, StickerImage and dialog; sticker book with locked/unlocked morning/day/night variants; spot detail card; four quests with catch-derived progress/rewards; add friends by code and read-only friend books; guide chat with citations. Build a temporary preview wrapper in components and mount it from the initial App entry, without editing Manaswi's app/map/lib folders or Kartik's shared types/database folders.

Design: college sticker album, cardinal #8d1836, gold #e7b942, paper #f7f8fa, ink #202a38, teal #39786e. Friendly sans headings, spacious desktop sidebar and mobile bottom navigation. Sticker illustrations are code-native placeholders until Cal's SVGs exist. No decorative animation is needed.

1. Write tests for collection deduplication, distinct-place quest progress, reward awards, search/filter and stored demo-data validation. Implement the smallest shared data helpers and temporary types until Kartik supplies shared/types.ts.
2. Build reusable UI and all screens in owned folders. Use native dialogs, accessible labels, visible focus, keyboard navigation and responsive layouts. Keep live errors explicit and demo content visibly labeled.
3. In explicit server demo mode, use isolated browser demo catches/friends; connect guide/AI to real routes. Add GET /api/quests in Sohail's AI router so authored quests can load without calling the LLM. Normal mode uses agreed APIs with an optional injected access token; never silently falls back to sample data.
4. Test browser flows: search/category/locked filters, spot variants, quest completion/reward, add-code validation, friend book privacy, guide response/citation and errors, reload persistence, keyboard dialog and mobile overflow. Run all tests, lint, typecheck and build; review and fix substantive issues.
5. Document backend/art/content integration needs, push to main and leave the demo running. Do not implement map/capture, SQL, accounts, paid services or unverified USC content.

Completed: all screens/components and explicit demo behavior, six pure frontend regression tests, authenticated quest-catalogue route plus its test, desktop/mobile browser checks, account-switch regression fix and independent review, handoff documentation, and a 24-second edited UI walkthrough. Final checks: 51 total tests passed after integrating Kartik’s backend foundation and shared types, TypeScript passed, lint clean, production build passed. Backend/content/art/auth integration and full real-world filming remain team dependencies documented in the handoff.
