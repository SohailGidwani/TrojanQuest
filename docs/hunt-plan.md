# Clue-led campus hunt

User authorized Bovard-first discovery gameplay and cross-platform startup on November 14, 2026. No paid services.

- PR #1 was already merged; also fast-forwarded the newer catch/confirmation/profile/friend PRs already on main.
- Replace shell-specific environment assignments with one Node launcher using installed concurrently. Tests verify inherited environment is preserved and demo flags do not mutate the parent.
- First hunt: an original clue leads to Bovard Auditorium. Show a north-up distance/bearing display and a campus map. Use browser watchPosition only after the user opts in, show accuracy, reject stale fixes, and clean up watches on stop/unmount. The directional arrow is north-up, not device-orientation or Apple/UWB precision.
- Check-in requires the measured distance plus reported accuracy to fit inside 50 m, accuracy at most 25 m, and a fix no older than 30 seconds. Recheck at click time. The backend remains authoritative in live mode.
- Explicit simulation is available only in the existing local demo. It updates browser-local demo catches through the collection hook. Live mode uses authored spots from the backend and POST /api/catch; no fake position or sample target is accepted in live mode.
- Show an explicit GPS/permission/offline error and manual retry. Do not save or publish location history. Map tiles reveal viewed geographic area to OpenStreetMap, so do not load them before location/simulation opt-in.
- Verify portable startup, distance/bearing/staleness/accuracy math, simulated arrival/reward, denied GPS, browser-emulated near/far/inaccurate/stale fixes, production/auth boundaries, and all existing tests/build/lint. Real Windows and on-campus phone precision require later hardware checks.

## Implemented and verified

- PR #1 was already merged as 2d2730e. Fast-forwarded main through merged catch/confirmation and social PRs (#2/#3), ending at 1280b0b before this work.
- Bovard's demo pin is 34.020914, -118.285537 from the geo metadata of [USC's official venue listing](https://calendar.usc.edu/bovard_auditorium_adm), cross-checked with the campus address. Clue text is original. This is one complete first-discovery hunt; additional authored routes remain content work.
- Root dev commands now use scripts/dev.mjs and the installed concurrently API. Both child processes receive NODE_ENV=development and demo gets DEMO_MODE=true. Server dev no longer contains inline POSIX environment assignment syntax.
- Unit suite: one startup test, 85 server/backend tests and nine frontend tests (95 total). TypeScript, lint and build pass.
- Browser checks: simulated 200 m → 20 m → reveal/collect/book; real Geolocation API with browser-emulated far, accurate near, ±100 m, stale and paused fixes; permission-denied feedback; mobile 390 px with five navigation items and no overflow; actual OpenStreetMap tile loading.
- Live-mode browser request fixture confirmed simulation is absent, catch includes the session Bearer token, real source ID and position, and collection updates from the server response. The fixture did not write to hosted Supabase.
- Independent review found no substantive blockers. A materially incorrect device clock can mislabel the predicted time-of-day edition; the server still decides the awarded variant and retries are idempotent.
- Startup was actually exercised on macOS with the new Node launcher. Native Windows execution, physical campus GPS/entrance calibration, hosted migrations and live Supabase collection are not verified here. No paid service or native precision-finding hardware was added.
