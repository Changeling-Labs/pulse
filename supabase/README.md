# Pulse sync — backend setup (Supabase)

Pulse sync is **opt-in**: without a signed-in user, Pulse sends no sync traffic and no health data leaves the device. Design decisions, in short:

- One table, `sync_rows`, carries every data domain. Each row is one JSON delta of one record.
- Row-level security isolates every user's rows (`auth.uid() = user_id` for select/insert/update/delete).
- Conflict resolution is last-writer-wins per record on the client, with payload-level deterministic tie-breaking.
- Deletes propagate as tombstones (`deleted_at` is set; the row is not removed, so wiped devices do not resurrect data).
- The `sync_queue` (called the `dirty` store locally) never stores payload diffs or credentials; it only tracks keys whose local records need to be pushed.

## Sign-in is an emailed code, not a magic link

An installed iOS home-screen app has its own storage, isolated from Safari. A magic link always opens in Safari (or the phone's default browser), so it signs in a **different copy of Pulse** — the installed app stays signed out. A code typed into the app is verified inside the app's own storage on every platform, and `autocomplete="one-time-code"` lets iOS/Android offer the code from the email automatically.

The app calls `signInWithOtp({ email })` and then `verifyOtp({ email, token, type: 'email' })`. The email template supplies `{{ .Token }}`. The link is not used.

## One-time setup (owner account)

1. **Apply the schema.** Open the project → SQL Editor, paste all of `schema.sql`, hit **Run**. (Or `supabase db push` if you wire the CLI; the file is idempotent.)
2. **Whitelist the app URLs.** Open Authentication → URL Configuration:
   - Site URL: `https://changelinglabs.com/pulse/`
   - Redirect URLs: `https://changelinglabs.com/pulse/`, `https://www.changelinglabs.com/pulse/`, and the exact local URL(s) you test on (for example `http://localhost:8930/`)

   If you serve Pulse from any other origin (another domain, a preview host, a new local port), add that exact directory URL too. Supabase rejects a send when `emailRedirectTo` is not allowlisted.

   The email no longer contains a link, but Supabase still validates the `emailRedirectTo` sent by the client, so this allowlist must exist.
3. **Make the email code-only.** Authentication → Email Templates → edit **both**:
   - **Magic Link**
   - **Confirm signup**

   Replace each body with `email-templates/sign-in-code.html`, and set the subject to something like **Your Pulse sign-in code**. Remove `{{ .ConfirmationURL }}` entirely. Keep only `{{ .Token }}` and normal copy.
4. **Email provider.** Authentication → Providers → Email stays on (default). A custom SMTP provider is recommended for production volume. Raise Authentication → Rate Limits → **Rate limit for sending emails** if you expect more than a couple of sign-ins per hour. The app maps Supabase's rate-limit error to a plain "wait a minute" message.

> A link left in the template can be prefetched by a mail scanner or tapped by the user, consuming the one-time token before the code is entered. Code-only is what makes this flow reliable.

## Key rules

- The publishable (`sb_publishable_…`) key ships in `js/sync-config.js` and in the public bundle. That's expected; it is designed to be public.
- The `service_role` key must **never** be committed, pasted into the app, or shared in plain text. The client never sees it.
- `js/sync-config.js` only holds the URL and publishable key. `.gitignore` governs everything else in `.env`-style territory, which is exactly what this setup produces: nothing secret in git.
- Sign-out uses `scope: 'local'`, so signing out a stray browser tab does not knock the installed app or another phone offline.

## Verifying it works

`npm test` runs the pure sync logic; `node --test test/sync_core.test.js` is the focus. Email and code validation live there too.

Live verification uses your real email: Settings → Cloud Sync → **Email me a code**, then enter the code in the installed app. Confirm `sync_rows` in the Supabase table editor (or query `select count(*) from sync_rows;`).

If the email still contains a link, the template in step 3 was not replaced — the app accepts the code, but a prefetched link can invalidate it.

## Known limits

- **Backup restore does not reconcile against the cloud.** Importing a backup replaces local records; existing remote rows that the import deletes are not wiped. After a restore, sign out and back in, then use **Reset cloud to match this device** — it deletes every remote row for the account and re-uploads this device's state.
- Preferences are not synced. Only the six data domains in `schema.sql`.
- Each browser/profile and each installed app copy signs in separately. That is a platform storage boundary, not a Pulse bug; the code makes it a 20-second step instead of a dead end.
