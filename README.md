# 🫀 Project Pulse

> **A local-first, zero-cost, open-source health engine built to combat chronic disease through lifelong physical capability, metabolic tracking, and recovery.**

**Pulse** is the continuation of [Iron Log](https://github.com/edmundashdown/iron-log) — same codebase, same local-first DNA, wider mission. The movement engine shipped as Iron Log v1.8.2; Pulse extends it into a general health app: **Pulse Move** (strength, circuits, intervals), **Pulse Fuel** (nutrition) and **Pulse Recover** (mobility, sleep, rest).

**Live:** https://changelinglabs.com/pulse/ (served from this repo via GitHub Pages; formerly `edmundashdown.github.io/pulse/`).

## 🎯 The Mission: Why Pulse Exists

Modern cardiovascular disease, metabolic dysfunction, and physical decline are the primary drivers of preventable human suffering. The world does not need another subscription-based wellness app designed to capture user data or force monetization. **Pulse is a free, open-source, offline-first health engine built to extend healthspan and save lives.**

### The Global Crisis in Numbers

```
Global Annual Mortality by Primary Cause (Millions)
┌─────────────────────────────────────────────────────────┐
│ Cardiovascular Disease (CVD)   █████████████████ 17.9M │
│ Cancer                         █████████ 9.6M           │
│ Chronic Respiratory Disease    ████ 3.9M                │
│ Diabetes & Kidney Disease      ██ 2.0M                  │
└─────────────────────────────────────────────────────────┘
```

- **80% Preventable:** Up to 80% of premature heart attacks and strokes are preventable through lifestyle modifications — specifically cardiorespiratory fitness, muscle mass retention, metabolic control, and stress management.
- **Diet as the Primary Driver:** Poor dietary quality causes ~11 million deaths annually — surpassing physical inactivity as the single largest global risk factor for cardiovascular mortality.
- **The Fitness Defense:** Cardiorespiratory fitness (VO₂ max) and muscle strength show an inverse, linear relationship with all-cause mortality. High muscle mass and functional capacity delay arterial aging and metabolic decay by decades.
- **The Accessibility & Knowledge Gap:** Most health apps lock basic tracking behind subscriptions, while social media spreads dangerous nutritional myths. **Pulse combines frictionless, low-cost tracking with embedded, science-backed micro-education.**

## 🎨 Branding & Aesthetic Vision

- **Name:** **Pulse** (Sub-modules: *Pulse Move*, *Pulse Fuel*, *Pulse Recover*)
- **Tagline:** _Engineered for Healthspan._
- **Aesthetic Direction:** Industrial Minimalist, in the Changeling Labs palette — Deep Navy background (`#0B111E`), Electric Deep Blue (`#0056D2`) for actions, Glowing Turquoise (`#00F5FF`) for live/accent information, Barlow Condensed display type over Inter. Contrast is a requirement, not a preference: every label tier clears WCAG AA on its own surface.
- **Core Ethos:** Local-first data ownership, instant response times, zero tracking scripts, no paywalls.

## 🏗️ Architecture & Core Principles

Pulse is built as a **Local-First Micro-Kernel**. The client-side database (IndexedDB) is the single source of truth. The UI never waits for network requests or cloud backends to log a set, record a meal, or run a timer.

```
                      ┌─────────────────────────────────┐
                      │          Pulse Shell            │
                      │  (PWA, SW, Local-First DB,      │
                      │   Theme System, Cloud Sync)     │
                      └────────────────┬────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
│     Pulse MOVE        │    │      Pulse FUEL       │    │     Pulse RECOVER     │
│  (Strength, Circuits, │    │  (Hand-Portions,      │    │ (Guided Mobility,     │
│   Intervals, Plates)  │    │  Protein, Myth Cards) │    │  Sleep, Rest Protocols)│
└───────────────────────┘    └───────────────────────┘    └───────────────────────┘
```

1. **Offline-First:** Runs completely client-side. Service Worker caching guarantees full functionality in gym basements or remote trails.
2. **Zero-Cost Backend:** Local-first sync architecture (IndexedDB + optional encrypted Supabase background sync), keeping infrastructure costs near zero.
3. **Data Sovereignty:** Full JSON/CSV data export and import. Your health data remains yours forever.

> **One database per domain.** Pulse Move records live in the *shared* `iron-log` store (see Data model) — open at `DB_VERSION = 3` forever. Pulse **Fuel** logs live in their own `pulse-fuel` database (version 1) and Pulse **Recover** check-ins in `pulse-recover` (version 1), because both need new object stores and the shared store must not change. All three are exported/imported by the backup system.

## 🗺️ Product Roadmap & Developer Execution Plan

Note for AI Coding Agents and Developers: follow the execution steps sequentially. Do not modify completed phases unless fixing a failing test.

### Phase 1: Core Foundation & Movement Engine (Complete — v1.8.2) ✅

- [x] Data Foundation: Multi-metric set logging with schema migration layers (`js/schema.js`).
- [x] Input Optimization: Dynamic weight/rep modal with live barbell plate loader and rep steppers (`js/calc.js`).
- [x] Structure & Timing: Superset/circuit containers with round-based pacing and background-resilient rest/interval timers (`js/timer.js`, `js/circuits.js`).
- [x] Unit & Equipment Support: Imperial/metric display handling, literal plate inventory management.
- [x] Dynamic Metric & PR Engine (Pulse v2.1.0): Exercises declare multiple metrics; composite sets; per-metric bests in the Progress tab.

### Phase 2: Pulse FUEL — Low-Friction Nutrition & Education (Complete — v2.2.0) ✅

- [x] **Schema Extension & Data Layer** — `fuel_logs` + `water_logs` in a dedicated `pulse-fuel` database (`js/db.js`); `normalizeFuelLog`/`validateFuelLog`/`normalizeWaterLog` in `js/schema.js`; backups export both arrays (`BACKUP_VERSION` 4).
- [x] **Business Logic & Myth-Card Engine** — `js/fuel.js`: `calcHandPortions()` (25g protein/palm, 15g carb/cupped, 10g fat/thumb), 10 embedded science-backed myth-buster cards (`getDailyMythCard`, `getRandomMythCard`).
- [x] **UI & Tab Integration** — Fuel tab with hand-portion estimator modal, protein/quality/hydration meters, daily myth card, `pulse-fuel` persistence.

### Phase 3: Refactor & Cloud Sync Engine (Q1 2027) 🚧

- [x] **Step 3.1: Kernel Extraction (v2.3.0)** — `app.js` is now a 13-line entry; kernel owns state/routing/boot (`js/kernel/shell.js`), shared helpers (`js/kernel/helpers.js`); Move lives in `js/modules/move/`, Fuel in `js/modules/fuel/`, Settings in `js/modules/settings.js`. No build step, zero behavior change.
- [x] **Step 3.2: Local-First Supabase Sync Engine (v2.4.0 → v2.5.0)** — Optional magic-link auth; `sync_rows` table with row-level security; local-first `pulse-sync.dirty` queue; last-write-wins with a payload tiebreak; background auto-sync on save/visibility/reconnect. See **Cloud Sync** below.

### Phase 4: Pulse RECOVER — Mobility & Rest Protocols (Q2 2027) 📅

- [x] **Step 4.1: Guided Stretching & Timed Protocols (v2.7.0)** — `js/intervals.js` (pure, tested) builds EMOM, Tabata, 30/30, 40/20 and custom work/rest plans plus static-hold mobility routines; `js/modules/move/intervals.js` runs them full-screen with phase cues (audio + haptics), pause/skip/end, screen wake lock and a last-session summary.
- [x] **Step 4.2: Recovery & Fatigue Tracking (v2.8.0)** — `recovery_logs` in a dedicated `pulse-recover` database (one check-in per local day: sleep, soreness 1–10, resting HR, notes); a **Recover** tab with a daily check-in card, 7/30-day averages and deltas, per-metric trend bars and editable history; `js/recover.js` (pure, tested) owns the date windows and stats. Backups carry `recoveryLogs`, and check-ins sync as a sixth domain.

### Phase 5: Holistic Health Insights & Integrations (Q3 2027) 📅

- [x] **Step 5.1: Training ↔ Recovery Insights (v2.9.0)** — `js/insights.js` (pure, tested) buckets training into completed Monday–Sunday weeks, splits them at the median weekly set count, and compares sleep, soreness and resting HR between heavier and lighter weeks. It also reports Pearson correlations and one plain-language readout. Deliberately descriptive: no readiness score, no prediction, no advice.
- [x] **Step 5.2: Open Exports (v2.10.0)** — Settings gains one-click CSV snapshots (sets, fuel, water, recovery) and a weekly Markdown note shaped for Obsidian. `js/exports.js` (pure, tested) builds the strings; `js/download.js` hands them to the browser. Read-only — the JSON backup stays the restore path.
- [x] **Reliability pass (v2.11.0)** — iOS audio hardening: the cue layer now resumes a context parked in `interrupted`, declares a `playback` audio session (so the ring/silent switch no longer mutes timer cues), unlocks with a silent buffer, and re-primes on the next gesture after backgrounding. Settings gains a **Test sound** button. Fuel myth cards got a conservative evidence pass plus a permanent "Educational only — not medical advice" line.
- [x] **Progress → Trends (v2.12.0–v2.13.0)** — the PRs tab becomes **Progress**, with a Records | Trends switch. Trends is descriptive only: weekly tonnage and sessions-per-week charts over 4 weeks / 12 weeks / 1 year, a summary row (training days, sets, tonnage, sessions per week), a top-set sparkline per lift for the last 8 sessions, a training-day consistency heatmap, bodyweight (optional Recover field) with a weekly-average line, weekly sleep/soreness/resting-HR means, and fuel trends (protein, water, whole-food share). Gaps render as gaps, a zero-tonnage week renders as a hairline, and deltas use complete weeks only. No score, no target, no prediction. `js/trends.js` is pure and tested (29 tests).
- [x] **Move (v2.14.0)** — the Log tab becomes **Move**, the nav reads **Fuel → Move → Recover** (the daily cycle), and Move gains a one-tap **Just move** session generator: pick time (5–30 min), focus, level, equipment and impact, then work through a self-paced round checklist. Bodyweight reps log as `output`, holds as `timed`; each completed round is written as one circuit. `js/movements.js` is pure and tested (14 tests). No DB version bump, no new store, no mandatory network call.
- [x] **Move: today's session (v2.15.0)** — Move gains a segmented **Today | Programs | Planner** switch, persisted as the `moveView` preference, and Planner folds in as a sub-view so the nav drops to **five tabs**. **Today's move** is deterministic from the local date over a five-day cycle — full body, cardio, core, mobility, rest — with the stored level scaling the work. Mobility days launch an existing hold routine; rest days are first-class and say rest is training, not failure. A fully completed daily session is marked with the `moveDailyDone` date preference. Planner data and maths are unchanged; no DB version bump and no network call.
- [x] **Move: strength path clarity (v2.15.1)** — after Today's move became the hero, the bare `+` no longer made it obvious that lifts could be logged. The Today pane gains a compact **Strength training** card with **Log a set** and **Log a circuit**, the bottom card becomes **Today's training** with a `＋ Log` action, the empty state has a real **Log your first lift** button, and the Move FAB is now an extended **＋ Log set** label. No data or schema change.
- [x] **Move: starter programmes (v2.16.0)** — three embedded plans: **3-day full body** (4 weeks), **4-day upper / lower** (4 weeks), and a **6-week beginner** ramp. The Programs pane lists them; starting one loads the session into the Planner with a banner to mark it done. The Today pane shows the next unfinished session with **Continue where you left off**, and a first-run device sees the starter programme card instead of an empty prompt. Progress lives in the `moveProgramme` preference. `js/programmes.js` is pure and tested (10 tests); no DB version bump and no network call.
- [x] **Move: adaptive generation (v2.17.0)** — exercises carry an additive `pattern` (push, pull, squat, hinge, carry, core, cardio, mobility) inferred from the name for older records. `js/adaptive.js` adds six goal profiles, weighs the largest real pattern gaps, and chooses today's focus. The card explains the choice in one sentence, shows days since each pattern, and swaps in mobility when the latest check-in has soreness ≥7 or sleep <6 — with **Do the usual session instead** as a one-tap override. Additive and offline: no DB version bump, no new store, no readiness score.
- [x] **Accessibility + reliability pass (v2.18.0)** — skip link, visible keyboard focus rings, `aria-current` nav, labelled icon-only buttons, and dialogs that are inert while closed, trap Tab, close on Escape and restore focus. Reduced motion disables confetti and minimises CSS transitions. Storage failures get a friendly banner or boot card with **Export backup now**. Lighthouse: **100 Accessibility, 100 Best Practices, 100 SEO**. The physical screen-reader/device pass remains on the checklist.
- [ ] Integrations & Export: Notion, Apple Health, and Strava (needs OAuth; deferred with 5.3).
- [ ] Native Mobile Packages: optional Capacitor/Ionic wrappers.

## Running locally

Serve over HTTP (required for ES modules):

```bash
python3 -m http.server 8080
```

## Project structure

```
pulse/
  index.html        # App shell + log & fuel modals
  manifest.json     # PWA manifest
  sw.js             # Service worker (offline support)
  css/app.css       # All styles
  js/
    app.js          # 13-line entry — imports modules, calls kernel boot()
    kernel/
      shell.js      # State, tab registry (registerTab/registerInit), routing, boot
      helpers.js    # Shared DOM/format helpers (dw, fmtDate, …)
      a11y.js       # Dialog focus trap/inert/Escape + reduced-motion helper
      errors.js     # Storage/boot error classification + export escape hatch
    modules/
      move/         # log.js (Move shell: Today | Programs | Planner),
                    # quick.js (daily + Just move sessions), programme.js
                    # (starter-plan UI + continuation), modal.js
                    # (log modal + circuits), timer.js (rest bar), intervals.js
                    # (EMOM/Tabata/holds runner), progress.js, planner.js,
                    # shared.js (exercise helpers)
      fuel/         # fuel.js — Fuel tab + portion modal
      recover/      # recover.js — Recover check-in, trends, history
      settings.js   # Settings tab
    db.js           # IndexedDB layer (shared `iron-log` store + `pulse-fuel` / `pulse-recover` DBs)
    schema.js       # Set/exercise/fuel/recovery schema, validation, backup migration
    circuits.js     # Circuit grouping (supersets)
    timer.js        # Rest countdown model
    intervals.js    # Interval/hold plan model (EMOM, Tabata, mobility)
    movements.js    # Quick-session movement library + generator, daily cycle (pure)
    programmes.js   # Three embedded starter programmes + session sequence (pure)
    adaptive.js     # Goal profiles, pattern gaps and recovery-aware daily choice (pure)
    patterns.js     # Movement-pattern taxonomy + name inference (pure)
    cues.js         # Shared beeps + vibration patterns
    dates.js        # Local calendar-day helpers
    calc.js         # Plate calculator + session plan
    confetti.js     # Set completion celebration
    backup.js       # JSON export/import (exercises, sets, fuel, water, recovery, equipment)
    pr.js           # Dynamic PR engine (bests per metric)
    fuel.js         # Pulse Fuel logic (hand portions, myth cards)
    recover.js      # Pulse Recover logic (date windows, averages, deltas)
    insights.js     # Training volume ↔ recovery comparison (descriptive)
    trends.js       # Weekly trend series, heatmap, body/fuel series + SVG chart strings
    exports.js      # CSV + weekly Markdown builders (read-only snapshots)
    download.js     # Blob/anchor download helper
    version.js      # Version string
  test/             # Node built-in test runner
  icons/            # App icons
```

### Progress

The **Progress** tab holds two views:

- **Records** — 1RM/3RM/5RM, best volume set and per-metric bests, filtered by the PR window (3 months → all time).
- **Trends** — range of 4 weeks, 12 weeks or 1 year, with a summary row (training days, sets, tonnage, sessions per week) plus:
  - weekly tonnage and sessions-per-week bars
  - a **consistency heatmap** of training days (one column per week, Monday → Sunday)
  - a top-set **sparkline per lift** for its last 8 sessions
  - **bodyweight** — latest, a weekly-average line, and the first → last change across the window
  - **body signals** — weekly means for sleep, soreness and resting HR
  - **fuel** — mean daily protein, mean daily water and whole-food share

Trends are deliberately **descriptive**: no readiness score, no target line, no projection, no "good/bad" language. Missing weeks are drawn as gaps rather than zeros, a week with sets but no tonnage (bodyweight or timed work) gets a hairline bar instead of disappearing, future heatmap days are outlined rather than blank, and percentage changes are always labelled as *vs the previous window of the same length*. Bodyweight direction is explicitly not a verdict. All maths happens on-device from IndexedDB — no network, no new store.

Bodyweight is optional on the daily Recover check-in and stored as `weightLbs` (pounds, like every other weight), entered and displayed in the unit chosen in Settings. It is an additive per-record field: no DB version bump and no extra sync domain.

### Move

The **Move** tab is the daily action surface. It has three segments — **Today | Programs | Planner** — persisted as the `moveView` preference, mirroring Progress's Records | Trends switch:

- **Today** — today's adaptive move with its one-line reason, the **Strength training** card, the **Just move** card, today's stats and the sets already logged.
- **Programs** — the three starter programmes, plus the interval protocols and mobility holds for running something on its own.
- **Planner** — the session planner, unchanged apart from living inside Move.

**Starter programmes.** Three embedded plans: **3-day full body** (4 weeks), **4-day upper / lower** (4 weeks), and a **6-week beginner** ramp that starts with two sets and adds a little each week. Starting a plan loads the session into the Planner with a banner to mark it done; the Today pane always shows the next unfinished session with **Continue where you left off**. Progress is stored in the `moveProgramme` preference, so it survives a reload, and a first-run device sees the starter programme card instead of an empty prompt. Plans use percentage-of-1RM sets, so target weights appear once the matching PR exists — log a set and the Planner has a baseline.

**Adaptive generation.** Exercises carry an additive `pattern` (push, pull, squat, hinge, carry, core, cardio, mobility), inferred from the name for records created before v2.17.0 and passed explicitly by quick sessions. `js/adaptive.js` has six goal profiles — **Get moving, Build strength, Lose fat keep muscle, Return to activity, Heart health, Preserve muscle** — each a small weighting table, no machine learning. Today's move picks the focus with the largest real pattern gap weighted by the goal, then says why in one sentence (for example, "Full body today — you haven't pulled in 20 days"). The Programs pane has a Goal card and a pattern-balance row showing days since every pattern. A latest check-in with soreness ≥7 or sleep <6 swaps in mobility with a plain-language reason and a **Do the usual session instead** override. No readiness score, no diagnosis, no prediction — every suggestion is editable and skippable.

**Today's move** is deterministic from the local date, like the Fuel myth-card rotation: every install sees the same kind of day. A fixed five-day cycle — **full body, cardio, core, mobility, rest** — is anchored to 2026-01-01, so the kind of day is a pure function of the date. The stored level preference scales reps and holds; it never changes the kind of day.

- **Full body / cardio / core** build a normal quick session (15 min, or 10 for core) with a date-derived seed, so the session is stable for that day and different the next time that kind comes round.
- **Mobility** launches one of the existing hold routines (`lower` / `upper`), alternating across the cycle. Nothing is regenerated.
- **Rest** is first-class: the card says rest is training, not failure, lists three gentle recovery steps and links straight to Recover.
- **Completion** — a fully completed daily session writes the local date to the `moveDailyDone` preference; the card then says "Done for today" and offers a repeat. Ending early saves the work but does not claim the day.

**Logging your own strength work** is a visible second path, not just a FAB. A compact **Strength training** card sits under today's move with **Log a set** and **Log a circuit**; the **Today's training** card header repeats `＋ Log` next to the history it creates; and the empty state offers **Log your first lift** instead of explaining the `+`. On Move the FAB is extended to read **＋ Log set**; on other tabs it stays a compact circle.

The **Just move** card generates a no-equipment circuit from a small library of push, pull, squat, hinge, core and cardio movements:

- **Options** — 5/10/15/20/30 minutes, focus (full body, upper, lower, core, cardio), level (new, getting back, regular), equipment (nothing, dumbbells, bands) and impact (low, jumping ok). Preferences persist as the `moveQuick` device preference.
- **Session** — a self-paced round checklist with a per-movement hold timer. Tick what you actually did; completing a round writes those sets as one circuit (`groupId` + `round`), so it renders with the normal circuit block. Closing mid-round saves nothing.
- **Logging shape** — bodyweight reps log as `output` (the app's generic rep count) and holds as `timed`. Generated sets carry additive `source: "quick"` and `unitLabel: "reps" | "sec"`; quick blocks hide the interval runner button because they are not a timed circuit.
- **No new data model** — exercises are created lazily per prescribed variant (Incline push-up, Knee push-up, Push-up), so each variant keeps its own honest history and PR. The generator is pure (`js/movements.js`), seeded for repeatability, and makes no network call.

The nav reads **Fuel → Move → Recover → Progress → Settings**: eat, move, adapt. Move remains the boot/landing tab and the FAB target even though it sits second.

### Accessibility and reliability

- **Keyboard path.** A **Skip to content** link, visible focus rings on every interactive control, `aria-current="page"` on the active nav tab, and labels on every icon-only button.
- **Dialogs.** The log, fuel, quick-session and interval overlays are `inert` and `aria-hidden` while closed, trap Tab while open, close on Escape, and restore focus to the trigger. Focus moves into the first field or the session panel on open.
- **Reduced motion.** Confetti is skipped entirely when `prefers-reduced-motion: reduce` is set, and the existing CSS block collapses transitions and animations. There are no timer pulse or chart animations to disable.
- **Contrast.** `--text-3` on `--surface` is **5.54:1**, on `--surface-2` **4.99:1**; `--text-2` is **6.99:1** or better; active metric chips are **9.09:1**. All pass WCAG AA for normal text.
- **Failure paths.** `js/kernel/errors.js` classifies quota and database failures. A save failure shows an assertive banner with **Export backup now**; a boot failure replaces the loading screen with a card offering Reload and the same export escape hatch. The database is never silently lost.
- **Audit.** Lighthouse on the Move tab reports **100 Accessibility, 100 Best Practices, 100 SEO**. The physical VoiceOver/TalkBack and real-device rows live in the device checklist.

## Data model

**Move.** A logged set carries the fields for **every metric its exercise declares** (see `js/schema.js`). `type` records the *primary* metric (the first one declared) for backwards compatibility:

| Metric     | Fields                 | Example          |
|------------|------------------------|------------------|
| `strength` | `weight` (lbs), `reps` | 5 × 225 lbs      |
| `timed`    | `duration` (seconds)   | 1:30             |
| `distance` | `distance` (metres)    | 5 km             |
| `output`   | `output` (count)       | 30 calories      |

An exercise can declare several metrics at once — e.g. a **Rowing** exercise with `metrics: ["distance", "timed"]` logs `distance: 2000, duration: 420` in **one** record. Every set also stores `exerciseId`, `date`, `notes`, and — for circuit members — `groupId`, `round`, `restSec`.

**Fuel.** One row per eating moment, in the `pulse-fuel` database (`fuel_logs`, keyPath `id`; indexes `by_date`, `by_timestamp`):

```json
{
  "id": "uuid",
  "timestamp": "2026-11-05T19:04:12.000Z",
  "date": "2026-11-05",
  "proteinGrams": 50,
  "calories": 350,
  "isWholeFood": true,
  "handPortions": { "palms": 2, "fists": 1, "cupped": 1, "thumbs": 1 },
  "notes": "chicken bowl"
}
```

Water is one row per day in `water_logs` (`{ date, glasses }`). Hydration is deliberately not a fuel entry.

**Recover.** One check-in per local calendar day in the `pulse-recover` database (`recovery_logs`, keyPath `date`):

```json
{
  "date": "2026-11-06",
  "sleepHours": 7.5,
  "soreness": 4,
  "restingHr": 58,
  "note": "slept through, calves a little tight"
}
```

Any metric may be `null` — a sleep-only or note-only check-in is valid, but a completely empty row is rejected so the form can't store noise. Sleep is clamped to 0–24 h and rounded to the nearest quarter hour; soreness is a whole number 1–10; resting HR is a whole number 30–220 bpm. Averages and trend lines ignore missing values rather than treating them as zero.

> **Shared database with Iron Log.** Pulse keeps the IndexedDB name `iron-log` for Move data, so existing Iron Log clients keep their history. Iron Log opens that store at `DB_VERSION = 3`, so **Pulse must never bump `DB_VERSION`** — Move record changes are additive and lazy-stamped at boot (`migrateExerciseMetrics` in `js/db.js`). Fuel data needs new stores, so it lives in the separate `pulse-fuel` database. If a shared-store upgrade is ever unavoidable, Iron Log upgrades first.
>
> **Origin matters.** `edmundashdown.github.io` and `changelinglabs.com` serve this app from two different origins, and browser storage is origin-scoped: history logged on one never appears on the other. Pick one and stay on it; `Export` → `Import` moves your data across origins.

### Circuits (supersets)

The Log modal has a **Circuit** mode: pick two or more exercises, set a round count, and every round × exercise combination is written in one transaction. Circuit membership is carried on the sets (`groupId`, `round`, `restSec`) — there is no separate circuit entity, so backups, restores and older app versions keep working.

### Rest timer

Saving a set starts a countdown bar above the bottom nav (default 90s). The countdown model in `js/timer.js` is pure and unit-tested; `js/app.js` owns the interval, the beep, and the bar. Circuits can override the rest between rounds.

### Intervals & mobility holds

The **Intervals** card on the Log tab launches four built-in protocols — Tabata (20/10 × 8), EMOM 10 (40/20), 30/30 and 40/20 — plus a custom work/rest/rounds builder and two static-hold routines (lower body, upper body). The plan model lives in `js/intervals.js` (pure and unit-tested): it flattens a session into prep/work/rest/hold blocks, drops the trailing rest, and advances by real elapsed time, so a throttled background tab catches up instead of drifting. The runner (`js/modules/move/intervals.js`) is a full-screen panel with distinct cues per phase (shared with the rest timer through `js/cues.js`), pause/skip/end, a screen wake lock, and a "last session" line remembered as a device preference. Intervals deliberately do **not** write sets — they are a pacing tool, not a logged lift.

### Pulse Fuel

The Fuel tab renders **hand portions**, not calories-first tracking: tap Palms / Fists / Cupped Hands / Thumbs; macros are estimated (`~25g protein per palm, ~15g carbs per cupped hand, ~10g fat per thumb`). Meters show protein vs. target, whole-food share of logged items, and hydration. A **Myth Buster** card rotates daily; "Show me another" pulls a random one. Every card carries an *"Educational only — not medical advice"* line, and the `action` lines avoid medical targets. Card copy had a conservative evidence pass in v2.11.0 but is **still pending clinician sign-off** — the review surface, changed-row log and references live in `docs/myth-cards-review.md`.

### Pulse Recover

The **Recover** tab is a daily check-in: sleep last night (stepper, quarter-hour steps), soreness (1–10 chips from *Fresh* to *Wrecked*) and resting HR on waking, plus a free-text note. Any single metric is enough to save. Below the form, a 7-day or 30-day **snapshot** shows averages with deltas against the previous window of the same length, how many days you actually checked in, and how many nights fell under 7 h; **trend bars** plot each metric with fixed ranges (a flat week stays flat instead of stretching), and **Recent check-ins** lets you edit or delete an earlier day — the form switches between "today" and "editing".

Recover is a *signal*, not a diagnosis: it never scores you or tells you to train less, it just surfaces whether sleep, soreness and resting HR are moving. The date windows, averages, deltas and bar maths live in `js/recover.js` (pure and unit-tested); the tab is `js/modules/recover/recover.js`.

Below the trends, **Training ↔ recovery** compares your completed weeks by training volume. Weeks are split at the median weekly *set* count (a hard calisthenics week counts the same as a heavy barbell week; tonnage is shown only where weight × reps exists), then sleep, soreness and resting HR are averaged for the heavier and lighter halves. When there are enough paired weeks, it also shows a Pearson correlation and one plain-language line. It refuses to draw a conclusion from fewer than four eligible weeks, and it always says the quiet part out loud: association only — recovery has many other inputs. Logic lives in `js/insights.js` (pure and unit-tested); no new database, no sync domain, no network.

### Open exports

Settings → Preferences offers **Test sound**, which primes the audio context, plays the finish cue and reports what the browser is actually doing (`running` / `interrupted` / `suspended`, plus the declared audio session). On iPhone this is the fastest way to tell a silent switch apart from a blocked context.

Settings → Data offers **Open exports**, all local and one-way:

| Button | File | Contents |
|---|---|---|
| Sets | `pulse-sets-YYYY-MM-DD.csv` | one row per set, date-sorted, exercise names resolved, weights in **lb and kg** |
| Fuel | `pulse-fuel-…csv` | portions, estimated macros, whole-food flag, UTC timestamp |
| Water | `pulse-water-…csv` | one row per day |
| Recover | `pulse-recovery-…csv` | sleep, soreness, resting HR, note |
| This week (MD) | `pulse-week-YYYY-MM-DD.md` | Monday–Sunday note: training table (sets, reps, tonnage, top set), recovery averages, fuel/water totals |

CSV follows the usual quoting rules (embedded commas, quotes and newlines are
escaped; rows are CRLF). The Markdown note is plain Obsidian-flavoured
Markdown with pipes escaped, so it drops straight into a vault. Exports never
touch the network and never modify data — **restore still goes through the
JSON backup**.

### Backup compatibility

`js/backup.js` writes `version: 4` (`BACKUP_VERSION`) with `exercises`, `sets`, `fuelLogs`, `waterLogs`, `recoveryLogs`, `equipment`. On import, older files migrate up to v4 (missing fuel/recovery arrays default to `[]`); files from a newer version are rejected. Iron Log exports (`iron-log-backup-*.json`, v3) migrate cleanly into Pulse. **Clearing site data wipes all local history on whichever origin you're on** — export first.

## Cloud Sync (v2.5.0, opt-in, background)

Pulse is local-first: without a signed-in user, zero network traffic occurs and no data leaves the device. Cloud sync exists so the same history can roam between devices you own.

- **Off by default.** Signing in sends nothing by itself; sync runs on the user's terms after that (auto on every save, tab-visible reopen, and network reconnect — plus manual **Sync now**). Nothing is ever pushed before a sign-in.
- **Design:** one table (`sync_rows` in Pulse's Supabase project) carries every data domain; each row is one JSON delta of one record. Row-level security isolates every user's rows. The client ships only the _publishable_ key. There is no server-side data model — no schema to keep in sync, no passwords anywhere near the app.
- **Conflict resolution:** last-writer-wins per record (`updated_at`), with a deterministic payload-byte tiebreak on exact timestamp equality. Deletes propagate as tombstones.
- **Identity:** IndexedDB ids are device-local, so each synced record carries a stable `syncId` (UUID) stamped **additively** at write time; the shared `iron-log` DB is never version-bumped and Iron Log never sees the sync. Fuel ids were already UUIDs; water and recovery logs key by date.
- **Sign-in:** magic link (passwordless). The `pulse-sync-auth` session persists per origin in `localStorage`.

Setup for the owner: see `supabase/README.md` (apply `supabase/schema.sql`, add the redirect URLs — production and a local verification port).

- **Automatic sync:** with an active session, Pulse syncs in the background on every local save (debounced ~2.5s), when the tab regains visibility, and on network reconnect. It never runs while signed out.
- **Backup restore does not reconcile by itself.** After importing a file, tap **Reset cloud to match this device** (Cloud Sync danger zone) to delete every remote row for your account and re-upload this device's state — irreversible.

## Testing

Schema, migration, date, circuit-grouping, timer, PR, fuel, recovery, insight, trend and export logic is covered by Node's built-in test runner (no dependencies):

```bash
npm test
```

### Verifying changes in a browser

The service worker is cache-first, so **serve each round on a fresh port**:

```bash
python3 -m http.server 8913   # then 8914, 8915, …
```

A new port is a new origin, so it gets a clean cache and a clean IndexedDB. Assert on the DOM and on stored records rather than eyeballing a screenshot. Drive the UI through the `window.*` handlers; read IndexedDB straight from the page to confirm what was written. Note that `prompt()` is not supported by automated browser drivers — verify the settings-style flows by reading state directly.

## Releases

The service worker is cache-first and precaches an explicit asset list in `sw.js`. **Bump the `CACHE` name on every release** and add any new module to `ASSETS`. Bump `js/version.js` at the same time, and the `?v=` cache-bust on the hub's stylesheet links if hub CSS changed.

## 🤝 Open Source & Contributing

Pulse is an open-source project driven by a single belief: **essential health tools should be free, private, and accessible to everyone.**

Whether you are a developer, UI designer, or health researcher, contributions are welcome:

- **Code:** Check the active roadmap items in `Phase 3: Refactor & Cloud Sync Engine`.
- **Testing:** Run local unit tests via `npm test` and verify browser PWA behaviors.
- **Documentation:** Help refine guided recovery routines and non-profit educational guides.

```bash
git clone https://github.com/EdmundAshdown/pulse.git
cd pulse
npm install   # dev deps: none (Node built-in test runner)
npm test
```

### Guidelines for AI Coding Agents

1. **Never break passing tests.** Run `npm test` before and after every file change.
2. **Strict offline-first.** Never add mandatory external API calls to the core logging workflows. All core state writes to IndexedDB first.
3. **Keep it vanilla.** No heavy frameworks (React/Vue/Angular) or complex bundlers unless explicitly mandated by a phase specification.
4. **Respect the shared database.** Never bump `DB_VERSION` for the `iron-log` store, and never add new stores to it — new domains get their own `pulse-*` database.
5. **Respect the kernel boundaries.** Modules register tabs via `registerTab()` in `js/kernel/shell.js` and must not reach into each other's internals — import from `kernel/helpers.js` or a module's public exports only. The FAB is contextual via `fabLabel`/`fabAction`; hide/show it through the tab definition, never by DOM hacks in a module.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
