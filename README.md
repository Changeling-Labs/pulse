# 🫀 Project Pulse

> **A local-first, zero-cost, open-source health engine built to combat chronic disease through lifelong physical capability, metabolic tracking, and recovery.**

**Pulse** is the continuation of [Iron Log](https://github.com/edmundashdown/iron-log) — same codebase, same local-first DNA, wider mission. Phase 1 (the movement engine) shipped as Iron Log v1.8.2; Pulse rebrands and extends it into a general health app: **Pulse Move** (strength, circuits, intervals), **Pulse Fuel** (nutrition) and **Pulse Recover** (mobility, sleep, rest).

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
- **The Fitness Defense:** Cardiorespiratory fitness (VO₂ max) and muscle strength show an inverse, linear relationship with all-cause mortality. High muscle mass and functional capacity delay arterial aging and metabolic decay by decades.
- **The Accessibility Gap:** Most health apps lock basic tracking, habit building, and data export behind monthly subscriptions. **Pulse is permanently free, non-profit, private, and fully functional offline.**

## 🎨 Branding & Aesthetic Vision

- **Name:** **Pulse** (Sub-modules: *Pulse Move*, *Pulse Fuel*, *Pulse Recover*)
- **Tagline:** _Engineered for Healthspan._
- **Aesthetic Direction:** Industrial Minimalist. Charcoal background (`#121212`), high-contrast clinical typography, warm emergency accents (crimson/amber indicators for strain/fatigue), and zero decorative bloat.
- **Core Ethos:** Local-first data ownership, instant response times, zero tracking scripts, no paywalls.

## 🏗️ Architecture & Core Principles

Pulse is built as a **Local-First Micro-Kernel**. The client-side database (IndexedDB) is the single source of truth. The user UI never waits for network requests or cloud backends to log a set, record a meal, or run a timer.

```
                      ┌─────────────────────────────────┐
                      │          Pulse Shell            │
                      │  (PWA, SW, Local-First DB,      │
                      │   Theme System, Cloud Sync)     │
                      └────────────────┬────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
│     Pulse MOVE        │    │      Pulse FUEL       │    │     Pulse RECOVER     │
│  (Strength, Circuits, │    │  (Low-Friction Macros,│    │ (Guided Mobility,     │
│   Intervals, Plates)  │    │  Hydration, Quality)  │    │  Sleep, Rest Protocols)│
└───────────────────────┘    └───────────────────────┘    └───────────────────────┘
```

1. **Offline-First:** Runs completely client-side. Service Worker caching guarantees full functionality in gym basements or remote trails.
2. **Zero-Cost Backend:** Local-first sync architecture (IndexedDB + optional background sync), keeping infrastructure costs near zero.
3. **Data Sovereignty:** Full JSON/CSV data export and import. Your health data remains yours forever.

## 🗺️ Product Roadmap & Development Plan

### Phase 1: Core Foundation & Movement Engine (Complete — v2.0.0) ✅

- [x] **Data Foundation:** Multi-metric set logging (weight/reps, time, distance, output) with schema migration layers (`schema.js`).
- [x] **Input Optimization:** Dynamic weight/rep modal with live barbell plate loader and rep steppers.
- [x] **Structure & Timing:** Superset/circuit containers with round-based pacing and background-resilient rest/interval timers (`timer.js`).
- [x] **Unit & Equipment Support:** Imperial/metric display handling, literal plate inventory management.
- [x] **Pulse Rebrand (v2.0.0):** Pulse identity, charcoal/crimson theme, PWA manifest and icons. Existing installs keep their data — the IndexedDB name is unchanged on purpose.

### Phase 2: Refactor & Cloud Sync Engine (Q1 2027) 🚧

- [ ] **Kernel Extraction:** Refactor monolithic `app.js` into modular domain drivers (`/kernel`, `/modules/move`).
- [ ] **Dynamic Metric & PR Engine:** Expand exercises to carry multiple concurrent metrics (e.g., time + distance for rowing) with volume/time-based PR analytics.
- [ ] **Cloud Sync Engine:** Implement optional, zero-cost cloud sync using Supabase Auth + local-first delta backups.

### Phase 3: Pulse Recover — Mobility & Rest Protocols (Q2 2027) 📅

- [ ] **Guided Stretching:** Utilize the existing interval timer to build step-by-step mobility routines.
- [ ] **EMOM & Work-Interval Engine:** Full support for EMOM, Tabata, and timed hold protocols.
- [ ] **Recovery & Fatigue Logging:** Simple daily metrics for sleep quality, resting heart rate, and subjective soreness.

### Phase 4: Pulse Fuel — Low-Friction Nutrition (Q3 2027) 📅

- [ ] **Simplified Macro Engine:** Focus on high-value targets (protein, total calories, hydration, food quality) without burdensome 100,000-item barcode database overhead.
- [ ] **Portion-Based Estimator:** Quick-log options for hand-portion estimates and daily protein goals.

### Phase 5: Holistic Health Insights & Integrations (Q4 2027) 📅

- [ ] **Cardiovascular & Metabolic Analytics:** Automated trend lines correlating movement volume, recovery markers, and metabolic consistency.
- [ ] **Integrations & Export:** Open export paths for Obsidian, Notion, Apple Health, and Strava.
- [ ] **Native Mobile Packages:** Optional Capacitor/Ionic wrappers for distribution on iOS App Store and Google Play.

## Project structure

```
pulse/
  index.html        # App shell + log modal
  manifest.json     # PWA manifest
  sw.js             # Service worker (offline support)
  css/app.css       # All styles
  js/
    app.js          # Main app logic
    db.js           # IndexedDB data layer
    schema.js       # Set schema, validation, backup migration
    circuits.js     # Circuit grouping (supersets)
    timer.js        # Rest countdown model
    dates.js        # Local calendar-day helpers
    calc.js         # Plate calculator + session plan
    confetti.js     # Set completion celebration
    backup.js       # JSON export/import
    version.js      # Version string
  test/             # Node built-in test runner
  icons/            # App icons
```

## Running locally

Serve over HTTP (required for ES modules):

```bash
python3 -m http.server 8080
```

## Deploying to GitHub Pages

1. Create a GitHub repo and push this folder
2. Settings → Pages → Source: main branch, root
3. Live at `https://edmundashdown.github.io/pulse`
4. On iPhone: Safari → Share → Add to Home Screen

## Versioning

Bump `js/version.js` with each release. Shows in Settings tab.

## Data model

A logged set is a discriminated record — `type` decides which metric
fields are meaningful (see `js/schema.js`):

| `type`     | Metric fields          | Example          |
|------------|------------------------|------------------|
| `strength` | `weight` (lbs), `reps` | 5 × 225 lbs      |
| `timed`    | `duration` (seconds)   | 1:30             |
| `distance` | `distance` (metres)    | 5 km             |
| `output`   | `output` (count)       | 30 calories      |

Every set also stores `exerciseId`, `date` (`YYYY-MM-DD`), `notes`, and —
for circuit members — `groupId`, `round` and `restSec`. Records written
before v2 have no `type` and are treated as `strength`; IndexedDB is migrated
in place on upgrade (`DB_VERSION` in `js/db.js`).

Each exercise declares which metric it logs (Settings → Exercises), and the
Log modal renders the matching inputs. Exercises predating v3 default to
`strength`, and the Planner and PRs tabs only offer weight/reps lifts.

> **Iron Log → Pulse data continuity.** Pulse deliberately keeps the
> IndexedDB database name `iron-log`. Both apps are served from the same
> origin (`edmundashdown.github.io`), so Pulse reads and writes the same
> store — your full training history carries over. Do not rename the database
> without a migration.

### Circuits (supersets)

The Log modal has a **Circuit** mode: pick two or more exercises, set a round
count, and every round × exercise combination is written in one transaction.
There is no separate circuit entity — the sets themselves carry a shared
`groupId`, a 1-based `round`, and the circuit's `restSec`; sets without a
`groupId` are standalone (see `js/circuits.js`). The Log tab groups sets by
`groupId` and renders them round by round, with the protocol in the header and
a block-level delete. Because the group is just fields on the sets, backups,
restores and older app versions all keep working.

### Rest timer

Saving a set starts a countdown in a bar above the bottom nav (default 90s;
set it in Settings → Rest timer, or choose **Off**). The bar keeps running
while you move between tabs, and the app beeps and vibrates at zero. The
countdown model in `js/timer.js` is pure and unit-tested; `js/app.js` owns the
interval, the audio and the bar.

A circuit can override the rest between rounds — **Rest between rounds** in the
circuit builder, where *Default* follows the setting above — and the saved
circuit shows that interval in its header. **▶ Run** on a saved circuit paces
you through it: it starts the rest for round 1, and when that finishes the
middle button becomes **Next rest** for the following round, up to the last
one, which ends with "Circuit done". The bar shows the round each rest leads
into.

### Units

Weight is stored in lbs and distance in metres, and both are *displayed* in
the unit preference. Distance shows miles for imperial and km for metric, with
short distances (under 0.1 mi / 1 km) staying in metres. Distance is still
*entered* in metres, which is how erg distances are read.

### Backup compatibility

`js/backup.js` writes `version: 3` (`BACKUP_VERSION`). On import, older
files are migrated up to the current version; files from a newer app
version are rejected rather than silently misread. Iron Log exports
(`iron-log-backup-*.json`) import cleanly into Pulse — same format.

## Testing

Schema, migration, date, circuit-grouping and timer logic is covered by
Node's built-in test runner (no dependencies):

```bash
npm test
```

### Verifying changes in a browser

The service worker is cache-first, so **serve each round on a fresh port**:

```bash
python3 -m http.server 8913   # then 8914, 8915, …
```

Reusing a port means the old service worker serves the previous assets and
you end up debugging code that isn't running. A new port is a new origin, so
it gets a clean cache and a clean IndexedDB.

Assert on the DOM and on stored records rather than eyeballing a screenshot —
it is quicker and it actually checks the data:

- Drive the UI through the `window.*` handlers (`openLogModal` is reached by
  clicking `#fab`; `setLogMode`, `addCircuitItem`, `submitLog`, `startRest` and
  friends are global).
- Read IndexedDB straight from the page to confirm what was written:
  `indexedDB.open('iron-log')` → `transaction('sets').objectStore('sets').getAll()`.
- Check `document.querySelectorAll('.circuit-block')` etc. for what rendered.

## Releases

The service worker is cache-first and precaches an explicit asset list in
`sw.js`. **Bump the `CACHE` name on every release** and add any new module
to `ASSETS` — otherwise installed clients keep serving the old files.
Bump `js/version.js` at the same time.

## 🤝 Open Source & Contributing

Pulse is an open-source project driven by a single belief: **essential health tools should be free, private, and accessible to everyone.**

Whether you are a developer, UI designer, or health researcher, contributions are welcome:

- **Code:** Check the active roadmap items in `Phase 2: Refactor & Cloud Sync Engine`.
- **Testing:** Run local unit tests via `npm test` and verify browser PWA behaviors.
- **Documentation:** Help refine guided recovery routines and non-profit educational guides.

```bash
git clone https://github.com/edmundashdown/pulse.git
cd pulse
npm test
```

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
