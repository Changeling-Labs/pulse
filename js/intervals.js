// ── Interval protocols ─────────────────────────────────────
// Pure planning/state model for EMOM, Tabata and static-hold routines.
// Kept free of the DOM and of `Date` so it can be unit tested; the screen
// module (js/modules/move/intervals.js) drives it with a real-time loop and
// passes elapsed deltas, exactly like the rest timer in js/timer.js.
//
// A run is a flat list of blocks. Every block is one of:
//   prep  — "get ready" countdown before the first round
//   work  — an effort interval (Tabata round, EMOM minute)
//   rest  — rest between efforts; omitted after the last round
//   hold  — one static stretch in a mobility routine
// Flat blocks make the state machine trivial and let a throttled tab catch
// up by ticking a large delta through several boundaries at once.

// ── Presets ────────────────────────────────────────────────
// `id` is used by the UI; the rest is plain plan input.
export const PRESETS = [
  { id: 'tabata',  name: 'Tabata',    hint: '20s / 10s · 8 rounds',  workSec: 20, restSec: 10, rounds: 8,  prepSec: 10 },
  { id: 'emom',    name: 'EMOM 10',   hint: '40s / 20s · 10 minutes', workSec: 40, restSec: 20, rounds: 10, prepSec: 5 },
  { id: 'vo2',     name: '30 / 30',   hint: '30s / 30s · 10 rounds',   workSec: 30, restSec: 30, rounds: 10, prepSec: 10 },
  { id: 'forty20', name: '40 / 20',   hint: '40s / 20s · 8 rounds',    workSec: 40, restSec: 20, rounds: 8,  prepSec: 10 },
];

// Mobility routines: named holds with a short transition between them.
// Seconds are deliberately conservative — quality of position beats duration.
export const HOLD_ROUTINES = [
  {
    id: 'lower',
    name: 'Lower body',
    hint: '6 holds · 4 minutes',
    prepSec: 5,
    transitionSec: 5,
    holds: [
      { label: 'Couch stretch — left', seconds: 40 },
      { label: 'Couch stretch — right', seconds: 40 },
      { label: 'Hamstring stretch — left', seconds: 40 },
      { label: 'Hamstring stretch — right', seconds: 40 },
      { label: 'Deep squat hold', seconds: 45 },
      { label: 'Calf stretch — wall', seconds: 30 },
    ],
  },
  {
    id: 'upper',
    name: 'Upper body',
    hint: '5 holds · 3 minutes',
    prepSec: 5,
    transitionSec: 5,
    holds: [
      { label: 'Doorway pec stretch — left', seconds: 40 },
      { label: 'Doorway pec stretch — right', seconds: 40 },
      { label: 'Thoracic opener', seconds: 45 },
      { label: 'Lat stretch — left', seconds: 35 },
      { label: 'Lat stretch — right', seconds: 35 },
    ],
  },
];

export function getPreset(id) {
  return PRESETS.find(p => p.id === id) ?? null;
}

export function getHoldRoutine(id) {
  return HOLD_ROUTINES.find(r => r.id === id) ?? null;
}

// ── Plan building ──────────────────────────────────────────
export function blocksForIntervals({ workSec, restSec, rounds, prepSec = 5 }) {
  const work = Math.max(1, Math.round(Number(workSec) || 0));
  const rest = Math.max(0, Math.round(Number(restSec) || 0));
  const total = Math.max(1, Math.round(Number(rounds) || 0));
  const prep = Math.max(0, Math.round(Number(prepSec) || 0));

  const blocks = [];
  if (prep > 0) blocks.push({ type: 'prep', label: 'Get ready', seconds: prep });

  for (let round = 1; round <= total; round++) {
    blocks.push({ type: 'work', label: 'Work', seconds: work, round, of: total });
    // No trailing rest: the session should end on the last effort, not on
    // a countdown nobody is waiting for.
    if (round < total && rest > 0) {
      blocks.push({ type: 'rest', label: 'Rest', seconds: rest, round, of: total });
    }
  }
  return blocks;
}

export function blocksForHolds(routine) {
  if (!routine || !Array.isArray(routine.holds) || routine.holds.length === 0) return [];
  const prep = Math.max(0, Math.round(Number(routine.prepSec) || 0));
  const transition = Math.max(0, Math.round(Number(routine.transitionSec) || 0));
  const total = routine.holds.length;

  const blocks = [];
  if (prep > 0) blocks.push({ type: 'prep', label: 'Get ready', seconds: prep });

  routine.holds.forEach((hold, i) => {
    const seconds = Math.max(1, Math.round(Number(hold.seconds) || 0));
    blocks.push({ type: 'hold', label: hold.label, seconds, round: i + 1, of: total });
    if (i < total - 1 && transition > 0) {
      blocks.push({ type: 'rest', label: 'Transition', seconds: transition, round: i + 1, of: total });
    }
  });
  return blocks;
}

export function totalSeconds(blocks) {
  return (blocks ?? []).reduce((sum, b) => sum + (Number(b.seconds) || 0), 0);
}

// Work/hold time only — the number worth remembering after a session.
export function workSeconds(blocks) {
  return (blocks ?? []).reduce(
    (sum, b) => sum + (b.type === 'work' || b.type === 'hold' ? Number(b.seconds) || 0 : 0),
    0,
  );
}

// ── Run state ──────────────────────────────────────────────
// `meta` is opaque context for the UI and the saved summary
// (e.g. { kind: 'tabata', name: 'Tabata' }).
export function newRun(blocks, meta = {}) {
  const list = (blocks ?? []).filter(b => Number(b.seconds) > 0);
  const first = list[0] ?? null;
  return {
    meta,
    blocks: list,
    index: 0,
    block: first,
    remainingMs: first ? first.seconds * 1000 : 0,
    elapsedMs: 0,
    totalMs: totalSeconds(list) * 1000,
    running: !!first,
    done: !first,
  };
}

// Move to the next block, skipping any zero-length ones. Returns a done run
// when the list is exhausted.
function advance(run) {
  for (let i = run.index + 1; i < run.blocks.length; i++) {
    const block = run.blocks[i];
    if (Number(block.seconds) > 0) {
      return { ...run, index: i, block, remainingMs: block.seconds * 1000, running: true, done: false };
    }
  }
  return { ...run, index: run.blocks.length, block: null, remainingMs: 0, running: false, done: true };
}

// Advance by a real elapsed delta (not a fixed tick), crossing as many
// block boundaries as fit. `entered` lists every block boundary the run
// passed into, in order, so the UI can fire one cue per transition even if
// the tab was throttled and several blocks elapsed at once. The final entry
// is `{ type: 'done' }` when the run finishes.
export function tickRun(run, deltaMs) {
  if (!run || run.done || !run.running) return { run, entered: [] };

  let remaining = Math.max(0, Number(deltaMs) || 0);
  let r = run;
  const entered = [];

  while (remaining > 0 && !r.done) {
    if (remaining < r.remainingMs) {
      r = {
        ...r,
        remainingMs: r.remainingMs - remaining,
        elapsedMs: r.elapsedMs + remaining,
      };
      remaining = 0;
    } else {
      remaining -= r.remainingMs;
      r = { ...r, elapsedMs: r.elapsedMs + r.remainingMs, remainingMs: 0 };
      r = advance(r);
      entered.push(r.done ? { type: 'done' } : r.block);
    }
  }

  return { run: r, entered };
}

export function pauseRun(run) {
  if (!run || run.done || !run.running) return run;
  return { ...run, running: false };
}

export function resumeRun(run) {
  if (!run || run.done || run.running) return run;
  return { ...run, running: true };
}

// Skip the current block. A paused run stays paused (skipping is a planning
// action, not a play/pause toggle).
export function skipBlock(run) {
  if (!run || run.done) return { run, entered: [] };
  const wasRunning = run.running;
  let next = advance(run);
  if (!next.done) next = { ...next, running: wasRunning };
  return { run: next, entered: [next.done ? { type: 'done' } : next.block] };
}

export function runProgress(run) {
  if (!run || !run.totalMs) return 0;
  return Math.min(1, Math.max(0, run.elapsedMs / run.totalMs));
}

// How many efforts (work or hold blocks) have been completed. The block at
// `index` is in progress and does not count until it is passed.
export function completedEfforts(run) {
  if (!run) return 0;
  return run.blocks
    .slice(0, run.index)
    .filter(b => b.type === 'work' || b.type === 'hold')
    .length;
}

export function runSummary(run) {
  const blocks = run?.blocks ?? [];
  return {
    name: run?.meta?.name ?? 'Intervals',
    kind: run?.meta?.kind ?? 'custom',
    rounds: completedEfforts(run),
    workSec: Math.round(workSeconds(blocks)),
    totalSec: Math.round(totalSeconds(blocks)),
    finished: !!run?.done,
  };
}

// A short "Work 20s" / "Hold 40s" line for the next-up row.
export function describeBlock(block) {
  if (!block) return 'Done';
  if (block.type === 'prep') return `Get ready · ${block.seconds}s`;
  if (block.type === 'rest') return `${block.label} · ${block.seconds}s`;
  return `${block.label} · ${block.seconds}s`;
}
