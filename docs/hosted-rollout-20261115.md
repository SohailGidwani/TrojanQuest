# Hosted rollout — 2026-11-15

PR #11 was merged into main at b1eb4b0dd413a75fac9086440f29ac694508088a.

## Database

Verified the signed-in dashboard project TrojanQuest, organisation USC Hackathon, project reference bzdcfiruylgrsvvkuneu. The server and client environment URLs both identify that project. Before deployment, the hosted migration ledger contained exactly migrations 001–006 and no challenges table.

Applied migrations 202611150007 (quest completion) and 202611150008 (challenges) together in one guarded transaction. The guard required the exact six-version starting ledger and absence of the new objects. The transaction recorded both complete migration statements in the ledger. Existing application data was not reset. No organisation, membership or reviewer identities were provisioned.

## Verification

All seven read-only SQL checks matched their expected values:

- Both stored migration sources match the committed SQL after line-ending normalisation: 2/2.
- New tables with row-level security enabled: 5/5.
- Anonymous/authenticated direct access to the five tables: 0.
- Anonymous/authenticated execute access to seven new privileged RPCs: 0.
- Service-role execute access to those seven RPCs: 7/7.
- Active challenge-catch guard trigger: 1/1.
- Sticker palette JSONB column: 1/1.

The hosted REST API recognises list_challenges after schema reload. A read-only call using the configured server credential and a nonexistent actor UUID returns HTTP 403 / PostgreSQL 42501, as required. No real challenge was submitted or approved during this verification. Full authenticated end-to-end product use remains untested.

A subsequent verification attempt initially retained the migration bundle in the SQL editor. Its existing-version guard rejected execution with Unexpected migration state; no migration was reapplied. The editor was cleared, and the verification-only query then passed all seven checks.

## Remaining product integration

Frontend owners still need to connect live challenge listing, creation, acceptance and server-written quest completion. Automated AI prescreening is not wired. An authorised administrator must provision approved organisations, their approved administrators and team reviewers using actual agreed identities. These are not automatically granted by deployment.
