// ── Pulse Move: interval runner ────────────────────────────
// Drives js/intervals.js (pure plan/state model) with a real-time loop and
// renders the full-screen runner. Entry points are the global functions
// below, called from the Log tab's Intervals card. Cues are shared with the
// rest timer through js/cues.js.
//
// The runner is intentionally not persisted as a set: it is a pacing tool,
// not a logged lift. The last completed summary is remembered as a device
// preference so the card can show "Last: Tabata · 8 rounds" without adding
// a new data domain (and therefore without touching sync or backups).

import { formatClock } from '../../timer.js';
import { getPref, setPref } from '../../db.js';
import { primeAudio, cue } from '../../cues.js';
import {
  getPreset, getHoldRoutine,
  blocksForIntervals, blocksForHolds,
  newRun, tickRun, pauseRun, resumeRun, skipBlock, runProgress,
  runSummary, describeBlock,
} from '../../intervals.js';

let run = null;
let loopId = null;
let lastTick = 0;
let customDraft = null;        // blocks captured for "Repeat"
let wakeLock = null;
let summaryShown = false;

// ── Overlay skeleton ───────────────────────────────────────
function overlayHtml() {
  return `
  <div class="interval-panel">
    <div class="interval-head">
      <span class="interval-kicker" id="interval-kicker">Interval</span>
      <button type="button" class="interval-x" onclick="closeIntervalOverlay()" aria-label="Close">✕</button>
    </div>
    <div class="interval-name" id="interval-name">Tabata</div>

    <!-- Custom builder -->
    <div id="interval-setup" class="hidden">
      <div class="interval-fields">
        <label>Work <input type="number" id="interval-work" min="5" max="600" step="5" inputmode="numeric" value="40" /></label>
        <label>Rest <input type="number" id="interval-rest" min="0" max="600" step="5" inputmode="numeric" value="20" /></label>
        <label>Rounds <input type="number" id="interval-rounds" min="1" max="60" step="1" inputmode="numeric" value="8" /></label>
      </div>
      <div class="interval-hint">Seconds per interval. The last round ends on the effort, with no trailing rest.</div>
      <button type="button" class="interval-btn primary" onclick="beginCustomInterval()">Start custom</button>
    </div>

    <!-- Live run -->
    <div id="interval-live">
      <div class="interval-round" id="interval-round">Starting</div>
      <div class="interval-phase" id="interval-phase">Get ready</div>
      <div class="interval-clock" id="interval-clock">0:10</div>
      <div class="interval-bar"><div class="interval-fill" id="interval-fill"></div></div>
      <div class="interval-next" id="interval-next">Next · Work 20s</div>
      <div class="interval-actions" id="interval-run-actions">
        <button type="button" class="interval-btn" id="interval-pause" onclick="toggleIntervalPause()">Pause</button>
        <button type="button" class="interval-btn" onclick="skipIntervalPhase()">Skip</button>
        <button type="button" class="interval-btn danger" onclick="endIntervalRun()">End</button>
      </div>
    </div>

    <!-- Summary -->
    <div id="interval-done" class="hidden">
      <div class="interval-done-title" id="interval-done-title">Session complete</div>
      <div class="interval-done-stats" id="interval-done-stats"></div>
      <div class="interval-actions">
        <button type="button" class="interval-btn" onclick="closeIntervalOverlay()">Done</button>
        <button type="button" class="interval-btn primary" onclick="repeatIntervalRun()">Repeat</button>
      </div>
    </div>
  </div>`;
}

function ensureOverlay() {
  let el = document.getElementById('interval-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'interval-overlay';
  el.className = 'interval-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Interval timer');
  el.innerHTML = overlayHtml();
  document.body.appendChild(el);
  return el;
}

// ── Loop ───────────────────────────────────────────────────
function startLoop() {
  if (loopId !== null) return;
  lastTick = Date.now();
  loopId = setInterval(tick, 250);
}

function stopLoop() {
  if (loopId === null) return;
  clearInterval(loopId);
  loopId = null;
}

function tick() {
  if (!run || run.done) return;
  const now = Date.now();
  const delta = now - lastTick;
  lastTick = now;

  const { run: next, entered } = tickRun(run, delta);
  run = next;

  if (entered.length) {
    // Fire one cue for the phase we landed in (not one per skipped block —
    // a throttled tab catching up should not machine-gun the speaker).
    const landed = entered.at(-1);
    if (landed.type === 'done') { finishRun(); return; }
    cue(landed.type);
  }

  renderRun();
  if (run.done) finishRun();
}

// ── Wake lock ──────────────────────────────────────────────
// Acquired on start and re-acquired when the tab becomes visible again. The
// OS may also drop the lock on its own (low power mode, a call, a long
// background stretch) without a visibility change — listen for that and
// retry, but only while a run is live and the page is actually visible.
async function acquireWakeLock() {
  try {
    if (!navigator.wakeLock?.request) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (wakeLock && !wakeLock.released) return;

    const lock = await navigator.wakeLock.request('screen');
    wakeLock = lock;

    lock.addEventListener?.('release', () => {
      if (wakeLock === lock) wakeLock = null;
      if (!run || run.done) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Retry shortly; a fast re-request loop would fight the OS.
      setTimeout(acquireWakeLock, 1000);
    });
  } catch { /* denied or unsupported */ }
}

function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch { /* already gone */ }
  wakeLock = null;
}

// The browser drops the lock when the page hides; take it back on return
// while a run is still live.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && run && !run.done) acquireWakeLock();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('interval-overlay');
    if (!overlay?.classList.contains('open')) return;
    if (run && !run.done) window.endIntervalRun();
    else window.closeIntervalOverlay();
  });
}

// ── Rendering ──────────────────────────────────────────────
const PHASE_LABEL = { prep: 'Get ready', work: 'Work', rest: 'Rest', hold: 'Hold' };

function renderRun() {
  if (!run) return;
  const overlay = ensureOverlay();
  const block = run.block;

  const phase = block ? block.type : 'done';
  overlay.dataset.phase = phase;
  overlay.classList.toggle('paused', !run.running && !run.done);
  document.body.classList.add('interval-active');

  document.getElementById('interval-kicker').textContent =
    run.meta.kind === 'hold' ? 'Mobility holds' : 'Interval timer';
  document.getElementById('interval-name').textContent = run.meta.name ?? 'Interval';

  document.getElementById('interval-phase').textContent =
    block ? (block.type === 'rest' ? block.label : PHASE_LABEL[block.type] ?? 'Work') : 'Done';

  let roundText = '';
  if (block?.round && block?.of) roundText = `Round ${block.round} of ${block.of}`;
  if (block?.type === 'hold') roundText = `Hold ${block.round} of ${block.of}`;
  document.getElementById('interval-round').textContent = roundText;

  document.getElementById('interval-clock').textContent = formatClock(run.remainingMs);

  const nextIndex = run.index + 1;
  const next = run.blocks[nextIndex] ?? null;
  document.getElementById('interval-next').textContent =
    next ? `Next · ${describeBlock(next)}` : 'Last effort — finish strong';

  document.getElementById('interval-fill').style.width =
    `${Math.round(runProgress(run) * 100)}%`;

  const pauseBtn = document.getElementById('interval-pause');
  pauseBtn.textContent = run.running ? 'Pause' : 'Resume';
  pauseBtn.disabled = run.done;
}

function showPane(pane) {
  const overlay = ensureOverlay();
  overlay.classList.add('open');
  document.getElementById('interval-setup').classList.toggle('hidden', pane !== 'setup');
  document.getElementById('interval-live').classList.toggle('hidden', pane !== 'live');
  document.getElementById('interval-done').classList.toggle('hidden', pane !== 'done');
  document.body.classList.add('interval-active');
}

function statsLine(summary) {
  const rounds = summary.rounds > 0 ? `${summary.rounds} effort${summary.rounds !== 1 ? 's' : ''}` : 'no efforts';
  return `${rounds} · ${formatClock(summary.workSec * 1000)} under load · ${formatClock(summary.totalSec * 1000)} elapsed`;
}

function finishRun() {
  if (summaryShown) return;
  summaryShown = true;
  stopLoop();
  releaseWakeLock();
  if (run) {
    run = { ...run, done: true, running: false, block: null, remainingMs: 0, elapsedMs: run.totalMs };
  }

  const summary = runSummary(run);
  const heading = document.getElementById('interval-done-title');
  heading.textContent = summary.finished ? 'Session complete' : 'Session ended';
  document.getElementById('interval-done-stats').textContent = statsLine(summary);
  showPane('done');
  cue('done');

  if (summary.finished) {
    setPref('intervalLast', {
      name: summary.name,
      kind: summary.kind,
      rounds: summary.rounds,
      workSec: summary.workSec,
      totalSec: summary.totalSec,
      at: new Date().toISOString(),
    }).catch(() => { /* a summary is a convenience, never load-bearing */ });
  }
}

// ── Public entry points ────────────────────────────────────
function startBlocks(blocks, meta) {
  if (!blocks.length) return;
  primeAudio();
  ensureOverlay();
  document.body.classList.add('interval-active');
  customDraft = { blocks, meta };
  summaryShown = false;
  run = newRun(blocks, meta);
  showPane('live');
  renderRun();
  startLoop();
  acquireWakeLock();
}

window.startIntervalPreset = function(id) {
  const preset = getPreset(id);
  if (!preset) return;
  startBlocks(
    blocksForIntervals(preset),
    { kind: preset.id, name: preset.name },
  );
};

window.startHoldRoutine = function(id) {
  const routine = getHoldRoutine(id);
  if (!routine) return;
  startBlocks(
    blocksForHolds(routine),
    { kind: 'hold', name: `Mobility · ${routine.name}` },
  );
};

window.startCustomInterval = function() {
  primeAudio();
  const overlay = ensureOverlay();
  overlay.dataset.phase = 'setup';
  document.getElementById('interval-kicker').textContent = 'Custom';
  document.getElementById('interval-name').textContent = 'Build an interval';
  showPane('setup');
  getPref('intervalCustom', null).then(prefs => {
    if (!prefs) return;
    const write = (id, value) => {
      const el = document.getElementById(id);
      if (el && Number.isFinite(value)) el.value = value;
    };
    write('interval-work', prefs.workSec);
    write('interval-rest', prefs.restSec);
    write('interval-rounds', prefs.rounds);
  }).catch(() => {});
  document.getElementById('interval-work')?.focus();
};

window.beginCustomInterval = function() {
  const num = (id, fallback) => {
    const n = parseInt(document.getElementById(id)?.value, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const workSec = Math.max(5, Math.min(600, num('interval-work', 40)));
  const restSec = Math.max(0, Math.min(600, num('interval-rest', 20)));
  const rounds = Math.max(1, Math.min(60, num('interval-rounds', 8)));

  setPref('intervalCustom', { workSec, restSec, rounds }).catch(() => {});

  // Round to a clean clock display ("Custom · 40/20") and rebuild.
  const name = `Custom ${workSec}/${restSec}`;
  startBlocks(
    blocksForIntervals({ workSec, restSec, rounds, prepSec: 5 }),
    { kind: 'custom', name },
  );
};

window.toggleIntervalPause = function() {
  if (!run || run.done) return;
  run = run.running ? pauseRun(run) : resumeRun(run);
  renderRun();
};

window.skipIntervalPhase = function() {
  if (!run || run.done) return;
  const { run: next, entered } = skipBlock(run);
  run = next;
  if (entered.length) {
    const landed = entered.at(-1);
    if (landed.type === 'done') { finishRun(); return; }
    cue(landed.type);
  }
  renderRun();
};

window.endIntervalRun = function() {
  if (!run || run.done) { closeIntervalOverlay(); return; }
  // Keep whatever was actually done and show the summary.
  const summary = runSummary(run);
  const elapsedMs = run.elapsedMs;
  run = { ...run, done: true, running: false };
  summaryShown = true;
  stopLoop();
  releaseWakeLock();
  document.getElementById('interval-done-title').textContent = 'Session ended';
  document.getElementById('interval-done-stats').textContent =
    `${summary.rounds} effort${summary.rounds !== 1 ? 's' : ''} · ${formatClock(elapsedMs)} on the clock`;
  showPane('done');
};

window.repeatIntervalRun = function() {
  if (!customDraft) { closeIntervalOverlay(); return; }
  startBlocks(customDraft.blocks, customDraft.meta);
};

window.closeIntervalOverlay = function() {
  stopLoop();
  releaseWakeLock();
  run = null;
  summaryShown = false;
  const overlay = document.getElementById('interval-overlay');
  if (overlay) {
    overlay.classList.remove('open', 'paused');
    overlay.dataset.phase = '';
  }
  document.body.classList.remove('interval-active');
  // The card may show a "last session" line; refresh it if we're on Log.
  if (typeof window.refreshIntervalCard === 'function') window.refreshIntervalCard();
};

