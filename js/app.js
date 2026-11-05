import { openDB, seedIfEmpty, getExercises, getSets, addSet, addSets, deleteSet, deleteSetsByGroup, getAllPRs, getPref, setPref, getEquipment, getLastSetForExercise, updateExerciseMetrics, migrateExerciseMetrics, getFuelLogsForDate, addFuelLog, deleteFuelLog, getWaterLog, adjustWater } from './db.js';
import { calcPlates, targetFromPct, displayWeight, displayDistance, buildSessionPlan, toKg, toLbs, weightStep } from './calc.js';
import { metricPR } from './pr.js';
import { calcHandPortions, getDailyMythCard, getRandomMythCard } from './fuel.js';
import { burstFromEl } from './confetti.js';
import { exportBackup, importBackup } from './backup.js';
import { VERSION, BUILD_DATE } from './version.js';
import { localDateStr } from './dates.js';
import { METRIC_LABELS, SET_TYPES } from './schema.js';
import { newGroupId, groupByCircuit } from './circuits.js';
import { newTimer, tick as tickTimer, extend as extendTimer, pause as pauseTimer, resume as resumeTimer, progress as timerProgress, formatClock, nextRound } from './timer.js';

// ── State ──────────────────────────────────────────────────
let state = {
  tab: 'log',
  unit: 'lbs',
  lastExerciseId: null,
  exercises: [],
  equipment: { barWeight: 45, plates: [] },
  prWindow: '365',
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

// ── Boot ───────────────────────────────────────────────────
async function boot() {
  await openDB();
  await migrateExerciseMetrics();   // no-op on fresh DBs
  await seedIfEmpty();
  state.exercises = await getExercises();
  state.equipment = await getEquipment();
  state.unit = await getPref('unit', 'lbs');
  state.prWindow = await getPref('prWindow', '365');
  state.restSeconds = await getPref('restSeconds', 90);

  // Assign first lift to first planner block
  const lifts = strengthExercises();
  if (lifts.length > 0) {
    state.plannerWorkout[0].exerciseId = lifts[0].id;
    state.plannerWorkout[0].checked = state.plannerWorkout[0].sets.map(() => false);
  }

  renderTab('log');
  setupNav();
}

// ── Navigation ─────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const fab = document.getElementById('fab');
  fab.classList.toggle('hidden', tab !== 'log' && tab !== 'fuel');
  fab.setAttribute('aria-label', tab === 'fuel' ? 'Log fuel' : 'Log a set');
  renderTab(tab);
}

async function renderTab(tab) {
  const content = document.getElementById('content');
  const h1 = document.querySelector('#header h1');
  const titles = { log: 'Pulse', fuel: 'Fuel', prs: 'Personal Records', planner: 'Session Planner', settings: 'Settings' };
  h1.textContent = titles[tab];
  // One FAB, contextual: Log on the log tab, Log fuel on the fuel tab.
  document.getElementById('fab').onclick = () => (tab === 'fuel' ? window.openFuelModal() : openLogModal());
  if (tab === 'log') await renderLog(content);
  else if (tab === 'fuel') await renderFuel(content);
  else if (tab === 'prs') await renderPRs(content);
  else if (tab === 'planner') await renderPlanner(content);
  else if (tab === 'settings') await renderSettings(content);
}

function dw(lbs) { return displayWeight(lbs, state.unit); }

function sinceDate() {
  if (!state.prWindow || state.prWindow === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(state.prWindow));
  return localDateStr(d);
}

function todayStr() { return localDateStr(); }

function fmtDate(isoStr) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Set display helpers ────────────────────────────────────
// A set may carry fields for several metrics at once (schema v4), so
// rendering reads whatever is on the record instead of switching on type.
function fmtDuration(sec) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function setDetail(s) {
  const parts = [];
  if (Number.isFinite(s.reps)) parts.push(`${s.reps} rep${s.reps !== 1 ? 's' : ''}`);
  if (Number.isFinite(s.duration)) parts.push(fmtDuration(s.duration));
  if (Number.isFinite(s.distance)) parts.push(displayDistance(s.distance, state.unit));
  if (Number.isFinite(s.output)) parts.push(`${s.output} output`);
  return parts.join(' · ') || '—';
}

// The right-aligned "headline" for a set row: weight for lifts, otherwise
// the first non-strength metric the record carries.
function setPrimary(s) {
  if (Number.isFinite(s.weight)) return dw(s.weight);
  if (Number.isFinite(s.distance)) return displayDistance(s.distance, state.unit);
  if (Number.isFinite(s.duration)) return fmtDuration(s.duration);
  if (Number.isFinite(s.output)) return String(s.output);
  return '';
}

// ── Log Tab ────────────────────────────────────────────────
async function renderLog(el) {
  const allSets = await getSets();
  const today = todayStr();
  const todaySets = allSets.filter(s => s.date === today).reverse();

  let prCount = 0;
  for (const s of todaySets) {
    if (!Number.isFinite(s.weight) || !Number.isFinite(s.reps)) continue;   // weight PRs only
    const prs = await getAllPRs(s.exerciseId, sinceDate());
    if (prs[s.reps] === s.weight) prCount++;
  }

  const exMap = Object.fromEntries(state.exercises.map(e => [e.id, e.name]));
  const blocks = groupByCircuit(todaySets);

  const setsHtml = blocks.length === 0
    ? `<div class="empty"><div class="icon">🏋️</div><p>No sets logged today yet.</p></div>`
    : blocks.map(block =>
        block.groupId ? circuitBlockHtml(block, exMap) : setRowHtml(block.items[0], exMap)
      ).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${todaySets.length}</div><div class="stat-lbl">sets today</div></div>
      <div class="stat"><div class="stat-val">${new Set(todaySets.map(s => s.exerciseId)).size}</div><div class="stat-lbl">exercises</div></div>
      <div class="stat"><div class="stat-val accent">${prCount}</div><div class="stat-lbl">PRs today</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
        <button class="btn btn-ghost rest-start" onclick="startRest()">⏱ Rest</button>
      </div>
      ${setsHtml}
    </div>`;

}

// One standalone set.
function setRowHtml(s, exMap) {
  return `
    <div class="log-item" data-id="${s.id}">
      <div>
        <div class="log-name">${exMap[s.exerciseId] || '?'}</div>
        <div class="log-detail">${setDetail(s)} · ${fmtDate(s.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="log-weight">${setPrimary(s)}</div>
        <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteSetItem(${s.id})">✕</button>
      </div>
    </div>`;
}

// A circuit (superset): the sets sharing one groupId, shown round by round.
function circuitBlockHtml(block, exMap) {
  const exerciseCount = new Set(block.items.map(s => s.exerciseId)).size;
  const rest = block.restSec ? ` · ${formatClock(block.restSec * 1000)} rest` : '';
  const rows = block.items.map(s => `
    <div class="circuit-row">
      <span class="circuit-round">R${s.round ?? 1}</span>
      <span class="circuit-name">${exMap[s.exerciseId] || '?'}</span>
      <span class="circuit-detail">${setDetail(s)}</span>
      <span class="circuit-weight">${setPrimary(s)}</span>
    </div>`).join('');

  return `
    <div class="circuit-block">
      <div class="circuit-head">
        <div>
          <span class="circuit-title">Circuit</span>
          <span class="circuit-meta">${block.rounds} round${block.rounds !== 1 ? 's' : ''} · ${exerciseCount} exercises${rest}</span>
        </div>
        <div class="circuit-actions">
          <button class="btn btn-ghost circuit-run" onclick="runCircuit('${block.groupId}')">▶ Run</button>
          <button class="btn btn-ghost circuit-delete" onclick="deleteCircuit('${block.groupId}')">Delete</button>
        </div>
      </div>
      ${rows}
    </div>`;
}

window.deleteSetItem = async function(id) {
  if (!confirm('Delete this set?')) return;
  await deleteSet(id);
  renderTab('log');
};

window.deleteCircuit = async function(groupId) {
  if (!confirm('Delete this whole circuit?')) return;
  await deleteSetsByGroup(groupId);
  renderTab('log');
};

// ── Rest timer ─────────────────────────────────────────────
// Counts down between sets. The model lives in js/timer.js; this section
// owns the interval, the beep, and the bar at the bottom of the screen.
// The bar sits outside the tab content, so it keeps running and stays
// visible while you move around the app.

const REST_OPTIONS = [
  { value: 0,   label: 'Off' },
  { value: 30,  label: '30 seconds' },
  { value: 60,  label: '1 minute' },
  { value: 90,  label: '1:30' },
  { value: 120, label: '2 minutes' },
  { value: 180, label: '3 minutes' },
  { value: 300, label: '5 minutes' },
];

// A circuit can override the rest between rounds. -1 follows the setting
// above rather than duplicating a number that would then drift from it.
const CIRCUIT_REST_OPTIONS = [
  { value: -1, label: 'Default' },
  ...REST_OPTIONS.filter(o => o.value > 0),
];

let restTimer = null;        // timer state, or null when there is no rest running
let restInterval = null;
let restLastTick = 0;
let audioCtx = null;

// Browsers only allow audio after a gesture, so create the context from the
// click that starts the rest (not from the tick that finishes it).
function primeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

function restFinished() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  try { beep(); } catch { /* audio blocked */ }
}

function startRestLoop() {
  if (restInterval !== null) return;
  restLastTick = Date.now();
  restInterval = setInterval(restTick, 250);
}

function stopRestLoop() {
  if (restInterval === null) return;
  clearInterval(restInterval);
  restInterval = null;
}

function restTick() {
  if (!restTimer) return;
  const now = Date.now();
  const delta = now - restLastTick;
  restLastTick = now;

  const wasDone = restTimer.done;
  restTimer = tickTimer(restTimer, delta);
  if (!wasDone && restTimer.done) {
    stopRestLoop();
    restFinished();
  }
  renderRestBar();
}

function renderRestBar() {
  const bar = document.getElementById('rest-bar');
  if (!bar) return;

  document.body.classList.toggle('rest-active', !!restTimer);

  if (!restTimer) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.classList.toggle('done', restTimer.done);
  bar.classList.toggle('paused', !restTimer.running && !restTimer.done);

  const seq = restTimer.sequence;
  const upcoming = restTimer.done ? nextRound(restTimer) : null;

  const roundEl = document.getElementById('rest-round');
  roundEl.classList.toggle('hidden', !seq);
  if (seq) roundEl.textContent = `Round ${seq.round}/${seq.total}`;

  document.getElementById('rest-clock').textContent = !restTimer.done
    ? formatClock(restTimer.remainingMs)
    : (seq && !upcoming ? 'Circuit done' : 'Rest done');

  document.getElementById('rest-fill').style.width =
    `${Math.round(Math.min(1, Math.max(0, timerProgress(restTimer))) * 100)}%`;

  document.getElementById('rest-pause').textContent = !restTimer.done
    ? (restTimer.running ? 'Pause' : 'Resume')
    : (upcoming ? 'Next rest' : 'Restart');
}

// `round`/`total` are only passed by a circuit run; a plain rest has neither.
window.startRest = function(seconds, round, total) {
  const secs = Number(seconds);
  const duration = Number.isFinite(secs) && secs > 0 ? secs : state.restSeconds;
  if (!duration || duration <= 0) return;   // timer is off

  primeAudio();
  restTimer = newTimer(duration, round && total ? { round, total } : null);
  startRestLoop();
  renderRestBar();
};

window.extendRest = function(sec) {
  if (!restTimer) return;
  restTimer = extendTimer(restTimer, sec);
  startRestLoop();
  renderRestBar();
};

window.toggleRestPause = function() {
  if (!restTimer) return;
  const durationSec = restTimer.durationMs / 1000;
  const seq = restTimer.sequence;

  // A finished rest either advances the circuit or starts over.
  if (restTimer.done) {
    const upcoming = nextRound(restTimer);
    if (upcoming) startRest(durationSec, upcoming, seq.total);
    else startRest(durationSec, seq ? 1 : undefined, seq ? seq.total : undefined);
    return;
  }

  restTimer = restTimer.running ? pauseTimer(restTimer) : resumeTimer(restTimer);
  renderRestBar();
};

window.skipRest = function() {
  restTimer = null;
  stopRestLoop();
  renderRestBar();
};

window.setRestSeconds = async function(val) {
  const n = parseInt(val, 10);
  state.restSeconds = Number.isFinite(n) ? n : 0;
  await setPref('restSeconds', state.restSeconds);
};

// ── Log modal ──────────────────────────────────────────────
// The modal renders inputs for the metric the selected exercise logs
// (see schema.js). Every field is a big stepper + free numeric input +
// quick picks, so it stays usable with gloves on. Weight keeps two
// stepper sizes because plate jumping is the common gym case.
//
// Fields are addressed by `scope` so a circuit can show the same inputs
// more than once: the single-set form uses "f-", a circuit item uses
// "f-c<index>-".

function scopeEl(scope, key) {
  return document.getElementById(scope + key);
}

function fieldValue(scope, key) {
  const el = scopeEl(scope, key);
  if (!el) return null;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : null;
}

window.stepField = function(scope, key, sign, step) {
  const el = scopeEl(scope, key);
  if (!el) return;
  const cur = fieldValue(scope, key) ?? 0;
  el.value = Math.max(0, Math.round((cur + sign * step) * 100) / 100);
  refreshModalCalc();
};

window.setField = function(scope, key, val) {
  const el = scopeEl(scope, key);
  if (!el) return;
  el.value = val;
  refreshModalCalc();
};

function chipsHtml(scope, key, values) {
  return values.map(v =>
    `<button type="button" class="chip-btn" data-scope="${scope}" data-field="${key}" data-val="${v}" onclick="setField('${scope}', '${key}', ${v})">${v}</button>`
  ).join('');
}

function weightFieldHtml(scope) {
  const fine = weightStep(state.unit, true);
  const coarse = weightStep(state.unit, false);
  return `
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-label">Weight</span>
        <span class="metric-unit">${state.unit}</span>
      </div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'weight', -1, ${coarse})" aria-label="Decrease weight">−${coarse}</button>
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'weight', -1, ${fine})" aria-label="Decrease weight slightly">−${fine}</button>
        <input type="number" id="${scope}weight" class="step-value" inputmode="decimal" min="0" placeholder="0" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'weight', 1, ${fine})" aria-label="Increase weight slightly">+${fine}</button>
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'weight', 1, ${coarse})" aria-label="Increase weight">+${coarse}</button>
      </div>
      <div class="plate-chips" data-plates="${scope}"></div>
    </div>`;
}

function repsFieldHtml(scope) {
  return `
    <div class="metric-block">
      <div class="metric-head"><span class="metric-label">Reps</span></div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'reps', -1, 1)" aria-label="Decrease reps">−1</button>
        <input type="number" id="${scope}reps" class="step-value" inputmode="numeric" min="1" max="99" placeholder="5" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('${scope}', 'reps', 1, 1)" aria-label="Increase reps">+1</button>
      </div>
      <div class="chips-row">${chipsHtml(scope, 'reps', [1, 3, 5, 8, 10, 12, 15, 20])}</div>
    </div>`;
}

function singleFieldHtml(scope, { key, label, unit, step, chips }) {
  return `
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-label">${label}</span>
        <span class="metric-unit">${unit}</span>
      </div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('${scope}', '${key}', -1, ${step})" aria-label="Decrease ${label}">−${step}</button>
        <input type="number" id="${scope}${key}" class="step-value" inputmode="numeric" min="0" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('${scope}', '${key}', 1, ${step})" aria-label="Increase ${label}">+${step}</button>
      </div>
      <div class="chips-row">${chipsHtml(scope, key, chips)}</div>
      <div class="chip-note" data-hint="${scope}" data-hint-key="${key}"></div>
    </div>`;
}

// Add a metric by adding a case here plus SET_TYPES/METRIC_LABELS in schema.js.
function metricFieldsHtml(scope, metric) {
  switch (metric) {
    case 'timed':
      return singleFieldHtml(scope, { key: 'duration', label: 'Duration', unit: 'seconds', step: 15, chips: [30, 45, 60, 90, 120, 300] });
    case 'distance':
      return singleFieldHtml(scope, { key: 'distance', label: 'Distance', unit: 'metres', step: 100, chips: [400, 1000, 2000, 5000, 10000] });
    case 'output':
      return singleFieldHtml(scope, { key: 'output', label: 'Output', unit: 'count', step: 1, chips: [5, 10, 20, 30, 50] });
    default:
      return weightFieldHtml(scope) + repsFieldHtml(scope);
  }
}

// Live feedback: chip highlights, per-scope plate readout, and a
// human-readable hint for duration/distance.
window.refreshModalCalc = function() {
  document.querySelectorAll('#log-modal .chip-btn').forEach(b => {
    const v = fieldValue(b.dataset.scope, b.dataset.field);
    b.classList.toggle('active', v !== null && Number(b.dataset.val) === v);
  });

  document.querySelectorAll('#log-modal .chip-note[data-hint]').forEach(el => {
    const v = fieldValue(el.dataset.hint, el.dataset.hintKey);
    if (v === null) { el.textContent = ''; return; }
    el.textContent = el.dataset.hintKey === 'duration' ? fmtDuration(v) : displayDistance(v, state.unit);
  });

  document.querySelectorAll('#log-modal [data-plates]').forEach(platesEl => {
    const typed = fieldValue(platesEl.dataset.plates, 'weight');
    if (typed === null) { platesEl.innerHTML = ''; return; }

    const lbs = state.unit === 'kg' ? toLbs(typed) : typed;
    const { barWeight, plates } = state.equipment;

    if (lbs <= barWeight) {
      platesEl.innerHTML = '<span class="chip-note">Bar only</span>';
      return;
    }

    const { actual, plates: used } = calcPlates(lbs, barWeight, plates);
    const chips = used.length
      ? used.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
      : '<span class="chip">bar only</span>';

    // Compare in the unit the user typed, otherwise a kg -> lbs -> kg
    // round-trip (0.1 lb) reads as "not loadable".
    const actualShown = state.unit === 'kg' ? toKg(actual) : actual;
    const note = Math.abs(actualShown - typed) > 0.05
      ? `<div class="chip-note">Closest loadable: ${dw(actual)}</div>`
      : '';
    platesEl.innerHTML = chips + note;
  });
};

function metricsForExercise(exerciseId) {
  const exercise = state.exercises.find(e => e.id === exerciseId);
  return exercise?.metrics || ['strength'];
}

// The Planner is built on percentage-of-1RM, so it only offers lifts.
function strengthExercises() {
  return state.exercises.filter(e => (e.metrics || ['strength']).includes('strength'));
}

function clearScopeFields(scope) {
  for (const key of ['weight', 'reps', 'duration', 'distance', 'output']) {
    const el = scopeEl(scope, key);
    if (el) el.value = '';
  }
}

// Prefill "same as last time": one pass over the latest set for the
// exercise, filling every field it carries (composite-aware — a rower's
// last set prefills both distance and time).
async function prefillFromLastSet(exerciseId, metrics, scope = 'f-', clearNotes = true) {
  if (clearNotes) document.getElementById('modal-notes').value = '';
  clearScopeFields(scope);

  const set = (key, value) => {
    const el = scopeEl(scope, key);
    if (el && value != null) el.value = value;
  };

  const last = exerciseId ? await getLastSetForExercise(exerciseId) : null;

  if (last) {
    if (Number.isFinite(last.weight)) set('weight', state.unit === 'kg' ? toKg(last.weight) : last.weight);
    if (Number.isFinite(last.reps)) set('reps', last.reps);
    if (Number.isFinite(last.duration)) set('duration', last.duration);
    if (Number.isFinite(last.distance)) set('distance', last.distance);
    if (Number.isFinite(last.output)) set('output', last.output);
  } else if (metrics.includes('strength')) {
    set('reps', 5);
  }
  refreshModalCalc();
}

function metricListLabel(metrics) {
  return metrics.map(m => METRIC_LABELS[m]).join(' + ');
}

// ── Single-set mode ────────────────────────────────────────
function renderModalForExercise(exerciseId) {
  const metrics = metricsForExercise(exerciseId);
  document.getElementById('modal-title').textContent = `Log · ${metricListLabel(metrics)}`;
  document.getElementById('modal-metrics').innerHTML = metrics.map(m => metricFieldsHtml('f-', m)).join('');
  prefillFromLastSet(exerciseId, metrics, 'f-');
}

// ── Circuit mode ───────────────────────────────────────────
// Build a superset/circuit: pick 2+ exercises, set a round count, and the
// whole thing is logged in one go. Every set gets the same `groupId` and a
// 1-based `round`, which is what the Log tab groups on (see circuits.js).
let logMode = 'single';
let circuitItems = [];      // [{ exerciseId, metrics }]
let circuitRounds = 3;
let circuitRestSec = -1;    // -1 = follow the global rest setting

const circuitScope = index => `f-c${index}-`;

// The rest to use between rounds: the circuit's own value, or the global one.
function resolveCircuitRest() {
  return circuitRestSec < 0 ? state.restSeconds : circuitRestSec;
}

// Keep whatever has been typed when the list re-renders, keyed by exercise
// so removing an item doesn't shift values onto the wrong one.
function snapshotCircuitValues() {
  const snap = {};
  circuitItems.forEach((item, i) => {
    const scope = circuitScope(i);
    snap[item.exerciseId] = {};
    for (const key of ['weight', 'reps', 'duration', 'distance', 'output']) {
      const el = scopeEl(scope, key);
      if (el) snap[item.exerciseId][key] = el.value;
    }
  });
  return snap;
}

function restoreCircuitValues(snap) {
  circuitItems.forEach((item, i) => {
    const values = snap[item.exerciseId];
    if (!values) return;
    const scope = circuitScope(i);
    for (const [key, value] of Object.entries(values)) {
      const el = scopeEl(scope, key);
      if (el && value !== '') el.value = value;
    }
  });
}

// `snap` must be captured before circuitItems changes — otherwise values
// shift onto the wrong exercise when an item is removed.
function renderCircuit(snap = snapshotCircuitValues()) {
  const listEl = document.getElementById('circuit-list');
  const addSel = document.getElementById('circuit-add');
  const roundsEl = document.getElementById('circuit-rounds');
  const restEl = document.getElementById('circuit-rest');
  const chosen = new Set(circuitItems.map(i => i.exerciseId));

  if (roundsEl && document.activeElement !== roundsEl) roundsEl.value = String(circuitRounds);
  if (restEl) {
    restEl.innerHTML = CIRCUIT_REST_OPTIONS
      .map(o => `<option value="${o.value}" ${o.value === circuitRestSec ? 'selected' : ''}>${o.label}</option>`)
      .join('');
  }

  addSel.innerHTML = '<option value="">+ Add exercise…</option>' +
    state.exercises
      .filter(e => !chosen.has(e.id))
      .map(e => `<option value="${e.id}">${e.name}</option>`)
      .join('');

  listEl.innerHTML = circuitItems.length === 0
    ? '<div class="chip-note">Add at least two exercises to make a circuit.</div>'
    : circuitItems.map((item, i) => {
        const exercise = state.exercises.find(e => e.id === item.exerciseId);
        return `
          <div class="circuit-item">
            <div class="circuit-item-head">
              <span class="circuit-item-name">${i + 1}. ${exercise ? exercise.name : '?'}</span>
              <button type="button" class="btn btn-ghost circuit-remove" onclick="removeCircuitItem(${i})" aria-label="Remove exercise">✕</button>
            </div>
            ${item.metrics.map(m => metricFieldsHtml(circuitScope(i), m)).join('')}
          </div>`;
      }).join('');

  restoreCircuitValues(snap);
  refreshModalCalc();
}

window.addCircuitItem = function(value) {
  const id = parseInt(value, 10);
  if (!id || circuitItems.some(i => i.exerciseId === id)) return;
  const snap = snapshotCircuitValues();
  circuitItems.push({ exerciseId: id, metrics: metricsForExercise(id) });
  renderCircuit(snap);
  prefillFromLastSet(id, metricsForExercise(id), circuitScope(circuitItems.length - 1), false);
};

window.removeCircuitItem = function(index) {
  const snap = snapshotCircuitValues();
  circuitItems.splice(index, 1);
  renderCircuit(snap);
};

window.stepRounds = function(sign) {
  circuitRounds = Math.max(1, Math.min(20, circuitRounds + sign));
  const el = document.getElementById('circuit-rounds');
  if (el) el.value = String(circuitRounds);
};

window.setCircuitRest = function(val) {
  const n = parseInt(val, 10);
  circuitRestSec = Number.isFinite(n) ? n : -1;
};

// Walk a saved circuit round by round, resting between rounds. The rest is
// labelled with the round it leads into, so tapping Run after round 1 rests
// you before round 2.
window.runCircuit = async function(groupId) {
  const sets = (await getSets()).filter(s => s.groupId === groupId);
  if (sets.length === 0) return;

  const restSec = sets.find(s => s.restSec)?.restSec || state.restSeconds;
  if (!restSec || restSec <= 0) {
    alert('No rest interval for this circuit. Set one in Settings → Rest timer.');
    return;
  }

  startRest(restSec, 1, new Set(sets.map(s => s.round)).size);
};

window.setLogMode = function(mode) {
  logMode = mode;
  document.getElementById('modal-single').classList.toggle('hidden', mode !== 'single');
  document.getElementById('modal-circuit').classList.toggle('hidden', mode !== 'circuit');
  document.querySelectorAll('#log-modal .mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));

  if (mode === 'circuit') {
    const snap = snapshotCircuitValues();
    if (circuitItems.length === 0) {
      const exId = parseInt(document.getElementById('modal-exercise').value, 10);
      if (exId) circuitItems.push({ exerciseId: exId, metrics: metricsForExercise(exId) });
    }
    document.getElementById('modal-title').textContent = 'Log · Circuit';
    renderCircuit(snap);
  } else {
    const exId = parseInt(document.getElementById('modal-exercise').value, 10);
    document.getElementById('modal-title').textContent = `Log · ${metricListLabel(metricsForExercise(exId))}`;
  }
};

function openLogModal() {
  const sel = document.getElementById('modal-exercise');
  sel.innerHTML = state.exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (state.lastExerciseId) sel.value = String(state.lastExerciseId);

  document.getElementById('log-modal').classList.add('open');
  renderModalForExercise(parseInt(sel.value, 10));
  setLogMode('single');
}

window.closeLogModal = function() {
  document.getElementById('log-modal').classList.remove('open');
};

window.onLogExerciseChange = function(val) {
  renderModalForExercise(parseInt(val, 10));
};

// Build one composite payload from a scoped form. Every metric the exercise
// declares must be present — returns { error } naming what's missing.
function buildSetPayload(exerciseId, metrics, scope, base) {
  const payload = { exerciseId, type: metrics[0], ...base };
  const name = state.exercises.find(e => e.id === exerciseId)?.name || 'every exercise';

  for (const metric of metrics) {
    if (metric === 'strength') {
      const weight = fieldValue(scope, 'weight');
      if (weight === null) return { error: `Enter a weight for ${name}.` };
      payload.weight = Math.round((state.unit === 'kg' ? toLbs(weight) : weight) * 10) / 10;
      const reps = fieldValue(scope, 'reps');
      if (reps === null) return { error: `Enter a rep count for ${name}.` };
      payload.reps = Math.round(reps);
    } else if (metric === 'timed') {
      const duration = fieldValue(scope, 'duration');
      if (duration === null) return { error: `Enter a duration for ${name}.` };
      payload.duration = duration;
    } else if (metric === 'distance') {
      const distance = fieldValue(scope, 'distance');
      if (distance === null) return { error: `Enter a distance for ${name}.` };
      payload.distance = distance;
    } else {
      const output = fieldValue(scope, 'output');
      if (output === null) return { error: `Enter an output value for ${name}.` };
      payload.output = output;
    }
  }

  return { payload };
}

window.submitLog = async function() {
  if (logMode === 'circuit') { await submitCircuit(); return; }

  const exId = parseInt(document.getElementById('modal-exercise').value, 10);
  if (!exId) { alert('Choose an exercise.'); return; }

  const metrics = metricsForExercise(exId);
  const notes = document.getElementById('modal-notes').value.trim();
  const { payload, error } = buildSetPayload(exId, metrics, 'f-', { date: todayStr(), notes });
  if (error) { alert(error); return; }

  try {
    await addSet(payload);   // addSet validates the shape for the set's metric
  } catch (err) {
    alert(err.message);
    return;
  }

  state.lastExerciseId = exId;
  startRest();   // no-op when the rest timer is off
  closeLogModal();
  renderTab('log');
};

// One circuit = rounds × exercises sets sharing a groupId.
async function submitCircuit() {
  if (circuitItems.length < 2) { alert('A circuit needs at least two exercises.'); return; }

  const rounds = parseInt(document.getElementById('circuit-rounds').value, 10);
  if (!Number.isInteger(rounds) || rounds < 1) { alert('Enter a number of rounds.'); return; }
  circuitRounds = rounds;   // remembered for the next circuit

  const restSec = resolveCircuitRest();
  const notes = document.getElementById('modal-notes').value.trim();
  const groupId = newGroupId();
  const date = todayStr();

  const built = [];
  for (let round = 1; round <= rounds; round++) {
    circuitItems.forEach((item, i) => {
      built.push(buildSetPayload(item.exerciseId, item.metrics, circuitScope(i),
        { date, notes, groupId, round, restSec: restSec > 0 ? restSec : null }));
    });
  }

  const bad = built.find(r => r.error);
  if (bad) { alert(bad.error); return; }

  try {
    await addSets(built.map(r => r.payload));
  } catch (err) {
    alert(err.message);
    return;
  }

  state.lastExerciseId = circuitItems[0].exerciseId;
  if (restSec > 0) startRest(restSec);   // rest at the circuit's own interval
  closeLogModal();
  renderTab('log');
}

// ── PRs Tab ────────────────────────────────────────────────
const PR_METRIC_LABEL = { timed: 'Best time', distance: 'Best distance', output: 'Best output' };

function fmtMetricPR(metric, value) {
  if (metric === 'timed') return fmtDuration(value);
  if (metric === 'distance') return displayDistance(value, state.unit);
  return String(value);
}

async function renderPRs(el) {
  const since = sinceDate();
  const windowLabel = { '90': 'Last 3 months', '180': 'Last 6 months', '365': 'Last year', 'all': 'All time' }[state.prWindow] || 'Last year';

  // One getSets() pass, bucketed by exercise — the PR maths below reads it.
  const allSets = await getSets();
  const byExercise = new Map();
  for (const s of allSets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }

  // Strength card — 1RM/3RM/5RM + best volume set — for lifts only.
  const strengthRows = await Promise.all(strengthExercises().map(async ex => ({
    ex,
    prs: await getAllPRs(ex.id, since),
    vol: metricPR(byExercise.get(ex.id) || [], 'strength', since),
  })));
  const hasStrength = strengthRows.some(r => r.prs[1] || r.prs[3] || r.prs[5] || r.vol);

  // Metric card — best value per non-strength metric any exercise declares.
  const metricRows = [];
  for (const ex of state.exercises) {
    for (const metric of (ex.metrics || []).filter(m => m !== 'strength')) {
      const best = metricPR(byExercise.get(ex.id) || [], metric, since);
      if (best) metricRows.push({ ex, metric, best });
    }
  }

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">PR window</div>
      <select onchange="setPRWindow(this.value)">
        <option value="90"  ${state.prWindow==='90' ?'selected':''}>Last 3 months</option>
        <option value="180" ${state.prWindow==='180'?'selected':''}>Last 6 months</option>
        <option value="365" ${state.prWindow==='365'?'selected':''}>Last year</option>
        <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
      </select>
    </div>
    ${hasStrength ? `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">${windowLabel} · Strength</div>
      ${strengthRows.map(({ ex, prs, vol }) => `
        <div class="pr-row">
          <div class="pr-name">${ex.name}</div>
          <div class="pr-cells">
            ${[1,3,5].map(r => `
              <div class="pr-cell">
                <div class="pr-cell-lbl">${r}RM</div>
                <div class="pr-cell-val${prs[r] ? '' : ' empty'}">${prs[r] ? dw(prs[r]) : '—'}</div>
              </div>`).join('')}
            <div class="pr-cell">
              <div class="pr-cell-lbl">Vol</div>
              <div class="pr-cell-val${vol ? '' : ' empty'}">${vol ? dw(vol.value) : '—'}</div>
            </div>
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${metricRows.length ? `
    <div class="card">
      <div class="card-label">${windowLabel} · Metric bests</div>
      ${metricRows.map(({ ex, metric, best }) => `
        <div class="pr-row">
          <div>
            <div class="pr-name">${ex.name}</div>
            <div class="pr-cell-lbl" style="margin-top:2px">${METRIC_LABELS[metric]}</div>
          </div>
          <div class="pr-cells">
            <div class="pr-cell">
              <div class="pr-cell-lbl">${PR_METRIC_LABEL[metric]}</div>
              <div class="pr-cell-val">${fmtMetricPR(metric, best.value)}</div>
            </div>
            <div class="pr-cell">
              <div class="pr-cell-lbl">Date</div>
              <div class="pr-cell-val">${fmtDate(best.date)}</div>
            </div>
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${!hasStrength && metricRows.length === 0 ? `
    <div class="card">
      <div class="empty"><p>No sets logged yet. Start logging to see your PRs here.</p></div>
    </div>` : ''}`;
}

window.setPRWindow = async function(val) {
  state.prWindow = val;
  await setPref('prWindow', val);
  renderTab('prs');
};

// ── Session Planner ────────────────────────────────────────
async function renderPlanner(el) {
  const since = sinceDate();
  const { barWeight, plates } = state.equipment;

  // Build HTML for each movement block
  const blocksHtml = await Promise.all(state.plannerWorkout.map(async (block, bi) => {
    const exOptions = strengthExercises().map(e =>
      `<option value="${e.id}" ${e.id === block.exerciseId ? 'selected' : ''}>${e.name}</option>`
    ).join('');

    const prs = block.exerciseId ? await getAllPRs(block.exerciseId, since) : { 1: null, 3: null, 5: null };
    const pr = prs[block.rmType];

    // Compute targets per set
    const targets = block.sets.map(s => {
      if (s.mode === 'pct') return pr ? targetFromPct(pr, s.value) : null;
      return s.value || null;
    });

    const validTargets = targets.map(t => t || 0);
    const plan = buildSessionPlan(validTargets, barWeight, plates);

    // ── Set rows ───────────────────────────────────────────
    const setsHtml = block.sets.map((set, si) => {
      const isDone = block.checked[si];
      const target = targets[si];
      const weightDisplay = plan[si] && target ? dw(plan[si].actual) : '—';
      const isPct = set.mode === 'pct';

      const valueInput = isPct
        ? `<input class="pct-input" type="number" min="1" max="200" value="${set.value}"
             onchange="updateSetVal(${bi},${si},this.value)" />`
        : `<input class="pct-input" type="number" min="0" step="2.5" value="${set.value}"
             style="width:68px !important" onchange="updateSetVal(${bi},${si},this.value)" />`;

      const modePill = `
        <button onclick="toggleSetMode(${bi},${si})"
          style="background:none;border:1px solid var(--border-md);border-radius:5px;
                 padding:3px 5px;font-size:10px;color:${isPct ? 'var(--accent)' : 'var(--text-2)'};
                 cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0;line-height:1">
          ${isPct ? '%' : 'lb'}
        </button>`;

      const repsInput = `
        <input type="number" min="1" max="99" value="${set.reps}"
          style="width:40px !important;padding:6px 4px !important;font-size:13px !important;text-align:center"
          onchange="updateSetReps(${bi},${si},this.value)" />
        <span style="font-size:11px;color:var(--text-3)">×</span>`;

      return `
        <div class="set-row${isDone ? ' done' : ''}" id="sr-${bi}-${si}">
          <div class="set-num">${si + 1}</div>
          <div class="pct-wrap" style="gap:4px">
            ${repsInput}
            ${valueInput}
            ${modePill}
          </div>
          <div class="set-spacer"></div>
          <div class="set-weight">${weightDisplay}</div>
          <div class="set-check${isDone ? ' checked' : ''}" id="sc-${bi}-${si}"
            onclick="toggleSetCheck(${bi},${si})" role="checkbox" aria-label="Mark set ${si+1} complete">
            ${isDone ? '✓' : ''}
          </div>
        </div>`;
    }).join('');

    // ── Plate transitions ──────────────────────────────────
    const incompletePlan = plan.filter((_, si) => !block.checked[si] && targets[si] && targets[si] > 0);
    const validPlan = plan.filter((_, si) => targets[si] && targets[si] > 0);
    const allDone = validPlan.length > 0 && incompletePlan.length === 0;

    let currentPlates = [];
    for (let si = plan.length - 1; si >= 0; si--) {
      if (block.checked[si]) { currentPlates = plan[si].plates; break; }
    }

    function plateMap(p) { return Object.fromEntries(p.map(x => [x.weight, x.count])); }
    function delta(from, to) {
      const fm = plateMap(from), tm = plateMap(to);
      const ws = new Set([...Object.keys(fm), ...Object.keys(tm)].map(Number));
      const add = [], remove = [];
      for (const w of [...ws].sort((a,b) => b-a)) {
        const bf = fm[w]||0, af = tm[w]||0;
        if (af > bf) add.push({weight:w, count:af-bf});
        if (bf > af) remove.push({weight:w, count:bf-af});
      }
      return { add, remove };
    }

    let platesHtml = '';
    if (allDone) {
      platesHtml = `<div style="text-align:center;padding:10px;font-size:14px;color:var(--accent)">🎉 Done!</div>`;
    } else if (incompletePlan.length > 0) {
      let prevPlates = currentPlates;
      platesHtml = incompletePlan.map((step, idx) => {
        const isNext = idx === 0;
        const setLabel = `Set ${step.setIndex + 1} · ${dw(step.actual)}`;
        let instructionHtml = '';

        if (idx === 0 && currentPlates.length === 0) {
          const chips = step.plates.length
            ? step.plates.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
            : '<span class="chip">bar only</span>';
          instructionHtml = `<div class="plate-chips">${chips}</div>`;
        } else {
          const { add, remove } = delta(prevPlates, step.plates);
          const addChips = add.map(p => `<span class="chip" style="border-color:var(--green)"><b style="color:var(--green)">+${p.count}×</b> ${p.weight} lb</span>`).join('');
          const remChips = remove.map(p => `<span class="chip" style="border-color:var(--red)"><b style="color:var(--red)">−${p.count}×</b> ${p.weight} lb</span>`).join('');
          instructionHtml = (!add.length && !remove.length)
            ? `<span class="chip-note">No change</span>`
            : `<div class="plate-chips">${addChips}${remChips}</div>`;
        }

        prevPlates = step.plates;
        const diff = Math.abs(step.actual - (targets[step.setIndex] || 0));
        const note = diff > 0.05 ? `<div class="chip-note">Actual: ${dw(step.actual)}</div>` : '';

        return `
          <div style="margin-bottom:10px${isNext ? '' : ';opacity:0.5'}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              ${isNext ? `<span style="font-size:9px;font-weight:700;font-family:var(--font-display);background:var(--accent);color:#111;padding:3px 8px;border-radius:4px;letter-spacing:0.08em;text-transform:uppercase">NEXT</span>` : ''}
              <div style="font-size:12px;color:var(--text-2)">${setLabel}</div>
            </div>
            ${instructionHtml}${note}
          </div>`;
      }).join('<div class="divider"></div>');
    }

    const prDisplay = pr
      ? `<div style="background:var(--accent-dim);border-radius:var(--radius);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
          <span style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em">${block.rmType}RM PR</span>
          <span style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--accent)">${dw(pr)}</span>
        </div>`
      : `<div style="font-size:12px;color:var(--text-3);padding:6px 0">No PR logged yet for this lift.</div>`;

    const blockCount = state.plannerWorkout.length;

    return `
      <div class="card" id="block-${bi}" style="border:1px solid var(--border);margin-bottom:12px">

        <!-- Block header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">
            Movement ${bi + 1}
          </div>
          ${blockCount > 1
            ? `<button onclick="removeBlock(${bi})"
                style="background:none;border:none;color:var(--text-3);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>`
            : ''}
        </div>

        <!-- Exercise + RM selectors -->
        <div class="form-row" style="margin-bottom:8px">
          <label>Exercise</label>
          <select onchange="updateBlockEx(${bi},this.value)">${exOptions}</select>
        </div>
        <div class="form-row" style="margin-bottom:12px">
          <label>PR type</label>
          <select onchange="updateBlockRM(${bi},this.value)">
            <option value="1" ${block.rmType===1?'selected':''}>1RM${prs[1] ? ' · '+dw(prs[1]) : ''}</option>
            <option value="3" ${block.rmType===3?'selected':''}>3RM${prs[3] ? ' · '+dw(prs[3]) : ''}</option>
            <option value="5" ${block.rmType===5?'selected':''}>5RM${prs[5] ? ' · '+dw(prs[5]) : ''}</option>
          </select>
        </div>
        ${prDisplay}

        <!-- Set rows -->
        <div style="margin-top:14px">
          <div style="display:flex;padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:2px;font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;gap:4px">
            <div style="min-width:22px">#</div>
            <div style="flex:1">Reps · Load</div>
            <div style="min-width:72px;text-align:right">Target</div>
            <div style="width:32px"></div>
          </div>
          ${setsHtml}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="removeSet(${bi})">− Set</button>
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="addSet(${bi})">+ Set</button>
          </div>
        </div>

        <!-- Plate transitions -->
        ${platesHtml ? `
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="card-label" style="margin-bottom:10px">Plates · ${barWeight} lb bar</div>
            ${platesHtml}
          </div>` : ''}
      </div>`;
  }));

  el.innerHTML = `
    ${blocksHtml.join('')}
    <button class="btn btn-full" style="margin-bottom:16px;padding:13px;font-size:14px" onclick="addBlock()">
      + Add Movement
    </button>`;
}

// ── Planner actions ────────────────────────────────────────
window.updateBlockEx = function(bi, val) {
  state.plannerWorkout[bi].exerciseId = parseInt(val);
  renderTab('planner');
};

window.updateBlockRM = function(bi, val) {
  state.plannerWorkout[bi].rmType = parseInt(val);
  renderTab('planner');
};

window.updateSetVal = function(bi, si, val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n >= 0) { state.plannerWorkout[bi].sets[si].value = n; renderTab('planner'); }
};

window.updateSetReps = function(bi, si, val) {
  const n = parseInt(val);
  if (!isNaN(n) && n >= 1) { state.plannerWorkout[bi].sets[si].reps = n; renderTab('planner'); }
};

window.toggleSetMode = function(bi, si) {
  const set = state.plannerWorkout[bi].sets[si];
  set.mode = set.mode === 'pct' ? 'lbs' : 'pct';
  set.value = set.mode === 'pct' ? 75 : 0;
  renderTab('planner');
};

window.toggleSetCheck = function(bi, si) {
  const block = state.plannerWorkout[bi];
  const wasChecked = block.checked[si];
  block.checked[si] = !wasChecked;
  if (!wasChecked) {
    const el = document.getElementById(`sc-${bi}-${si}`);
    if (el) burstFromEl(el);
    showToast();
  }
  renderTab('planner');
};

window.addSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length >= 12) return;
  const last = block.sets[block.sets.length - 1];
  block.sets.push({ mode: last.mode, value: last.value, reps: last.reps });
  block.checked.push(false);
  renderTab('planner');
};

window.removeSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length <= 1) return;
  block.sets.pop();
  block.checked.pop();
  renderTab('planner');
};

window.addBlock = function() {
  state.plannerWorkout.push({
    exerciseId: strengthExercises()[0]?.id ?? null,
    rmType: 1,
    sets: [
      { mode: 'pct', value: 50, reps: 5 },
      { mode: 'pct', value: 75, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
    ],
    checked: [false, false, false, false, false],
  });
  renderTab('planner');
  // Scroll to new block
  setTimeout(() => {
    const el = document.getElementById(`block-${state.plannerWorkout.length - 1}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
};

window.removeBlock = function(bi) {
  if (state.plannerWorkout.length <= 1) return;
  if (!confirm('Remove this movement?')) return;
  state.plannerWorkout.splice(bi, 1);
  renderTab('planner');
};

function showToast() {
  let toast = document.getElementById('nice-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nice-toast';
    toast.className = 'nice-toast';
    document.body.appendChild(toast);
  }
  const msgs = ['Nice work! 💪', 'Get some! 🔥', 'Beast mode.', "Let's go!", 'Crushed it!'];
  toast.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Settings ───────────────────────────────────────────────
async function renderSettings(el) {
  el.innerHTML = `
    <div class="card-label" style="margin-bottom:8px">Preferences</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Units</div><div class="setting-sub">Weight display throughout the app</div></div>
        <select style="width:80px" onchange="setUnit(this.value)">
          <option value="lbs" ${state.unit==='lbs'?'selected':''}>lbs</option>
          <option value="kg"  ${state.unit==='kg' ?'selected':''}>kg</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Default PR window</div><div class="setting-sub">Used in PRs tab and planner</div></div>
        <select style="width:130px" onchange="setPRWindow(this.value)">
          <option value="90"  ${state.prWindow==='90' ?'selected':''}>3 months</option>
          <option value="180" ${state.prWindow==='180'?'selected':''}>6 months</option>
          <option value="365" ${state.prWindow==='365'?'selected':''}>1 year</option>
          <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Rest timer</div><div class="setting-sub">Counts down after you save a set</div></div>
        <select style="width:130px" onchange="setRestSeconds(this.value)">
          ${REST_OPTIONS.map(o => `<option value="${o.value}" ${String(state.restSeconds) === String(o.value) ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Equipment</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Bar weight</div><div class="setting-sub">Used in plate calculator</div></div>
        <input type="number" value="${state.equipment.barWeight}" style="width:70px;text-align:right" onchange="setBarWeight(this.value)" />
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="setting-label">Plates available (per side)</div>
        <div id="plate-editor"></div>
        <button class="btn btn-ghost" style="padding:4px 0" onclick="addPlateType()">+ Add plate size</button>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Exercises</div>
    <div class="card">
      ${state.exercises.map(e => `
        <div class="setting-row" style="gap:8px">
          <div style="flex:1">
            <div class="setting-label">${e.name}</div>
            <div class="metric-chips">
              ${SET_TYPES.map(m => `<button type="button" class="metric-chip${e.metrics.includes(m) ? ' active' : ''}" onclick="toggleExerciseMetric(${e.id}, '${m}')">${METRIC_LABELS[m]}</button>`).join('')}
            </div>
          </div>
          <button class="btn btn-ghost" style="color:var(--text-3);font-size:18px" onclick="deleteEx(${e.id})">✕</button>
        </div>`).join('')}
      <button class="btn btn-ghost" style="padding:4px 0;margin-top:6px" onclick="openAddExercise()">+ Add exercise</button>
    </div>

    <div class="card-label" style="margin-bottom:8px">Data</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Export backup</div><div class="setting-sub">Download all your data as JSON</div></div>
        <button class="btn" onclick="doExport()">Export</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Import backup</div><div class="setting-sub">Restore or merge from a JSON file</div></div>
        <button class="btn" onclick="doImport()">Import</button>
      </div>
    </div>

    <div style="text-align:center;padding:24px 0 4px;font-size:12px;color:var(--text-3)">
      Pulse v${VERSION} · ${BUILD_DATE}
    </div>
    <div style="text-align:center;padding:0 0 8px;font-size:12px">
      <a href="../privacy.html" style="color:var(--text-2);text-decoration:underline">Privacy Policy</a>
    </div>`;

  renderPlateEditor();
}

window.doExport = async function() {
  try { await exportBackup(); } catch(e) { alert('Export failed: ' + e.message); }
};

window.doImport = function() {
  importBackup(async () => {
    state.exercises = await getExercises();
    state.equipment = await getEquipment();
    renderTab('settings');
  });
};

function renderPlateEditor() {
  const el = document.getElementById('plate-editor');
  if (!el) return;
  el.innerHTML = state.equipment.plates.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="number" value="${p.weight}" style="width:70px;text-align:right" onchange="updatePlate(${i},'weight',this.value)" /> lb
      <span style="color:var(--text-2);font-size:13px">×</span>
      <input type="number" value="${p.count}" min="0" max="20" style="width:50px;text-align:center" onchange="updatePlate(${i},'count',this.value)" />
      <button class="btn btn-ghost" style="color:var(--text-3)" onclick="removePlate(${i})">✕</button>
    </div>`).join('');
}

window.setUnit = async function(val) { state.unit = val; await setPref('unit', val); };
window.setBarWeight = async function(val) {
  const n = parseFloat(val); if (isNaN(n)) return;
  state.equipment.barWeight = n;
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
};
window.updatePlate = async function(i, field, val) {
  const n = parseFloat(val); if (isNaN(n)) return;
  state.equipment.plates[i][field] = n;
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
};
window.removePlate = async function(i) {
  state.equipment.plates.splice(i, 1);
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};
window.addPlateType = async function() {
  state.equipment.plates.push({ weight: 2.5, count: 2 });
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};
// Toggle one metric on/off for an exercise. At least one metric must stay
// declared — removing the last one gets a nudge, not a broken exercise.
window.toggleExerciseMetric = async function(id, metric) {
  const exercise = state.exercises.find(e => e.id === id);
  if (!exercise) return;
  const metrics = new Set(exercise.metrics || ['strength']);
  if (metrics.has(metric)) {
    if (metrics.size === 1) { alert('An exercise needs at least one metric.'); return; }
    metrics.delete(metric);
  } else {
    metrics.add(metric);
  }
  await updateExerciseMetrics(id, [...metrics]);
  state.exercises = await getExercises();
  renderTab('settings');
};

window.deleteEx = async function(id) {
  if (!confirm('Delete this exercise? Your logged sets will remain.')) return;
  const { deleteExercise } = await import('./db.js');
  await deleteExercise(id);
  state.exercises = await getExercises();
  renderTab('settings');
};
window.openAddExercise = function() {
  const name = prompt('Exercise name:');
  if (!name?.trim()) return;
  (async () => {
    await import('./db.js').then(m => m.addExercise(name.trim()));
    state.exercises = await getExercises();
    renderTab('settings');
  })();
};

// ── Fuel Tab (Pulse Fuel) ─────────────────────────────────
// Low-friction nutrition: one-tap hand portions, whole-food quality,
// hydration, daily micronutrient-education cards. All local-first.
const WATER_TARGET = 8;
const PROTEIN_TARGET_OPTIONS = [80, 120, 140, 160, 180, 200];
const FUEL_PORTIONS = ['palms', 'fists', 'cupped', 'thumbs'];

async function renderFuel(el) {
  const today = todayStr();
  const [logs, water, proteinTarget] = await Promise.all([
    getFuelLogsForDate(today),
    getWaterLog(today),
    getPref('proteinTarget', 140),
  ]);
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));   // newest first

  const protein = logs.reduce((sum, l) => sum + l.proteinGrams, 0);
  const calories = logs.reduce((sum, l) => sum + l.calories, 0);
  const whole = logs.filter(l => l.isWholeFood).length;
  const qualityPct = logs.length ? Math.round((whole / logs.length) * 100) : null;
  const proteinPct = Math.min(100, Math.round((protein / proteinTarget) * 100));
  const waterPct = Math.min(100, Math.round((water.glasses / WATER_TARGET) * 100));

  const myth = state.fuelMyth || getDailyMythCard(today);

  const portionText = l => {
    const parts = [];
    if (l.handPortions.palms) parts.push(`${l.handPortions.palms}× palm`);
    if (l.handPortions.fists) parts.push(`${l.handPortions.fists}× fist`);
    if (l.handPortions.cupped) parts.push(`${l.handPortions.cupped}× cupped`);
    if (l.handPortions.thumbs) parts.push(`${l.handPortions.thumbs}× thumb`);
    return parts.join(' · ') || 'note only';
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head">
        <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
        <select style="width:122px" onchange="setProteinTarget(this.value)" aria-label="Protein target">
          ${PROTEIN_TARGET_OPTIONS.map(t => `<option value="${t}" ${Number(proteinTarget) === t ? 'selected' : ''}>${t} g protein</option>`).join('')}
        </select>
      </div>

      <div class="meter-block">
        <div class="meter-head"><span>Protein</span><span><b>${Math.round(protein)}</b> / ${proteinTarget} g</span></div>
        <div class="meter"><div class="meter-fill" style="width:${proteinPct}%"></div></div>
      </div>

      <div class="meter-block">
        <div class="meter-head"><span>Food quality</span><span><b>${qualityPct === null ? '—' : qualityPct + '%'}</b>${logs.length ? ` whole · ${whole}/${logs.length} logged` : ' · nothing logged yet'}</span></div>
        <div class="meter"><div class="meter-fill${qualityPct === null || qualityPct >= 75 ? ' green' : ''}" style="width:${qualityPct ?? 0}%"></div></div>
      </div>

      <div class="meter-block" style="margin-bottom:0">
        <div class="meter-head water-row">
          <span>Hydration</span>
          <span class="water-btns">
            <button type="button" class="water-btn" onclick="adjustWaterBy(-1)" aria-label="Less water">−</button>
            <b>${water.glasses} / ${WATER_TARGET} glasses</b>
            <button type="button" class="water-btn" onclick="adjustWaterBy(1)" aria-label="More water">+</button>
          </span>
        </div>
        <div class="meter"><div class="meter-fill" style="width:${waterPct}%"></div></div>
      </div>
    </div>

    <div class="myth-card">
      <div class="myth-badge">Myth Buster</div>
      <div class="myth-text">“${myth.myth}”</div>
      <div class="myth-truth"><b>Truth:</b> ${myth.truth}</div>
      <div class="myth-action"><b>Do this:</b> ${myth.action}</div>
      <button type="button" class="btn btn-ghost" onclick="newMythCard()">Show me another →</button>
    </div>

    <div class="card">
      <div class="card-label">Today's fuel${logs.length ? ` · ${Math.round(calories)} kcal` : ''}</div>
      ${logs.length === 0
        ? '<div class="empty"><div class="icon">🥗</div><p>Nothing logged yet. Tap + to log your first hand portion.</p></div>'
        : logs.map(l => `
            <div class="fuel-row" data-id="${l.id}">
              <div>
                <div class="fuel-name">${new Date(l.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${l.isWholeFood ? '<span class="fuel-check">✓ whole</span>' : ''}</div>
                <div class="fuel-detail">${portionText(l)}${l.notes ? ` · ${l.notes}` : ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="text-align:right">
                  <div class="log-weight">${Math.round(l.proteinGrams)} g</div>
                  <div class="fuel-detail">${Math.round(l.calories)} kcal</div>
                </div>
                <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteFuelEntry('${l.id}')" aria-label="Delete entry">✕</button>
              </div>
            </div>`).join('')}
    </div>`;
}

// ── Fuel modal: hand-portion estimator ──────────────────────
let fuelPortions = { palms: 0, fists: 0, cupped: 0, thumbs: 0 };
let fuelWholeFood = true;

function renderFuelEstimate() {
  const est = calcHandPortions(fuelPortions);
  for (const key of FUEL_PORTIONS) {
    const el = document.getElementById(`portion-${key}`);
    if (el) el.textContent = fuelPortions[key];
  }
  const estEl = document.getElementById('fuel-estimate');
  if (estEl) estEl.innerHTML = `<b>${est.proteinGrams} g</b> protein · <b>${est.calories}</b> kcal`;
  document.getElementById('whole-yes').classList.toggle('active', fuelWholeFood);
  document.getElementById('whole-no').classList.toggle('active', !fuelWholeFood);
  document.getElementById('fuel-whole-hint').textContent = fuelWholeFood ? 'Minimally processed' : 'Ultra-processed / packaged';
}

window.openFuelModal = function() {
  fuelPortions = { palms: 0, fists: 0, cupped: 0, thumbs: 0 };
  fuelWholeFood = true;
  document.getElementById('fuel-notes').value = '';
  renderFuelEstimate();
  document.getElementById('fuel-modal').classList.add('open');
};

window.closeFuelModal = function() {
  document.getElementById('fuel-modal').classList.remove('open');
};

window.adjustPortion = function(kind, delta) {
  fuelPortions[kind] = Math.max(0, Math.min(50, (fuelPortions[kind] || 0) + delta));
  renderFuelEstimate();
};

window.setFuelWholeFood = function(yes) {
  fuelWholeFood = Boolean(yes);
  renderFuelEstimate();
};

window.submitFuelLog = async function() {
  const anyPortion = FUEL_PORTIONS.some(k => fuelPortions[k] > 0);
  const notes = document.getElementById('fuel-notes').value.trim();
  if (!anyPortion && !notes) { alert('Tap a portion or add a note.'); return; }

  const est = calcHandPortions(fuelPortions);
  try {
    await addFuelLog({
      timestamp: new Date().toISOString(),
      date: todayStr(),
      proteinGrams: est.proteinGrams,
      calories: est.calories,
      isWholeFood: fuelWholeFood,
      handPortions: { ...fuelPortions },
      notes,
    });
  } catch (err) {
    alert(err.message);
    return;
  }
  window.closeFuelModal();
  await renderTab('fuel');
};

window.deleteFuelEntry = async function(id) {
  if (!confirm('Delete this fuel entry?')) return;
  await deleteFuelLog(id);
  await renderTab('fuel');
};

window.adjustWaterBy = async function(delta) {
  await adjustWater(todayStr(), Number(delta) || 0);
  await renderTab('fuel');
};

window.setProteinTarget = async function(val) {
  await setPref('proteinTarget', parseInt(val, 10) || 140);
  await renderTab('fuel');
};

window.newMythCard = async function() {
  state.fuelMyth = getRandomMythCard();
  await renderTab('fuel');
};

boot();
