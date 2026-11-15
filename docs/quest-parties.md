# Quest parties: backend spec

**Current status (2026-11-15):** migrations 006–009 are applied on the team's hosted Supabase project. The live client loads persisted acceptances and incoming invitations, sends invite/join/remove actions, and requests own-visit-verified completion through `POST /api/quests/:id/complete`. The server trigger freezes party size and saves the one-time reward roll; the client refreshes catches rather than rolling locally. Explicit demo mode retains separate local simulation.

**For:** Kartik (shared types, database, routes), with frontend/AI integration completed under the user's subsequent end-to-end authorisation.

See [the completed integration and its validation limits](live-integration-20261115.md). Other environments must apply the migrations and private configuration; database rollout is separate from a hosted application release.

## The feature

A student can invite up to **3 friends** to a quest they have accepted. When the quest is completed, the reward is rolled using the number of friends who **accepted** the invite:

| Friends joined | Rarity bump | Duplicate (2 copies) |
|---|---|---|
| 0 | none | none |
| 1 | 25% chance | none |
| 2 | 75% chance | none |
| 3 | guaranteed | 50% chance |

- A bump moves the reward one tier: common → rare → epic → legendary. **Legendary and exclusive never bump** (`capped: true`). The duplicate chance still applies.
- **Every party member who completes the quest gets their own independent roll**, using the party size. A friend who joins your party is also in theirs; see "Party membership" below.
- Friends count only after accepting. Pending invites don't count.
- The party is frozen when the quest reward is granted. Members can't be added or removed after that.

The reference implementation and tests are in `client/src/components/party.ts` and `party.test.ts`. The server should match `partyOdds`, `nextRarity` and `rollReward` exactly.

## Proposed shared types (`shared/types.ts`, Kartik)

```ts
export type QuestInviteStatus = 'invited' | 'joined' | 'declined';
export interface QuestPartyMember { user_id: string; display_name: string; status: QuestInviteStatus }
export interface QuestParty { quest_id: string; owner_id: string; members: QuestPartyMember[] }   // members.length <= 3
export interface QuestInvite { quest_id: string; quest_title: string; from: Friend; invited_at: string }
export interface InviteToQuestRequest { friend_id: string }
export interface RespondToQuestInviteRequest { accept: boolean }

// Per-catch reward outcome. Optional so spot/popup/org catches are unchanged.
export interface Catch {
  // ...existing fields
  rarity?: Rarity;        // effective rarity after a party bump; absent = catalogue rarity
  copies?: 1 | 2;         // 2 when the party duplicate landed
  party_size?: number;    // 0–3, for display ("Party of 4")
}
```

The client currently keeps the same data in a `RewardRolls` map (`base`, `rarity`, `bumped`, `capped`, `copies`, `partySize`). Once `Catch` carries `rarity` and `copies`, `useCollection` can read them from `/api/me/catches` and drop the local map.

## Database (Supabase migration, Kartik)

```sql
create table public.quest_party_members (
  owner_id   uuid not null references auth.users(id) on delete cascade,   -- who invited
  quest_id   text not null,
  member_id  uuid not null references auth.users(id) on delete cascade,   -- invited friend
  status     text not null check (status in ('invited','joined','declined')),
  invited_at timestamptz not null default clock_timestamp(),
  responded_at timestamptz,
  primary key (owner_id, quest_id, member_id),
  check (owner_id <> member_id)
);
alter table public.catches add column rarity text check (rarity in ('common','rare','epic','legendary','exclusive'));
alter table public.catches add column copies smallint not null default 1 check (copies in (1,2));
alter table public.catches add column party_size smallint not null default 0 check (party_size between 0 and 3);
```

RPC rules, all `security definer` and called by the service role like the existing quest RPCs:

- **`invite_to_quest(owner, quest_id, member)`**
  - The owner must have accepted the quest (`quest_acceptances`) and not yet earned its reward.
  - `member` must be an accepted friend of the owner (same rule as friend books).
  - At most 3 rows with status `invited` or `joined` per `(owner, quest_id)`. Enforce this inside the RPC with a row lock, not only in the client.
  - Re-inviting someone who declined resets them to `invited`.
- **`respond_quest_invite(member, owner, quest_id, accept)`**
  - `invited` → `joined` or `declined`.
  - Joining also accepts the quest for the member if they haven't already (reuse `accept_authored_quest`).
- **`remove_quest_party_member(owner, quest_id, member)`**
  - Allowed only before the owner's reward is granted.
- **Reward grant**
  - Wherever the server grants the quest reward catch (not built yet: `202611140005` only records acceptance), compute `party_size` = joined members for that user's party, then roll **server-side**.
  - Never accept a roll or rarity from the client.
  - Store `rarity`, `copies` and `party_size` on the catch.
  - `random()` is fine for a game reward. Log the roll inputs if you want auditability.

## Party membership

The simplest model that matches "everyone in the party gets a roll":

- A party belongs to its owner. Each member who joined rolls with the owner's party size when **they** complete the quest.
- Each joined member has their own party too: everyone in a party counts toward everyone else's party size.

Here's a concrete case. The owner invites three friends and all of them join. The owner and each of those friends then roll with party size 3 when they finish.

When two different owners overlap, use the largest party the student belongs to for that quest. Party size is still capped at 3.

## Routes (Sohail / Kartik)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/quests/:id/party` | — | `QuestParty` |
| POST | `/api/quests/:id/party` | `InviteToQuestRequest` | `QuestParty` |
| DELETE | `/api/quests/:id/party/:friendId` | — | `QuestParty` |
| GET | `/api/me/quest-invites` | — | `QuestInvite[]` |
| POST | `/api/quest-invites/:questId/:ownerId` | `RespondToQuestInviteRequest` | `QuestParty` |

All routes require the verified USC session, like the other `/api/me` routes. Return 409 for a full party, 404 when not friends, and 410 when the quest is already completed.

## Client hand-off

To turn on live mode in `client/src/components/useCollection.ts`:

1. Load parties from the routes above.
2. Have `inviteFriend` and `removeFromParty` call the API instead of updating local state.
3. Remove the demo auto-accept timer.
4. Show incoming invites; the Friends tab is the natural place.
5. Read `rarity`, `copies` and `party_size` from catches.
6. Set `partiesAvailable` to `true`.

The UI in `QuestsScreen.tsx` and `StickerBook.tsx` already renders parties, odds, upgraded rarity and the 2× badge.

## Implemented backend details

- The authenticated backend router mounts all five routes. Caller-selected owners,
  statuses, roll results and extra body fields are rejected. Invitees respond for
  themselves; an owner cannot mark a friend joined.
- Membership uses the existing directed friend-book relationship. An inviter must
  have a saved profile and an accepted quest. Joined members accept the owner's
  immutable quest snapshot, without requiring Cal's file to be present again.
  An incompatible previously accepted edition returns 409 rather than overwriting it.
- Invited and joined rows reserve the three seats. Declines free seats; re-inviting
  resets the timestamp/status. Repeated invites and identical responses are safe.
- `quest_parties` stores the freeze snapshot. A quest-scoped advisory transaction
  lock and party row locks serialize invitations, responses and future reward
  inserts, including overlapping groups. Private tables have RLS and no browser
  grants or Realtime publication.
- A trusted future completion writer inserting a quest catch invokes a database
  trigger: it derives rarity from the accepted reward's live catalogue definition,
  takes the largest joined containing party (not the union), freezes all containing
  parties, and saves one independent roll. Pending invites do not count. A unique
  quest-reward index, duplicate-insert guard and update guard prevent outcome
  rerolls. All joined participants can subsequently receive their independent
  reward using the frozen size; they are not rewarded for another person's visits.
- `rarity`, `copies` and `party_size` are returned for quest catches in own/friend
  books. Normal spot/popup/org catch payloads retain their original shape.

The trigger supplies party bonuses only. It does not decide whether a quest was
completed, add a claim endpoint, auto-grant all members' rewards, or change the
existing `/api/catch` rejection of quest-source requests. The completion writer
must check the traveller's own required visits before inserting. The pure server
rule reference in `server/src/db/party-rewards.ts` is tested against the shipped
client's probability boundaries and rarity caps.

Frontend integration also needs to replace live local-only quest acceptance with
`POST /api/quests/:id/accept` and hydrate `GET /api/me/quests`. Do not enable live
parties while acceptance and membership still come from browser storage. Keep
the demo auto-accept timer in demo mode only; live invites need a real response.

Tests cover route authentication/validation, RPC response privacy, reward-rule
parity, and all six migrations in disposable PostgreSQL. The SQL fixture tests
membership, capacity, private inboxes, overlapping-party sizing, automatic
acceptance, frozen membership, persisted rolls and retries. PGlite uses one
connection; simultaneous transactions and hosted authenticated users require
an additional integration test. No test users are created in hosted Supabase.
