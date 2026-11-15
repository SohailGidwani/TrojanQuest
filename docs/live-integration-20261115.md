# Live quests and challenges integration

## Scope

The user explicitly authorised completing frontend and AI-owner integration after the backend PR and migrations 007–008 had shipped. The existing game design, Bovard-first unlock, private credentials and explicit demo mode are preserved.

## Connected behaviour

- The client loads saved quest acceptances, the real invitation inbox, server party membership, approved organisations, its profile and the server sticker catalogue.
- Acceptance and invitation responses are persisted by the server. All of a traveller's previously collected stops count. Completion is requested with an empty body, and the book is refreshed from saved catches. The browser cannot choose a live roll, reward, rarity or party size.
- Student/org challenge submissions go through the authenticated API. The creator waits for the response and shows failures. Only approved admin memberships appear in the org selector. Live UUIDs bypass the demo parser.
- Only currently live, unexpired challenges add playable quests and pinned places. Authors have a separate submission history and archive control. Earned catches and catalogue metadata survive archive/expiry.
- Reviewers have a private queue showing route details, automated screen status and review notes. Self-review is disabled in the UI and forbidden by SQL.
- Place cards can collect official places and challenge pins using the same GPS freshness, accuracy and 50 m checks as the hunt. No simulation is enabled in live mode; the backend still decides the result.
- The live refresh button reloads incoming invitations and party membership. These use explicit refresh, not a realtime subscription.
- Missing profiles can be created with a display name. Email authentication supports Supabase's sign-in link or a template-provided code; sender and redirect configuration remain deployment responsibilities. No OTP was sent during testing.

## Automated screening

Migration `202611150009_challenge_screening.sql` records status, reason and time. Only trusted server RPC calls may write it. Browser roles cannot write the record or call the internal manual-review function. Publication requires a passing screen in addition to an independent human review.

Creation persists pending first, then screens the validated fields with the configured local Ollama model. A failed/unavailable model never publishes anything. Approval checks reviewer authorisation and self-review before re-screening stored content. The screen is advisory about content; coordinates do not prove safe public access.

The local machine had Ollama installed but not running, and lacked the configured `qwen3-vl:4b-instruct` model. The service was started and that model installed. Actual local-model checks passed for a benign route, an original sticker design and an unsafe restricted-access route. These examples do not establish general moderation accuracy. Hosted deployments must provide their own reachable Ollama service; `127.0.0.1` on Replit refers to Replit, not this laptop.

## Starter content

The missing spots/quests files are supplied: five existing hunt destinations, four original authored quests and four new built-in-art rewards. See [sources and coordinate limitations](starter-campus-catalogue.md). The existing Bovard record and other sticker definitions are preserved. No fabricated campus organisations, events, memberships or student catch records are seeded.

## Validation

At the initial integration check: 139 server tests, 53 client tests and the startup test passed (193 total); server typecheck and the client production build passed. The existing PostgreSQL regression suite and the challenge suite passed through migration 009, including screening gates, independent review, GPS, expiry and reward idempotency. The final rollout record below records any subsequent checks or changes.

The explicit `scripts/live-ui-fixture.ts --local-fixture` server binds loopback only and never uses hosted credentials. Two browser sessions exercised pending submission, separate-account approval, existing-visit completion, archive with earned-reward retention, persisted acceptance, invite, recipient Join and refreshed party membership. This combines the real React client and Express routes with fixture stores/model verdicts; it is not a hosted-authentication or hosted-concurrency test. The first fixture run exposed no production bug; its route was subsequently changed to three stops so party invitations could be tested before completion.

## Deployment state

Migrations 007–008 were already applied and verified in [the earlier rollout](hosted-rollout-20261115.md). Migration 009, the content import, initial team roles and the final merge are recorded below when completed. Live user email delivery, a two-real-account walkthrough, physical GPS calibration and a hosted application release are separate from local tests and database deployment; they are not claimed by the fixture.
