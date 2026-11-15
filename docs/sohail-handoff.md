# Sohail → team integration handoff

## Current priority: sign-in deferred

Use `npm run dev:demo` and open http://127.0.0.1:5173/dev/ai to exercise the real AI report route without OTP or Supabase. This explicit development mode uses a single `local-demo` identity and an in-memory popup store. Pins expire on read and reset on restart. Normal operation still requires USC sessions. Demo mode binds both servers to loopback and refuses non-development startup.

`/dev/ai/popups` is a local workbench endpoint, not a replacement for the agreed Supabase Realtime contract. Kartik's database router is not mounted in this mode. Cal's real content remains required for quest/guide requests; there are no invented USC facts or production content substitutes. Product frontend owners can use the no-login AI endpoints while running this local mode, and reconnect real auth/data when ready.

## Kartik

Kartik's backend foundation is now present and its shared types/helpers are integrated. AI code imports no SQL and does not modify the data folders. The mounted interfaces are:

1. `server/src/routes/index.ts`: default-export an Express Router, using `/spots`, `/catch`, `/popups/:id/confirm`, etc. paths (no `/api` prefix). Sohail's entry point mounts it at `/api` when present at startup. Restart after first adding it.
2. `server/src/db/popups.ts`: named exports matching `PopupStore` in `server/src/ai/contracts.ts`:

```ts
createPopup(input: {
  lat: number; lng: number; brand: string; freebies: string[];
  sticker: { key: string; name: string; colors: string[]; lore: string;
             source: 'popup'; variant: 'special' };
  expires_at: string; confirmations: number; status: 'live' | 'expired';
  reporter_id: string;
}): Promise<Popup>

findNearbyPopup(input: {
  lat: number; lng: number; withinMeters: number;
  since: string; brand: string;
}): Promise<(Popup & { created_at: string }) | null>
```

`Popup` is the exact plan response shape. `created_at` is needed to enforce the two-hour rule; return it as lookup metadata from your timestamps. Search only matching normalized brand, within 100 m, creation at/after `since`, live and unexpired. The AI service rechecks those constraints. Realtime should publish persisted new popups normally. Never return reporter identity to the client.

Kartik's create_popup RPC now locks and rechecks duplicate creation transactionally. If a concurrent creation returns an existing row, the current two-helper API can still report merged_into: null; clients should upsert pins by ID. New accepted popups create a private reports entry; rejected/merged audit records still need an agreed helper and are not silently implemented in the AI folder.

`shared/types.ts` is now available; AI contracts and frontend types re-export its types, while runtime model/content validation stays in the AI folder. No service-role key is used to verify users. `authenticate(token)` in `server/src/ai/integrations.ts` uses Supabase `auth.getUser(token)` and requires a confirmed exact `@usc.edu` email, rejecting anonymous users. Reuse this check for protected backend actions. Enforce the same policy in RLS for direct client database access; the AI guard cannot protect Supabase's Data API. Account creation can be restricted with Supabase's Before User Created domain hook.

## Cal

- `content/quests.json`: JSON array of plan-shaped quests (`id`, `title`, `blurb`, 3–5 `spot_ids`, `reward_sticker_key`).
- `content/guide-pages/*.txt` or `*.md`: HTTPS USC URL on the first line, optional `# Title` immediately on the second, then plain text. Only `usc.edu` and its subdomains are accepted. At most 20 pages, with the first 1,500 text characters from each used for local context; put useful information first.
- The eight initial AI sticker keys are `bubble`, `star`, `book`, `bowl`, `leaf`, `bolt`, `heart`, `flag`. Confirm these filenames with Sohail before drawing, or agree on updated keys in the AI schema. Sticker colors are 2–3 hex values.

## Manaswi / Shibhiya

Use relative `/api` URLs and attach the verified USC user's Supabase access token as a Bearer token, including multipart requests. Let the browser set multipart Content-Type. Display `{ error }` on non-2xx responses. A 200 report response can have `accepted: false`; display `reject_reason`. A merge returns `merged_into` and the existing popup. Don't add a duplicate pin.

**Auth plan change:** use USC email OTP, with anonymous auth disabled. Manaswi owns the client implementation. Normalize the email with `trim().toLowerCase()`, validate it as an email with the exact `usc.edu` domain, then call `supabase.auth.signInWithOtp({ email })`. For the entered code, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`; use the returned session or existing Supabase session lifecycle to send Bearer tokens. Handle cooldown, expired/incorrect codes, and API 401/403 responses. Supabase sends/verifies the OTP; no AI or custom auth endpoint is involved. Its OTP length follows project configuration rather than an app-hardcoded assumption.

Deferred Supabase dashboard setup: enable Email auth and email confirmation, keep anonymous sign-ins disabled, and put `{{ .Token }}` in both signup and Magic Link email templates. Custom SMTP is required to edit the templates and deliver to arbitrary students outside the project team. OTP verification remains untested; setup is paused.

Guide answers are source excerpts, with `{title, url}` citations. Quests return existing authored objects in suggested order. There is no production mock fallback, auth bypass or paid API dependency.

## Operational limits / remaining work

- In-memory rate limits reset on restart and are per process; move to shared storage for multiple instances. Limits currently apply per verified USC account.
- For remote hosting, need a privately reachable Ollama host; the local default works only when Express and Ollama share a host.
- Kartik's helpers and read routes are present. Hosted migrations, server-side database credentials, Cal's content and remaining catch/friend write routes are still needed before end-to-end persistence and Realtime can be verified.
- Need teammates' GitHub handles to invite them. No invitations or messages have been sent. No hosting provider is required for local development.
- Rejected/malformed photos consume a report attempt. The service never persists image bytes; request bytes exist transiently during inference.
