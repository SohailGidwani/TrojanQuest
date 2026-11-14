# Sohail → team integration handoff

## Kartik

AI code imports no SQL and does not modify your folders. Provide:

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

The two-helper interface cannot make the read-then-insert atomic across concurrent reports; the DB owner should make creation deduplicate transactionally before a busy public launch. The service currently guarantees sequential report deduplication. If the `reports` table needs per-report verdict records, we need one additional agreed helper; it is not silently implemented in the AI folder.

Provide `shared/types.ts`; Sohail's temporary AI boundary types are in `server/src/ai/contracts.ts`. They don't overwrite the shared contract. No service-role key is used to verify users. `authenticate(token)` in `server/src/ai/integrations.ts` uses Supabase `auth.getUser(token)` and requires a confirmed exact `@usc.edu` email, rejecting anonymous users. Reuse this check for protected backend actions. Enforce the same policy in RLS for direct client database access; the AI guard cannot protect Supabase's Data API. Account creation can be restricted with Supabase's Before User Created domain hook.

## Cal

- `content/quests.json`: JSON array of plan-shaped quests (`id`, `title`, `blurb`, 3–5 `spot_ids`, `reward_sticker_key`).
- `content/guide-pages/*.txt` or `*.md`: HTTPS USC URL on the first line, optional `# Title` immediately on the second, then plain text. Only `usc.edu` and its subdomains are accepted. At most 20 pages, with the first 1,500 text characters from each used for local context; put useful information first.
- The eight initial AI sticker keys are `bubble`, `star`, `book`, `bowl`, `leaf`, `bolt`, `heart`, `flag`. Confirm these filenames with Sohail before drawing, or agree on updated keys in the AI schema. Sticker colors are 2–3 hex values.

## Manaswi / Shibhiya

Use relative `/api` URLs and attach the verified USC user's Supabase access token as a Bearer token, including multipart requests. Let the browser set multipart Content-Type. Display `{ error }` on non-2xx responses. A 200 report response can have `accepted: false`; display `reject_reason`. A merge returns `merged_into` and the existing popup. Don't add a duplicate pin.

**Auth plan change:** use USC email OTP, with anonymous auth disabled. Manaswi owns the client implementation. Normalize the email with `trim().toLowerCase()`, validate it as an email with the exact `usc.edu` domain, then call `supabase.auth.signInWithOtp({ email })`. For the entered code, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`; use the returned session or existing Supabase session lifecycle to send Bearer tokens. Handle cooldown, expired/incorrect codes, and API 401/403 responses. Supabase sends/verifies the OTP; no AI or custom auth endpoint is involved. Its OTP length follows project configuration rather than an app-hardcoded assumption.

Supabase dashboard setup: enable Email auth and email confirmation, keep anonymous sign-ins disabled, and put `{{ .Token }}` in the Magic Link email template. Custom SMTP is needed to deliver to arbitrary students outside the project team. No real OTP email has been sent or verified yet.

Guide answers are source excerpts, with `{title, url}` citations. Quests return existing authored objects in suggested order. There is no production mock fallback, auth bypass or paid API dependency.

## Operational limits / remaining work

- In-memory rate limits reset on restart and are per process; move to shared storage for multiple instances. Limits currently apply per verified USC account.
- For remote hosting, need a privately reachable Ollama host; the local default works only when Express and Ollama share a host.
- Need real Supabase credentials, Kartik's helpers/routes and Cal's content before end-to-end photo → database → Realtime can be verified.
- Need teammates' GitHub handles to invite them. No invitations or messages have been sent. No hosting provider is required for local development.
- Rejected/malformed photos consume a report attempt. The service never persists image bytes; request bytes exist transiently during inference.
