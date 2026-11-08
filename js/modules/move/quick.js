// ── Pulse Move: quick session ──────────────────────────────
// The "Just move" card and its full-screen session. All the planning lives
// in js/movements.js (pure, tested); this file owns the DOM, the exercise
// bookkeeping and the writes.
//
// A session is a self-paced round checklist, not a countdown: tick what you
// actually did, then complete the round. Each completed round is written as
// one circuit (shared groupId + round), so it renders with the app's normal
// circuit block and can be deleted as a unit. Nothing is persisted unless a
// round is completed — closing the tab mid-round saves nothing.
//
// Exercises are created lazily at session start, one per prescribed variant
// ("Incline push-up", "Knee push-up", "Push-up"), so history and PRs stay
// honest per level instead of collapsing into one generic exercise.

import { state, renderTab, switchTab } from '../../kernel/shell.js';
import { todayStr, showToast } from '../../kernel/helpers.js';
import { getPref, setPref, getExercises, addExercise, addSets } from '../../db.js';
import { newGroupId } from '../../circuits.js';
import { formatClock } from '../../timer.js';
import { primeAudio, cue } from '../../cues.js';
import {
  TIME_OPTIONS, FOCUS, LEVELS, EQUIPMENT, IMPACT,
  focusById, levelById, equipmentById, impactById,
  buildSession, describeSession, roundPayloads, dailyPlan,
} from '../../movements.js';

const PREFS_KEY = 'moveQuick';
const DEFAULT_PREFS = { minutes: 10, focus: 'full', equipment: 'none', impact: 'low', level: 'returning' };

let prefs = { ...DEFAULT_PREFS };
let draft = { ...DEFAULT_PREFS };
let prefsLoaded = false;

// Live session state. Null whenever no session is in progress.
let session = null;
let exerciseIds = null;
let groupId = null;
let round = 1;
let checked = new Set();
let doneRounds = 0;
let loggedSets = 0;
let startedAt = 0;
let restLeft = 0;
let restId = null;
let itemTimerId = null;
let itemTimerIndex = -1;
// Set while a daily session is in progress so a full finish can mark the day
// done. A quick session leaves this null and never touches the preference.
let dailyMeta = null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function settingsLine(o) {
  return `${o.minutes} min · ${focusById(o.focus).label} · ${equipmentById(o.equipment).label} · ${impactById(o.impact).label}`;
}

async function loadPrefs() {
  if (prefsLoaded) return prefs;
  const stored = await getPref(PREFS_KEY, null);
  if (stored && typeof stored === 'object') {
    prefs = {
      minutes: TIME_OPTIONS.includes(stored.minutes) ? stored.minutes : DEFAULT_PREFS.minutes,
      focus: FOCUS.some(f => f.id === stored.focus) ? stored.focus : DEFAULT_PREFS.focus,
      equipment: EQUIPMENT.some(e => e.id === stored.equipment) ? stored.equipment : DEFAULT_PREFS.equipment,
      impact: IMPACT.some(i => i.id === stored.impact) ? stored.impact : DEFAULT_PREFS.impact,
      level: LEVELS.some(l => l.id === stored.level) ? stored.level : DEFAULT_PREFS.level,
    };
  }
  draft = { ...prefs };
  prefsLoaded = true;
  return prefs;
}

// ── Card ───────────────────────────────────────────────────
export async function quickCardHtml() {
  await loadPrefs();
  return `
    <div class="card quick-card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Just move</div>
        <button type="button" class="btn btn-ghost quick-options-btn" onclick="openQuickOptions()">Options</button>
      </div>
      <div class="quick-card-title">A short session. No equipment, no thinking.</div>
      <div class="quick-card-meta" id="quick-card-meta">${esc(settingsLine(prefs))}</div>
      <button type="button" class="btn btn-primary btn-full quick-start" onclick="startQuickSession()">
        Start ${prefs.minutes}-minute session
      </button>
      <div class="quick-card-note">Tap through at your own pace — each round is saved as a circuit.</div>
    </div>`;
}

// Called after the options change so the card does not need a full re-render.
function refreshCard() {
  const meta = document.getElementById('quick-card-meta');
  const start = document.querySelector('.quick-start');
  if (meta) meta.textContent = settingsLine(prefs);
  if (start) start.textContent = `Start ${prefs.minutes}-minute session`;
}

// ── Overlay shell ──────────────────────────────────────────
function choicesHtml(key, options, selected) {
  return options.map(o => `
    <button type="button" class="quick-choice ${o.id === selected ? 'active' : ''}"
      data-option="${key}" data-value="${o.id}"
      aria-pressed="${o.id === selected}"
      onclick="setQuickOption('${key}', ${typeof o.id === 'number' ? o.id : `'${o.id}'`})">
      ${esc(o.label)}
    </button>`).join('');
}

function optionGroupsHtml(o) {
  return `
    <div class="quick-setup">
      <div class="quick-group">
        <div class="quick-group-label">Time</div>
        <div class="quick-choices" role="group" aria-label="Session length">
          ${choicesHtml('minutes', TIME_OPTIONS.map(minutes => ({ id: minutes, label: `${minutes} min` })), o.minutes)}
        </div>
      </div>
      <div class="quick-group">
        <div class="quick-group-label">Focus</div>
        <div class="quick-choices" role="group" aria-label="Focus">
          ${choicesHtml('focus', FOCUS, o.focus)}
        </div>
      </div>
      <div class="quick-group">
        <div class="quick-group-label">Level</div>
        <div class="quick-choices" role="group" aria-label="Level">
          ${choicesHtml('level', LEVELS, o.level)}
        </div>
      </div>
      <div class="quick-group">
        <div class="quick-group-label">Equipment</div>
        <div class="quick-choices" role="group" aria-label="Equipment">
          ${choicesHtml('equipment', EQUIPMENT, o.equipment)}
        </div>
      </div>
      <div class="quick-group">
        <div class="quick-group-label">Impact</div>
        <div class="quick-choices" role="group" aria-label="Impact">
          ${choicesHtml('impact', IMPACT, o.impact)}
        </div>
      </div>
      <div class="quick-actions">
        <button type="button" class="interval-btn" onclick="closeQuickOverlay()">Cancel</button>
        <button type="button" class="interval-btn primary" onclick="startQuickFromSetup()">Start session</button>
      </div>
      <div class="quick-note">The same options make a different session each time. Repeat from the summary to run the same one again.</div>
    </div>`;
}

function overlayHtml() {
  return `
  <div class="quick-panel" id="quick-panel" tabindex="-1" role="document">
    <div class="quick-head">
      <span class="quick-kicker" id="quick-kicker">Quick session</span>
      <button type="button" class="interval-x" onclick="closeQuickOverlay()" aria-label="Close">✕</button>
    </div>
    <div class="quick-name" id="quick-name">Just move</div>

    <div id="quick-setup" class="hidden"></div>

    <div id="quick-live" class="hidden">
      <div class="quick-round" id="quick-round" aria-live="polite">Round 1</div>
      <div class="quick-bar"><div class="quick-fill" id="quick-fill"></div></div>
      <div class="quick-items" id="quick-items"></div>
      <div class="quick-rest hidden" id="quick-rest">
        <span id="quick-rest-clock">Rest</span>
        <button type="button" class="btn btn-ghost" onclick="skipQuickRest()">Skip rest</button>
      </div>
      <div class="quick-actions">
        <button type="button" class="interval-btn primary" id="quick-complete" onclick="completeQuickRound()">Complete round</button>
        <button type="button" class="interval-btn danger" onclick="endQuickSession()">End</button>
      </div>
      <div class="quick-note">Ticked movements are saved together as this round's circuit.</div>
    </div>

    <div id="quick-done" class="hidden">
      <div class="quick-done-title" id="quick-done-title">Session complete</div>
      <div class="quick-done-stats" id="quick-done-stats"></div>
      <div class="quick-actions">
        <button type="button" class="interval-btn" onclick="closeQuickOverlay()">Done</button>
        <button type="button" class="interval-btn primary" onclick="repeatQuickSession()">Repeat</button>
      </div>
      <button type="button" class="btn btn-ghost btn-full quick-recover" onclick="openRecoverFromQuick()">
        How did that feel? → Recover
      </button>
    </div>
  </div>`;
}

function ensureOverlay() {
  let el = document.getElementById('quick-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'quick-overlay';
  el.className = 'quick-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Quick session');
  el.innerHTML = overlayHtml();
  document.body.appendChild(el);
  return el;
}

function showPane(pane) {
  const overlay = ensureOverlay();
  overlay.classList.add('open');
  document.body.classList.add('quick-active');
  document.getElementById('quick-setup').classList.toggle('hidden', pane !== 'setup');
  document.getElementById('quick-live').classList.toggle('hidden', pane !== 'live');
  document.getElementById('quick-done').classList.toggle('hidden', pane !== 'done');
}

function focusPanel() {
  const panel = document.getElementById('quick-panel');
  if (panel) panel.focus({ preventScroll: true });
}

// ── Options ────────────────────────────────────────────────
window.openQuickOptions = async function() {
  await loadPrefs();
  draft = { ...prefs };
  const overlay = ensureOverlay();
  document.getElementById('quick-kicker').textContent = 'Quick session';
  document.getElementById('quick-name').textContent = 'Choose your session';
  document.getElementById('quick-setup').innerHTML = optionGroupsHtml(draft);
  showPane('setup');
  focusPanel();
};

window.setQuickOption = function(key, value) {
  if (!(key in draft)) return;
  draft = { ...draft, [key]: value };
  document.getElementById('quick-setup').innerHTML = optionGroupsHtml(draft);
  const active = document.querySelector(
    `#quick-setup .quick-choice[data-option="${key}"][data-value="${value}"]`);
  if (active) active.focus({ preventScroll: true });
  else focusPanel();
};

window.startQuickFromSetup = async function() {
  prefs = { ...draft };
  prefsLoaded = true;
  setPref(PREFS_KEY, { ...prefs }).catch(() => { /* a preference, never load-bearing */ });
  refreshCard();
  await beginSession(buildSession({ ...prefs }));
};

// ── Session lifecycle ──────────────────────────────────────
window.startQuickSession = async function() {
  await loadPrefs();
  await beginSession(buildSession({ ...prefs }));
};

// Today's move: deterministic from the date, with the user's stored level
// scaling the prescription. The session is otherwise a normal self-paced
// session, so it reuses the same UI, logging and circuit shape.
export async function openDailySession() {
  await loadPrefs();
  const plan = dailyPlan(todayStr(), { level: prefs.level });
  if (!plan?.session) return;
  await beginSession(plan.session, { daily: true, date: plan.date });
}

window.startDailySession = openDailySession;

// Resolve one database exercise per prescribed name. If a same-named
// exercise exists with an incompatible metric (a barbell "Squat" when the
// session asks for bodyweight reps), create a "(quick)" variant instead of
// writing a set the exercise's schema would reject.
async function ensureExercises(forSession) {
  const existing = await getExercises();
  const byName = new Map(existing.map(e => [e.name.trim().toLowerCase(), e]));
  const ids = {};

  for (const item of forSession.items) {
    const metric = item.kind === 'reps' ? 'output' : 'timed';
    const key = item.name.trim().toLowerCase();
    const fallbackKey = `${key} (quick)`;

    const candidates = [byName.get(key), byName.get(fallbackKey)].filter(Boolean);
    const match = candidates.find(e => Array.isArray(e.metrics) && e.metrics.includes(metric));
    if (match) {
      ids[item.name] = match.id;
      continue;
    }

    const name = byName.has(key) ? `${item.name} (quick)` : item.name;
    const id = await addExercise(name, [metric]);
    byName.set(name.trim().toLowerCase(), { id, name, metrics: [metric] });
    ids[item.name] = id;
  }

  // The Log rows read exercise names from shared state.
  state.exercises = await getExercises();
  return ids;
}

async function beginSession(next, meta = {}) {
  if (!next) {
    alert('No movements match those options. Try another combination.');
    return;
  }

  primeAudio();
  stopItemTimer();
  stopRest();
  session = next;
  dailyMeta = meta.daily ? { date: meta.date || todayStr() } : null;
  round = 1;
  checked = new Set();
  doneRounds = 0;
  loggedSets = 0;
  startedAt = Date.now();
  groupId = newGroupId();
  try {
    exerciseIds = await ensureExercises(session);
  } catch (err) {
    session = null;
    alert(`Could not prepare the session: ${err.message}`);
    return;
  }

  const overlay = ensureOverlay();
  overlay.classList.remove('done');
  document.getElementById('quick-kicker').textContent = describeSession(session);
  document.getElementById('quick-name').textContent = session.name;
  document.getElementById('quick-items').innerHTML = session.items.map(itemRowHtml).join('');
  renderRound();
  showPane('live');
  focusPanel();
}

function itemRowHtml(item, i) {
  const amount = item.kind === 'reps' ? `${item.target} reps` : `${item.target}s`;
  return `
    <div class="quick-item" id="quick-item-${i}">
      <button type="button" class="quick-check" id="quick-check-${i}" role="checkbox"
        aria-checked="false" aria-label="Mark ${esc(item.name)} done"
        onclick="toggleQuickItem(${i})"></button>
      <button type="button" class="quick-item-main" onclick="toggleQuickItem(${i})">
        <span class="quick-item-name">${esc(item.name)}</span>
        <span class="quick-item-cue">${esc(item.cue)}</span>
      </button>
      <span class="quick-item-amount" id="quick-amount-${i}">${amount}</span>
      ${item.kind === 'timed'
        ? `<button type="button" class="quick-timer-btn" id="quick-timer-${i}"
             aria-label="Start ${item.target} second timer for ${esc(item.name)}"
             onclick="startQuickItemTimer(${i})">▶</button>`
        : ''}
    </div>`;
}

function renderRound() {
  if (!session) return;
  document.getElementById('quick-round').textContent =
    `Round ${round} of ${session.rounds} · ${checked.size}/${session.items.length} ticked`;
  document.getElementById('quick-fill').style.width =
    `${Math.round(((round - 1) / session.rounds) * 100)}%`;
  document.getElementById('quick-complete').disabled = false;

  for (let i = 0; i < session.items.length; i++) {
    setItemDone(i, checked.has(i));
  }
}

function setItemDone(i, done) {
  const row = document.getElementById(`quick-item-${i}`);
  const check = document.getElementById(`quick-check-${i}`);
  if (!row || !check) return;
  row.classList.toggle('done', done);
  check.setAttribute('aria-checked', String(done));
  check.textContent = done ? '✓' : '';
  const item = session.items[i];
  check.setAttribute('aria-label', done ? `Unmark ${item.name}` : `Mark ${item.name} done`);
}

window.toggleQuickItem = function(i) {
  if (!session || !session.items[i]) return;
  if (checked.has(i)) checked.delete(i);
  else checked.add(i);
  setItemDone(i, checked.has(i));
  // Keep the timer honest: stopping it does not un-tick, it just stops.
  if (itemTimerIndex === i) stopItemTimer(true);
  document.getElementById('quick-round').textContent =
    `Round ${round} of ${session.rounds} · ${checked.size}/${session.items.length} ticked`;
};

// ── Per-movement hold timer ────────────────────────────────
window.startQuickItemTimer = function(i) {
  if (!session || !session.items[i]) return;
  const item = session.items[i];
  if (item.kind !== 'timed') return;

  if (itemTimerIndex === i) { stopItemTimer(); return; }

  stopItemTimer();
  primeAudio();
  cue('hold');
  itemTimerIndex = i;
  const total = item.target;
  const endsAt = Date.now() + total * 1000;
  const btn = document.getElementById(`quick-timer-${i}`);
  if (btn) btn.textContent = '■';

  const paint = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const amount = document.getElementById(`quick-amount-${i}`);
    if (amount) amount.textContent = formatClock(left * 1000);
    if (left <= 0) {
      stopItemTimer();
      cue('done');
      if (!checked.has(i)) {
        checked.add(i);
        setItemDone(i, true);
        document.getElementById('quick-round').textContent =
          `Round ${round} of ${session.rounds} · ${checked.size}/${session.items.length} ticked`;
      }
    }
  };

  paint();
  itemTimerId = setInterval(paint, 250);
};

function stopItemTimer(resetAmount = true) {
  if (itemTimerId !== null) clearInterval(itemTimerId);
  itemTimerId = null;
  if (itemTimerIndex >= 0 && resetAmount && session?.items[itemTimerIndex]) {
    const item = session.items[itemTimerIndex];
    const amount = document.getElementById(`quick-amount-${itemTimerIndex}`);
    const btn = document.getElementById(`quick-timer-${itemTimerIndex}`);
    if (amount) amount.textContent = item.kind === 'reps' ? `${item.target} reps` : `${item.target}s`;
    if (btn) btn.textContent = '▶';
  }
  itemTimerIndex = -1;
}

// ── Rest between rounds ────────────────────────────────────
function startRestCountdown() {
  stopRest();
  if (!session?.restSec) return;
  restLeft = session.restSec;
  const row = document.getElementById('quick-rest');
  const clock = document.getElementById('quick-rest-clock');
  if (!row || !clock) return;
  row.classList.remove('hidden');
  const paint = () => {
    clock.textContent = `Rest · ${formatClock(restLeft * 1000)}`;
    if (restLeft <= 0) {
      stopRest();
      cue('work');
    }
    restLeft -= 1;
  };
  cue('rest');
  paint();
  restId = setInterval(paint, 1000);
}

function stopRest() {
  if (restId !== null) clearInterval(restId);
  restId = null;
  restLeft = 0;
  document.getElementById('quick-rest')?.classList.add('hidden');
}

window.skipQuickRest = function() {
  stopRest();
};

// ── Saving ─────────────────────────────────────────────────
async function saveCheckedRound() {
  if (checked.size === 0) return 0;
  const payloads = roundPayloads(session, round, exerciseIds, { date: todayStr(), groupId })
    .filter((_, i) => checked.has(i));
  if (payloads.length === 0) return 0;
  await addSets(payloads);
  loggedSets += payloads.length;
  return payloads.length;
}

window.completeQuickRound = async function() {
  if (!session) return;
  if (checked.size === 0) {
    alert('Tick at least one movement you did, or end the session.');
    return;
  }

  const btn = document.getElementById('quick-complete');
  btn.disabled = true;
  try {
    await saveCheckedRound();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    return;
  }

  showToast();
  doneRounds = round;
  if (round >= session.rounds) { await finishSession(true); return; }

  round += 1;
  checked.clear();
  stopItemTimer();
  renderRound();
  startRestCountdown();
  btn.disabled = false;
};

window.endQuickSession = async function() {
  if (!session) { closeQuickOverlay(); return; }
  if (checked.size > 0) {
    const ok = confirm('End the session? The movements you ticked in this round will be saved.');
    if (!ok) return;
    try {
      await saveCheckedRound();
      doneRounds = Math.max(doneRounds, round);
    } catch (err) {
      alert(err.message);
      return;
    }
  }
  await finishSession(false);
};

async function finishSession(finished) {
  stopItemTimer();
  stopRest();

  const elapsedMin = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  document.getElementById('quick-kicker').textContent = describeSession(session);
  document.getElementById('quick-name').textContent = session?.name ?? 'Quick session';
  document.getElementById('quick-done-title').textContent =
    finished ? 'Session complete' : 'Session ended';
  document.getElementById('quick-done-stats').textContent =
    `${doneRounds} round${doneRounds === 1 ? '' : 's'} · ${loggedSets} set${loggedSets === 1 ? '' : 's'} logged · ${elapsedMin} min`;
  document.getElementById('quick-fill').style.width = '100%';
  showPane('done');
  if (finished) {
    cue('done');
    // Only a fully completed round list marks the day done. Ending early is
    // still valid training, but it does not claim the daily session. Await the
    // write so the card cannot race it when the overlay closes.
    if (dailyMeta) await setPref('moveDailyDone', dailyMeta.date).catch(() => {});
  }
}

// ── Close / repeat ─────────────────────────────────────────
window.repeatQuickSession = async function() {
  if (!session) { closeQuickOverlay(); return; }
  const again = JSON.parse(JSON.stringify(session));
  const meta = dailyMeta ? { daily: true, date: dailyMeta.date } : {};
  await beginSession(again, meta);
};

window.closeQuickOverlay = function() {
  stopItemTimer();
  stopRest();
  session = null;
  exerciseIds = null;
  checked = new Set();
  dailyMeta = null;
  const overlay = document.getElementById('quick-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('quick-active');
  if (state.tab === 'log') renderTab('log');
};

// From the summary: log the session, then go straight to the daily check-in.
window.openRecoverFromQuick = function() {
  window.closeQuickOverlay();
  switchTab('recover');
};

// Escape mirrors the interval runner: leave the current pane safely.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('quick-overlay');
    if (!overlay?.classList.contains('open')) return;
    if (!document.getElementById('quick-live').classList.contains('hidden')) {
      window.endQuickSession();
    } else {
      window.closeQuickOverlay();
    }
  });
}
