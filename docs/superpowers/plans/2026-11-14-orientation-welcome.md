# Orientation Welcome Implementation Plan

**Goal:** Give a fresh explorer a proper welcome and one Bovard orientation discovery before exposing the rest of TrojanQuest.

**Design:** An orientation invitation in the existing cardinal, cream and gold palette, using the app's existing type and an original architectural SVG. Desktop uses invitation copy beside the illustration; mobile stacks them. One action opens the Bovard clue. No GPS request on welcome. Other destinations, navigation and developer-workbench links stay hidden until a Bovard spot catch exists. Missing/failed catalogue data never unlocks navigation. Welcome returns on a new Hunt mount until Bovard is collected.

**Approaches:** Keep all navigation visible but disabled, or hide it and guard routes. Choose hidden navigation plus route guards to deliver the user's single-task first visit. Reuse catches for completion; no backend schema or duplicate progress flag. User delegated routine design decisions earlier and explicitly requested this flow.

**Tech stack:** Existing React, React Router, CSS, local demo storage. No dependencies or paid services.

- [x] Add a tested shared tutorial-completion check; cover non-Bovard, quest, missing catalogue and actual Bovard catches.
- [x] Add the welcome view to HuntScreen; guard CollectionApp routes and navigation until completion.
- [x] Add explicit local-demo reset, clear only TrojanQuest demo/trail keys, empty seeded own friends, and remount Hunt after reset. No Supabase account/data deletion.
- [x] Verify welcome, deep links, nearby arrival/unlock, reload, reset and mobile layout in browser; run tests, types, lint/build and independent review.
- [x] Reset Sohail's current local demo through the app; verify welcome. Commit/push directly to main as authorized.

Validation: 100 tests passed (1 startup, 85 server, 14 frontend), TypeScript checks, client lint and production build passed. Browser flow verified welcome/deep links/unlock/reload/reset and mobile width. Actual user Chrome preview reset at port 3001; no hosted account or database deletion. Independent review found no important issues.
