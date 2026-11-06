// ── Pulse Move: rest timer ───────────────────────────────
// The bar sits outside the tab content, so it keeps running and stays
// visible while you move around the app. The countdown model lives in
// js/timer.js (pure, unit-tested); this module owns the interval, the
// beep, and the bar.

import { state } from '../../kernel/shell.js';
import { setPref } from '../../db.js';
import { newTimer, tick as tickTimer, extend as extendTimer, pause as pauseTimer, resume as resumeTimer, progress as timerProgress, formatClock, nextRound } from '../../timer.js';
import { primeAudio, beep, vibrate } from '../../cues.js';

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

// Audio context is primed from the starting gesture (see cues.js); the tick
// that finishes a countdown is not a gesture, so it cannot unlock audio.
function restFinished() {
  vibrate([200, 100, 200]);
  beep({ freq: 880, duration: 0.4, gain: 0.12 });
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


export { REST_OPTIONS, CIRCUIT_REST_OPTIONS };
