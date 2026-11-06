# Pulse sync — backend setup (Supabase)

Pulse sync is **opt-in**: without a signed-in user, zero network traffic occurs and no data leaves the device. Design decisions, in short:

- One table, `sync_rows`, carries every data domain. Each row is one JSON delta of one record.
- Row-level security isolates every user's rows (`auth.uid() = user_id` for select/insert/update/delete).
- Conflict resolution is last-writer-wins per record on the client, with payload-level deterministic tie-breaking.
- Deletes propagate as tombstones (`deleted_at` is set; the row is not removed, so wiped devices do not resurrect data).
- The `sync_queue` (called the `dirty` store locally) never stores payload diffs or credentials; it only tracks keys whose local records need to be pushed.

## One-time setup (owner account)

1. **Apply the schema.** Open the project → SQL Editor, paste all of `schema.sql`, hit **Run**. (Or `supabase db push` if you wire the CLI; the file is idempotent.)
2. **Whitelist the app URLs.** Open Authentication → URL Configuration:
   - Site URL: `https://changelinglabs.com/pulse/`
   - Redirect URLs (add both): `https://changelinglabs.com/pulse/` and `http://localhost:8930/`
3. **Email provider.** Authentication → Providers → Email stays on (default). Free tier is enough for personal use — be aware of the default email rate limit; don't send test magic links repeatedly.
4. (Optional) Authentication → Sign in → disable "Confirm email changes" if you want frictionless sign-in on new devices; keep it on otherwise.

## Key rules

- The publishable (`sb_publishable_…`) key ships in `js/sync-config.js` and in the public bundle. That's expected; it is designed to be public.
- The `service_role` key must **never** be committed, pasted into the app, or shared in plain text. The client never sees it.
- `js/sync-config.js` only holds the URL and publishable key. `.gitignore` governs everything else in `.env`-style territory, which is exactly what this setup produces: nothing secret in git.

## Verifying it works

`npm test` runs the pure sync logic; `node --test test/sync_core.test.js` is the focus.
Live verification uses your real email: sign in from Settings → Cloud Sync, then open the Supabase table editor and confirm the `sync_rows` entries (or query it with `select count(*) from sync_rows;`).

## Known limits (v2.4.0)

- **Backup restore (Settings → Import) does not reconcile against the cloud.** Importing a backup replaces local records; existing remote rows that the import deletes are not wiped. After a restore, sign out and back in, then Sync — the client re-asserts its view locally; full cloud-reset reconciliation is queued for v2.5.0.
- Preferences and auto-sync (push on every change) are not wired yet; the user taps **Sync now** (added v2.4.0). v2.5.0 will add automatic background sync.
