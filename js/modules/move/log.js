// ── Pulse Move: segmented shell (Today | Programs | Planner) ──
import { state, renderTab, registerTab, switchTab } from '../../kernel/shell.js';
import { dw, fmtDate, todayStr, fmtDuration, sinceDate } from '../../kernel/helpers.js';
import { getSets, deleteSet, deleteSetsByGroup, getPref, setPref } from '../../db.js';
import { groupByCircuit } from '../../circuits.js';
import { countPRSets } from '../../pr.js';
import { PRESETS, HOLD_ROUTINES } from '../../intervals.js';
import { formatClock } from '../../timer.js';
import { openLogModal } from './modal.js';
import { quickCardHtml } from './quick.js';
import { renderPlanner } from './planner.js';
import { dailyPlan, describeSession } from '../../movements.js';
import { displayDistance } from '../../calc.js';

const MOVE_VIEWS = ['today', 'programs', 'planner'];

function setDetail(s) {
  const parts = [];
  if (Number.isFinite(s.reps)) parts.push(`${s.reps} rep${s.reps !== 1 ? 's' : ''}`);
  if (Number.isFinite(s.duration)) parts.push(fmtDuration(s.duration));
  if (Number.isFinite(s.distance)) parts.push(displayDistance(s.distance, state.unit));
  if (Number.isFinite(s.output)) {
    parts.push(s.unitLabel === 'reps'
      ? `${s.output} rep${s.output !== 1 ? 's' : ''}`
      : `${s.output} output`);
  }
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

// ── Segmented switch ───────────────────────────────────────
function moveSwitch(view) {
  return `
    <div class="range-toggle move-seg" role="tablist" aria-label="Move view">
      <button role="tab" aria-selected="${view === 'today'}" class="${view === 'today' ? 'active' : ''}" onclick="setMoveView('today')">Today</button>
      <button role="tab" aria-selected="${view === 'programs'}" class="${view === 'programs' ? 'active' : ''}" onclick="setMoveView('programs')">Programs</button>
      <button role="tab" aria-selected="${view === 'planner'}" class="${view === 'planner' ? 'active' : ''}" onclick="setMoveView('planner')">Planner</button>
    </div>`;
}

// ── Today's move ───────────────────────────────────────────
// The plan is derived from the date alone. The level preference only scales
// the prescription; it never changes which kind of day it is.
async function dailyCardHtml() {
  const quickPrefs = await getPref('moveQuick', null);
  const level = quickPrefs?.level || 'returning';
  const today = todayStr();
  const plan = dailyPlan(today, { level });
  if (!plan) return '';

  const doneOn = await getPref('moveDailyDone', null);
  const done = doneOn === today;
  const doneLine = done
    ? '<div class="daily-done">✓ Done for today</div>'
    : '';

  if (plan.kind === 'rest') {
    return `
      <div class="card daily-card rest-card">
        <div class="card-head">
          <div class="card-label" style="margin-bottom:0">Today's move</div>
          <span class="daily-tag">Rest</span>
        </div>
        <div class="daily-title">Rest day</div>
        <p class="daily-blurb">${plan.blurb}</p>
        <ul class="rest-steps">${plan.recovery.map(step => `<li>${step}</li>`).join('')}</ul>
        ${doneLine}
        <button type="button" class="btn btn-full daily-action" onclick="goRecover()">Open Recover</button>
      </div>`;
  }

  if (plan.kind === 'mobility') {
    return `
      <div class="card daily-card mobility-card">
        <div class="card-head">
          <div class="card-label" style="margin-bottom:0">Today's move</div>
          <span class="daily-tag">Mobility</span>
        </div>
        <div class="daily-title">${plan.title}</div>
        <p class="daily-blurb">${plan.blurb}</p>
        <div class="daily-meta">${plan.routineHint || 'A short hold routine'}</div>
        ${doneLine}
        <button type="button" class="btn btn-primary btn-full daily-action"
          onclick="startHoldRoutine('${plan.routineId}')">
          Start ${plan.routineName || 'mobility'} routine
        </button>
      </div>`;
  }

  return `
    <div class="card daily-card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Today's move</div>
        <span class="daily-tag">${plan.title}</span>
      </div>
      <div class="daily-title">${plan.title}</div>
      <p class="daily-blurb">${plan.blurb}</p>
      <div class="daily-meta">${describeSession(plan.session)}</div>
      ${doneLine}
      <button type="button" class="btn btn-primary btn-full daily-action" onclick="startDailySession()">
        ${done ? 'Do it again' : 'Start today\'s move'}
      </button>
    </div>`;
}

window.goRecover = function() {
  switchTab('recover');
};

// ── Intervals card ─────────────────────────────────────────
// The runner itself lives in ./intervals.js; this card is the entry point.
function lastRunLine(last) {
  if (!last) return 'No interval session yet — pick a protocol above.';
  const load = formatClock((last.workSec ?? 0) * 1000);
  const efforts = `${last.rounds ?? 0} effort${(last.rounds ?? 0) === 1 ? '' : 's'}`;
  const day = last.at ? new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  return `Last: ${last.name} · ${efforts} · ${load} under load${day ? ` · ${day}` : ''}`;
}

async function intervalCardHtml() {
  const last = await getPref('intervalLast', null);
  return `
    <div class="card interval-card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Intervals</div>
        <button class="btn btn-ghost rest-start" onclick="startCustomInterval()">Custom</button>
      </div>
      <div class="interval-presets">
        ${PRESETS.map(p => `
          <button type="button" class="interval-preset" onclick="startIntervalPreset('${p.id}')">
            <span class="interval-preset-name">${p.name}</span>
            <span class="interval-preset-hint">${p.hint}</span>
          </button>`).join('')}
      </div>
      <div class="interval-holds">
        <span class="interval-holds-label">Mobility holds</span>
        ${HOLD_ROUTINES.map(r => `
          <button type="button" class="interval-hold" onclick="startHoldRoutine('${r.id}')">
            ${r.name}<span>${r.hint}</span>
          </button>`).join('')}
      </div>
      <div class="interval-last" id="interval-last">${lastRunLine(last)}</div>
    </div>`;
}

// Called by the runner when a session closes, so the card reflects it
// without a full tab re-render (which would drop scroll position).
window.refreshIntervalCard = async function() {
  const el = document.getElementById('interval-last');
  if (!el) return;
  el.textContent = lastRunLine(await getPref('intervalLast', null));
};

// ── Move panes ─────────────────────────────────────────────
async function todayHtml() {
  const allSets = await getSets();
  const today = todayStr();
  const todaySets = allSets.filter(s => s.date === today).reverse();

  // Any metric can set a PR: weight tiers, best volume, reps, holds, distance.
  // Composite sets count once, and the calculation reuses the sets we already
  // loaded — no extra database reads.
  const prCount = countPRSets(todaySets, allSets, sinceDate());

  const exMap = Object.fromEntries(state.exercises.map(e => [e.id, e.name]));
  const blocks = groupByCircuit(todaySets);

  const setsHtml = blocks.length === 0
    ? `<div class="empty"><div class="icon">💪</div><p>Nothing logged today yet. Start with today's move above, or tap + for a set.</p></div>`
    : blocks.map(block =>
        block.groupId ? circuitBlockHtml(block, exMap) : setRowHtml(block.items[0], exMap)
      ).join('');

  return `
    ${await dailyCardHtml()}
    ${await quickCardHtml()}
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

async function programsHtml() {
  return `
    <div class="card programs-intro">
      <div class="card-label">Programs</div>
      <p>Run a protocol on its own, or take a mobility routine on a recovery day. Today's move stays on the Today pane.</p>
    </div>
    ${await intervalCardHtml()}`;
}

// ── Move tab ───────────────────────────────────────────────
async function renderMove(el) {
  const view = MOVE_VIEWS.includes(state.moveView) ? state.moveView : 'today';
  const seg = moveSwitch(view);

  if (view === 'planner') {
    el.innerHTML = `${seg}<div id="move-pane"></div>`;
    await renderPlanner(document.getElementById('move-pane'));
    return;
  }

  el.innerHTML = seg + (view === 'programs' ? await programsHtml() : await todayHtml());
}

window.setMoveView = function(view) {
  state.moveView = MOVE_VIEWS.includes(view) ? view : 'today';
  setPref('moveView', state.moveView).catch(() => {});
  renderTab('log');
};

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
// Quick sessions share the same shape but are not a timed run — they are a
// self-paced checklist, so the runner button is hidden.
function circuitBlockHtml(block, exMap) {
  const exerciseCount = new Set(block.items.map(s => s.exerciseId)).size;
  const rest = block.restSec ? ` · ${formatClock(block.restSec * 1000)} rest` : '';
  const isQuick = block.items.some(s => s.source === 'quick');
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
          <span class="circuit-title">${isQuick ? 'Quick session' : 'Circuit'}</span>
          <span class="circuit-meta">${block.rounds} round${block.rounds !== 1 ? 's' : ''} · ${exerciseCount} exercises${rest}</span>
        </div>
        <div class="circuit-actions">
          ${isQuick ? '' : `<button class="btn btn-ghost circuit-run" onclick="runCircuit('${block.groupId}')">▶ Run</button>`}
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

registerTab('log', { title: 'Move', fabLabel: 'Log a set', fabAction: () => openLogModal(), render: renderMove });
