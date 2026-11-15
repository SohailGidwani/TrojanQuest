# Starter live campus catalogue

The repository had no `content/spots.json` or `content/quests.json`; hosted Supabase contained only Bovard. These files publish five existing hunt destinations and four original 3–5-stop quests, so authored quest acceptance and completion have a real catalogue. This is a starter subset, not the full 15-place content roadmap.

Bovard's hosted record is retained. The other four coordinates reuse the existing hunt pins in `client/src/components/mock.ts`, whose source and prior OpenStreetMap checks are recorded in `docs/hunt-plan.md`. This rollout does not claim new physical entrance calibration or that access is always open. Players must respect closures and remain on public paths; no quest requires entering a building.

Place descriptions were checked against USC's own pages on 2026-11-15:

- [Leavey Library](https://libraries.usc.edu/locations/leavey-library)
- [Doheny Memorial Library](https://calendar.usc.edu/doheny_memorial_library_dml)
- [Alumni Park](https://calendar.usc.edu/alumni_park_699)
- [McCarthy Quad](https://calendar.usc.edu/mccarthy_quad_798)

Some calendar JSON-LD coordinates disagree with the previously documented hunt pins (notably Leavey, Alumni Park and McCarthy Quad). They were not substituted into the game. A fresh OpenStreetMap API cross-check was unavailable (timeout/rate limit). The coordinates are therefore inherited from the documented hunt, not newly independently verified, and need physical campus calibration before a public launch. Current opening hours are deliberately linked rather than copied into the app.

The four new rewards use the existing built-in book, leaf, flag and star art. Other catalogue rows are preserved. Seeder validation checks every quest's stops and reward before any hosted import.
