// ── Pulse kernel: state, routing, boot ─────────────────
// State lives in `state` (exported as a live binding — mutate its
// properties, never reassign the import). Tabs register themselves via
// `registerTab(name, def)`; `def` may provide { title, fabLabel, fabAction,
// render }. The FAB is contextual: modules pass fabLabel/fabAction for
// tabs that need one, and renderTab hides it otherwise.

import { openDB, migrateExerciseMetrics, seedIfEmpty, getExercises, getEquipment, getPref } from '../db.js';

// ── State ──────────────────────────────────────────────────
export let state = {
  tab: 'log',
  unit: 'lbs',
  lastExerciseId: null,
  exercises: [],
  equipment: { barWeight: 45, plates: [] },
  prWindow: '365',
  progressView: 'records',   // Records | Trends inside the Progress tab
  moveView: 'today',        // Today | Programs | Planner inside the Move tab
  trendRange: '12w',        // 4w | 12w | 1y
  restSeconds: 90,
  fuelMyth: null,          // non-null after "show me another" — otherwise the daily card
  plannerWorkout: [
    {
      exerciseId: null,
      rmType: 1,
      sets: [
        { mode: 'pct', value: 50,  reps: 5 },
        { mode: 'pct', value: 65,  reps: 5 },
        { mode: 'pct', value: 75,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
      ],
      checked: [],
    }
  ],
};



// ── Tab registry ───────────────────────────────────────────
const registry = new Map();
const inits = [];
export function registerTab(name, def) { registry.set(name, def); }
export function registerInit(fn) { inits.push(fn); }

export function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  return renderTab(tab);
}

export async function renderTab(tab) {
  const content = document.getElementById('content');
  const h1 = document.querySelector('#header h1');
  const def = registry.get(tab);
  if (!def) return;
  h1.textContent = def.title || 'Pulse';

  const fab = document.getElementById('fab');
  if (def.fabLabel) {
    fab.classList.remove('hidden');
    fab.setAttribute('aria-label', def.fabLabel);
    fab.onclick = def.fabAction || null;
  } else {
    fab.classList.add('hidden');
    fab.onclick = null;
  }

  await def.render(content);
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

export async function boot() {
  await openDB();
  await migrateExerciseMetrics();   // no-op on fresh DBs
  await seedIfEmpty();
  state.exercises = await getExercises();
  state.equipment = await getEquipment();
  state.unit = await getPref('unit', 'lbs');
  state.prWindow = await getPref('prWindow', '365');
  state.progressView = await getPref('progressView', 'records');
  state.moveView = await getPref('moveView', 'today');
  state.trendRange = await getPref('trendRange', '12w');
  state.restSeconds = await getPref('restSeconds', 90);

  for (const init of inits) await init();

  await renderTab('log');
  setupNav();
}
