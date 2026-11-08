// ── Pulse Move: Log modal ──────────────────────────────────
// The modal renders inputs for every metric the selected exercise declares
// (see schema.js). Every field is a big stepper + free numeric input +
// quick picks, so it stays usable with gloves on. Fields are addressed by
// `scope` so a circuit can show the same inputs more than once: the
// single-set form uses "f-", a circuit item uses "f-c<index>-".

import { state, renderTab } from '../../kernel/shell.js';
import { fieldValue, scopeEl, todayStr, fmtDuration, dw } from '../../kernel/helpers.js';
import { calcPlates, toKg, toLbs, weightStep, displayDistance } from '../../calc.js';
import { METRIC_LABELS } from '../../schema.js';
import { getLastSetForExercise, addSet, addSets } from '../../db.js';
import { newGroupId } from '../../circuits.js';
import { metricsForExercise } from './shared.js';
import { CIRCUIT_REST_OPTIONS } from './timer.js';
import { openDialog, closeDialog, trapDialog } from '../../kernel/a11y.js';
import { handleSaveError } from '../../kernel/errors.js';
import { track } from '../../analytics.js';

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

export function openLogModal() {
  const sel = document.getElementById('modal-exercise');
  sel.innerHTML = state.exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (state.lastExerciseId) sel.value = String(state.lastExerciseId);

  const modal = document.getElementById('log-modal');
  trapDialog(modal, () => window.closeLogModal());
  openDialog(modal, { initialFocus: () => document.getElementById('modal-exercise') });
  renderModalForExercise(parseInt(sel.value, 10));
  setLogMode('single');
}

window.closeLogModal = function() {
  closeDialog(document.getElementById('log-modal'));
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
    track('set-logged');
  } catch (err) {
    handleSaveError(err);
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
    track('circuit-logged');
  } catch (err) {
    handleSaveError(err);
    return;
  }

  state.lastExerciseId = circuitItems[0].exerciseId;
  if (restSec > 0) startRest(restSec);   // rest at the circuit's own interval
  closeLogModal();
  renderTab('log');
}


