// ── Pulse Move: starter programmes ─────────────────────────
// The UI half of js/programmes.js: start/leave a plan, load the next session
// into the Planner, and track the next unfinished session in a preference.
// No new database and no schema change — a programme is a small JSON object
// in `preferences`, and a session is just a prefilled planner workout.

import { state, renderTab } from '../../kernel/shell.js';
import { getPref, setPref } from '../../db.js';
import { todayStr, showToast } from '../../kernel/helpers.js';
import {
  PROGRAMMES, programmeById, sessionAt, sessionCount, nextSession,
  sessionLabel, programmeExercises,
} from '../../programmes.js';
import { strengthExercises } from './shared.js';

const PREF = 'moveProgramme';
let prefLoad = null;

function normalizedProgress(progress) {
  if (!progress || typeof progress !== 'object') return null;
  const programme = programmeById(progress.id);
  if (!programme) return null;
  const total = sessionCount(programme);
  const nextIndex = Number.isInteger(progress.nextIndex)
    ? Math.min(Math.max(progress.nextIndex, 0), total)
    : 0;
  return {
    ...progress,
    nextIndex,
    completed: Array.isArray(progress.completed) ? progress.completed : [],
  };
}

export function activeProgramme() {
  const progress = normalizedProgress(state.moveProgramme);
  if (!progress) return null;
  return { programme: programmeById(progress.id), progress };
}

function exerciseIdFor(name) {
  const lifts = strengthExercises();
  const wanted = String(name ?? '').trim().toLowerCase();
  const match = lifts.find(exercise => exercise.name.trim().toLowerCase() === wanted);
  return match?.id ?? lifts[0]?.id ?? null;
}

function mayReplaceActive(id) {
  if (!state.moveProgramme || state.moveProgramme.id === id) return true;
  return confirm('Start this programme? Your current programme progress on this device will be replaced.');
}

// ── Actions ────────────────────────────────────────────────
export function startProgramme(id) {
  const programme = programmeById(id);
  if (!programme || !mayReplaceActive(id)) return;

  state.moveProgramme = {
    id,
    nextIndex: 0,
    startedAt: todayStr(),
    completed: [],
  };
  setPref(PREF, state.moveProgramme).catch(() => { /* progress is a preference */ });
  openProgrammeSession(id, 0);
}

export function openProgrammeSession(programmeId, index) {
  const programme = programmeById(programmeId);
  const session = programme ? sessionAt(programme, index) : null;
  if (!programme || !session) return;

  state.plannerWorkout = session.blocks.map(block => ({
    exerciseId: exerciseIdFor(block.exercise),
    rmType: block.rmType,
    sets: block.sets.map(set => ({ mode: set.mode, value: set.value, reps: set.reps })),
    checked: block.sets.map(() => false),
  }));
  state.programmeSession = { programmeId, index };
  state.moveView = 'planner';
  setPref('moveView', 'planner').catch(() => { /* a view preference */ });
  renderTab('log');
}

export function openNextProgrammeSession() {
  const active = activeProgramme();
  if (!active) return;
  const session = nextSession(active.programme, active.progress);
  if (!session) {
    state.moveView = 'today';
    setPref('moveView', 'today').catch(() => { /* a view preference */ });
    renderTab('log');
    return;
  }
  openProgrammeSession(active.programme.id, session.index);
}

export function completeProgrammeSession() {
  const active = activeProgramme();
  const marker = state.programmeSession;
  if (!active || !marker || marker.programmeId !== active.programme.id) return;

  const progress = active.progress;
  const total = sessionCount(active.programme);
  const index = Number.isInteger(marker.index) ? marker.index : progress.nextIndex;
  const alreadyDone = progress.completed.some(done => done.index === index);
  if (!alreadyDone) progress.completed.push({ index, date: todayStr() });
  progress.nextIndex = Math.max(progress.nextIndex, Math.min(index + 1, total));

  state.moveProgramme = progress;
  state.programmeSession = null;
  setPref(PREF, progress).catch(() => { /* progress is a preference */ });
  showToast();
  state.moveView = 'today';
  setPref('moveView', 'today').catch(() => { /* a view preference */ });
  renderTab('log');
}

export function clearProgrammeSession() {
  state.programmeSession = null;
  renderTab('log');
}

export function leaveProgramme() {
  if (!state.moveProgramme) return;
  if (!confirm('Leave this programme? Your progress on this device will be cleared.')) return;
  state.moveProgramme = null;
  state.programmeSession = null;
  setPref(PREF, null).catch(() => { /* progress is a preference */ });
  state.moveView = 'today';
  setPref('moveView', 'today').catch(() => { /* a view preference */ });
  renderTab('log');
}

// ── Today card ─────────────────────────────────────────────
// Active programme: always show the next session. No programme: show the
// starter prompt only on a truly first-run device, so established users are
// not nagged every day. `hasHistory` is any logged set, ever.
export function programmeCardHtml({ hasHistory = false } = {}) {
  const active = activeProgramme();

  if (!active) {
    if (hasHistory) return '';
    return `
      <div class="card programme-card starter-programme">
        <div class="card-head">
          <div class="card-label" style="margin-bottom:0">Start with a plan</div>
          <span class="programme-tag">${PROGRAMMES.length} programmes</span>
        </div>
        <div class="programme-title">Not sure where to start?</div>
        <p class="programme-blurb">The 6-week beginner progression is three short sessions a week, with a gentle ramp.</p>
        <div class="programme-actions">
          <button type="button" class="btn" onclick="startProgramme('beginner-6')">Start beginner programme</button>
          <button type="button" class="btn btn-ghost" onclick="setMoveView('programs')">See all programmes</button>
        </div>
      </div>`;
  }

  const { programme, progress } = active;
  const total = sessionCount(programme);
  const done = progress.completed.length;
  const next = nextSession(programme, progress);

  if (!next) {
    return `
      <div class="card programme-card complete-programme">
        <div class="card-label">Programme complete</div>
        <div class="programme-title">${programme.name}</div>
        <p class="programme-blurb">You finished all ${total} sessions. Start it again or choose another plan.</p>
        <div class="programme-actions">
          <button type="button" class="btn" onclick="startProgramme('${programme.id}')">Start again</button>
          <button type="button" class="btn btn-ghost" onclick="setMoveView('programs')">Choose another</button>
        </div>
      </div>`;
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return `
    <div class="card programme-card active-programme">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Your programme</div>
        <span class="programme-tag">${done}/${total}</span>
      </div>
      <div class="programme-title">${sessionLabel(next)} · ${next.name}</div>
      <div class="programme-meta">${programme.name} · ${programme.levelLabel}</div>
      <div class="programme-exercises">${programmeExercises(next)}</div>
      <div class="programme-bar" role="progressbar" aria-label="Programme progress"
        aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
        <div class="programme-fill" style="width:${pct}%"></div>
      </div>
      <div class="programme-actions">
        <button type="button" class="btn" onclick="openNextProgrammeSession()">Continue where you left off</button>
        <button type="button" class="btn btn-ghost" onclick="leaveProgramme()">Leave</button>
      </div>
    </div>`;
}

// ── Programs pane ──────────────────────────────────────────
export function programmesCardHtml() {
  const activeId = state.moveProgramme?.id ?? null;
  return `
    <div class="card programmes-card">
      <div class="card-label">Starter programmes</div>
      <p class="programme-blurb">Pick a plan and Pulse keeps your place. Targets use the PRs already in Progress; log a set and they appear.</p>
      <div class="programme-list">
        ${PROGRAMMES.map(programme => {
          const isActive = activeId === programme.id;
          const progress = isActive ? normalizedProgress(state.moveProgramme) : null;
          const next = isActive ? nextSession(programme, progress) : null;
          const total = sessionCount(programme);
          const done = progress?.completed?.length ?? 0;
          const action = isActive
            ? (next
                ? `<button class="btn" onclick="openNextProgrammeSession()">Continue</button>`
                : `<button class="btn" onclick="startProgramme('${programme.id}')">Restart</button>`)
            : `<button class="btn" onclick="startProgramme('${programme.id}')">Start</button>`;
          return `
            <div class="programme-row${isActive ? ' active' : ''}">
              <div class="programme-row-main">
                <div class="programme-row-name">${programme.name}</div>
                <div class="programme-row-meta">${programme.daysPerWeek} days/week · ${programme.weeks} weeks · ${programme.levelLabel}</div>
                <div class="programme-row-desc">${programme.description}</div>
                ${isActive
                  ? `<div class="programme-row-progress">${next ? `Session ${done + 1} of ${total}` : `Complete · ${total} sessions`}</div>`
                  : ''}
              </div>
              <div class="programme-row-action">${action}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Planner banner ─────────────────────────────────────────
export function programmeBannerHtml() {
  const marker = state.programmeSession;
  if (!marker) return '';
  const programme = programmeById(marker.programmeId);
  const session = programme ? sessionAt(programme, marker.index) : null;
  if (!programme || !session) return '';

  return `
    <div class="card programme-banner">
      <div class="card-head">
        <div>
          <div class="card-label" style="margin-bottom:0">${programme.name} · Week ${session.week} of ${programme.weeks}</div>
          <div class="programme-banner-name">${session.name}</div>
        </div>
        <button type="button" class="btn btn-ghost" onclick="clearProgrammeSession()">Close</button>
      </div>
      <div class="programme-banner-focus">${session.focus}</div>
      <div class="programme-banner-note">Log your sets with the ＋ Log set button as you go, then mark the session done.</div>
      <button type="button" class="btn btn-primary btn-full" onclick="completeProgrammeSession()">Mark session done</button>
    </div>`;
}

// ── Globals for inline handlers ────────────────────────────
window.startProgramme = startProgramme;
window.openNextProgrammeSession = openNextProgrammeSession;
window.completeProgrammeSession = completeProgrammeSession;
window.clearProgrammeSession = clearProgrammeSession;
window.leaveProgramme = leaveProgramme;

// Keep the preference in state on boot/tab-switch without making the shell
// know about programme shapes. Called once from log.js's first render path.
export async function loadProgrammePreference() {
  if (!prefLoad) {
    prefLoad = getPref(PREF, null)
      .then(stored => { state.moveProgramme = normalizedProgress(stored); })
      .catch(() => { state.moveProgramme = null; });
  }
  return prefLoad;
}
