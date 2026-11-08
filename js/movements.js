// ── Quick session generator ────────────────────────────────
// Pure data + selection logic behind the Move tab's "Just move" card.
// Kept free of the DOM, IndexedDB and `Date` so it can be unit tested and
// reused. The UI module (js/modules/move/quick.js) owns every side effect.
//
// A movement is one line in the library: what to do, which pattern it
// trains, how it scales, and what equipment (if any) it needs. A session
// is a small circuit drawn from that library — a handful of movements,
// repeated for a few rounds, with reps or seconds scaled to the user's
// level. Nothing here talks to the network, and nothing is personalised
// beyond the options the user picked.

import { getHoldRoutine } from './intervals.js';

export const FOCUS = [
  { id: 'full',   label: 'Full body',  patterns: ['push', 'pull', 'squat', 'hinge', 'core', 'cardio'] },
  { id: 'upper',  label: 'Upper body', patterns: ['push', 'pull', 'core'] },
  { id: 'lower',  label: 'Lower body', patterns: ['squat', 'hinge', 'core', 'cardio'] },
  { id: 'core',   label: 'Core',       patterns: ['core', 'hinge', 'cardio'] },
  { id: 'cardio', label: 'Cardio',     patterns: ['cardio', 'squat', 'core'] },
];

export const LEVELS = [
  { id: 'new',       label: 'New to this' },
  { id: 'returning', label: 'Getting back' },
  { id: 'regular',   label: 'Regular' },
];

export const EQUIPMENT = [
  { id: 'none',     label: 'Nothing' },
  { id: 'dumbbell', label: 'Dumbbells' },
  { id: 'band',     label: 'Bands' },
];

export const IMPACT = [
  { id: 'low',    label: 'Low impact' },
  { id: 'normal', label: 'Jumping ok' },
];

export const TIME_OPTIONS = [5, 10, 15, 20, 30];

// Rounds × movements × rest for each session length. Tuned so the estimate
// lands near the chosen time for an average rep pace — it is a guide, not a
// promise, and the session UI never counts down the whole thing.
const SHAPE = {
  5:  { rounds: 2, items: 3, restSec: 20 },
  10: { rounds: 3, items: 3, restSec: 30 },
  15: { rounds: 3, items: 4, restSec: 30 },
  20: { rounds: 4, items: 4, restSec: 30 },
  30: { rounds: 6, items: 4, restSec: 45 },
};

// ── Movement library ───────────────────────────────────────
// `kind: 'reps'` logs an `output` set (the app's generic rep count);
// `kind: 'timed'` logs a `timed` set. Both already exist in the schema, so
// the generator needs no new metric and no database change.
//
// A movement with `variants` is still one exercise family: the scaffold
// name changes with level (Incline push-up → Knee push-up → Push-up), which
// also gives each variant its own honest history and PRs.
export const MOVEMENTS = [
  // Push
  {
    id: 'pushup', name: 'Push-up', pattern: 'push', kind: 'reps', equipment: 'none',
    variants: { new: 'Incline push-up', returning: 'Knee push-up', regular: 'Push-up' },
    reps: { new: 6, returning: 8, regular: 12 },
    cue: 'Hands under shoulders, body in one line. Raise your hands to make it easier.',
  },
  {
    id: 'db-press', name: 'Dumbbell shoulder press', pattern: 'push', kind: 'reps', equipment: 'dumbbell',
    reps: { new: 8, returning: 10, regular: 12 },
    cue: 'Ribs down. Press overhead without arching your back.',
  },

  // Pull
  {
    id: 'towel-row', name: 'Towel row', pattern: 'pull', kind: 'reps', equipment: 'none',
    reps: { new: 6, returning: 8, regular: 12 },
    cue: 'Anchor a towel at chest height. Pull your elbows back and squeeze.',
  },
  {
    id: 'band-row', name: 'Band row', pattern: 'pull', kind: 'reps', equipment: 'band',
    reps: { new: 8, returning: 10, regular: 12 },
    cue: 'Sit tall, pull the band to your ribs, and pause for a second.',
  },
  {
    id: 'db-row', name: 'Dumbbell row', pattern: 'pull', kind: 'reps', equipment: 'dumbbell',
    reps: { new: 8, returning: 10, regular: 12 },
    cue: 'Hinge over, keep your back flat, and row to your hip.',
  },

  // Squat
  {
    id: 'squat', name: 'Squat', pattern: 'squat', kind: 'reps', equipment: 'none',
    variants: { new: 'Chair squat', returning: 'Bodyweight squat', regular: 'Squat' },
    reps: { new: 8, returning: 12, regular: 15 },
    cue: 'Sit back to a chair or as low as is comfortable, then stand tall.',
  },
  {
    id: 'split-squat', name: 'Split squat', pattern: 'squat', kind: 'reps', equipment: 'none',
    variants: { new: 'Supported split squat', returning: 'Split squat', regular: 'Split squat' },
    reps: { new: 6, returning: 8, regular: 10 },
    cue: 'Hold a wall or chair if needed. Do the reps on each side.',
  },
  {
    id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', kind: 'reps', equipment: 'dumbbell',
    reps: { new: 8, returning: 10, regular: 12 },
    cue: 'Hold one weight at your chest. Elbows inside your knees at the bottom.',
  },
  {
    id: 'step-up', name: 'Step-up', pattern: 'squat', kind: 'reps', equipment: 'none',
    reps: { new: 6, returning: 8, regular: 10 },
    cue: 'Use a bottom stair or a sturdy box. Do the reps on each side.',
  },

  // Hinge
  {
    id: 'glute-bridge', name: 'Glute bridge', pattern: 'hinge', kind: 'reps', equipment: 'none',
    reps: { new: 8, returning: 12, regular: 15 },
    cue: 'Feet flat, ribs down. Squeeze your glutes at the top, not your back.',
  },
  {
    id: 'single-leg-bridge', name: 'Single-leg glute bridge', pattern: 'hinge', kind: 'reps', equipment: 'none',
    reps: { new: 5, returning: 6, regular: 8 },
    cue: 'One foot planted, the other knee bent. Do the reps on each side.',
  },
  {
    id: 'db-rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', kind: 'reps', equipment: 'dumbbell',
    reps: { new: 8, returning: 10, regular: 12 },
    cue: 'Push your hips back, keep the weights close, and stop when your hamstrings pull.',
  },

  // Core
  {
    id: 'dead-bug', name: 'Dead bug', pattern: 'core', kind: 'reps', equipment: 'none',
    reps: { new: 6, returning: 8, regular: 10 },
    cue: 'Lower back stays flat. Do the reps on each side, slowly.',
  },
  {
    id: 'bird-dog', name: 'Bird dog', pattern: 'core', kind: 'reps', equipment: 'none',
    reps: { new: 6, returning: 8, regular: 10 },
    cue: 'Reach opposite arm and leg. Do the reps on each side without wobbling.',
  },
  {
    id: 'situp', name: 'Sit-up', pattern: 'core', kind: 'reps', equipment: 'none',
    reps: { new: 6, returning: 10, regular: 12 },
    cue: 'Curl up slowly. If your back complains, swap to dead bugs.',
  },
  {
    id: 'plank', name: 'Plank', pattern: 'core', kind: 'timed', equipment: 'none',
    seconds: { new: 20, returning: 30, regular: 40 },
    cue: 'Elbows under shoulders, ribs down. Stop when your hips sag.',
  },
  {
    id: 'side-plank', name: 'Side plank', pattern: 'core', kind: 'timed', equipment: 'none',
    seconds: { new: 15, returning: 20, regular: 30 },
    cue: 'Knees bent or legs long. Do the hold on each side.',
  },
  {
    id: 'hollow-hold', name: 'Hollow hold', pattern: 'core', kind: 'timed', equipment: 'none',
    seconds: { new: 15, returning: 20, regular: 30 },
    cue: 'Lower back pressed down. Bend your knees to make it easier.',
  },

  // Cardio
  {
    id: 'march', name: 'March in place', pattern: 'cardio', kind: 'timed', equipment: 'none',
    seconds: { new: 40, returning: 60, regular: 90 },
    cue: 'Stand tall and swing your arms. Keep it easy enough to talk.',
  },
  {
    id: 'walk-jog', name: 'Walk or jog', pattern: 'cardio', kind: 'timed', equipment: 'none',
    seconds: { new: 60, returning: 90, regular: 120 },
    cue: 'Out the door or on the spot. Walk if jogging is too much today.',
  },
  {
    id: 'jumping-jacks', name: 'Jumping jacks', pattern: 'cardio', kind: 'timed', equipment: 'none', highImpact: true,
    seconds: { new: 30, returning: 40, regular: 60 },
    cue: 'Land softly. Step side to side instead if jumping bothers you.',
  },
  {
    id: 'high-knees', name: 'High knees', pattern: 'cardio', kind: 'timed', equipment: 'none', highImpact: true,
    seconds: { new: 20, returning: 30, regular: 40 },
    cue: 'Quick feet, tall posture. March instead if you need low impact.',
  },
  {
    id: 'mountain-climbers', name: 'Mountain climbers', pattern: 'cardio', kind: 'timed', equipment: 'none', highImpact: true,
    seconds: { new: 20, returning: 30, regular: 40 },
    cue: 'Shoulders over hands, drive one knee at a time.',
  },
  {
    id: 'burpee', name: 'Burpee', pattern: 'cardio', kind: 'reps', equipment: 'none', highImpact: true,
    reps: { new: 4, returning: 6, regular: 8 },
    cue: 'Step back instead of jumping. Stop before your form breaks.',
  },
];

export const MOVEMENT_BY_ID = Object.fromEntries(MOVEMENTS.map(m => [m.id, m]));

// ── Helpers ────────────────────────────────────────────────
// Small seeded PRNG so "Surprise me" can produce a different session every
// time while tests (and "Repeat") get the same one from the same seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function focusById(id) {
  return FOCUS.find(f => f.id === id) ?? FOCUS[0];
}

export function levelById(id) {
  return LEVELS.find(l => l.id === id) ?? LEVELS[1];
}

export function equipmentById(id) {
  return EQUIPMENT.find(e => e.id === id) ?? EQUIPMENT[0];
}

export function impactById(id) {
  return IMPACT.find(i => i.id === id) ?? IMPACT[0];
}

// The exercise name for a level: "Incline push-up", "Knee push-up", …
export function variantName(movement, level) {
  return movement?.variants?.[level] ?? movement?.name ?? '';
}

// The prescribed work for one level. Reps or seconds depending on `kind`.
export function targetFor(movement, level) {
  const table = movement.kind === 'reps' ? movement.reps : movement.seconds;
  const fallback = movement.kind === 'reps' ? 8 : 30;
  const value = Number(table?.[level]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function unitFor(movement) {
  return movement.kind === 'reps' ? 'reps' : 'sec';
}

// ── Selection ──────────────────────────────────────────────
// Filter first (focus, equipment, impact), then take turns across patterns
// so a full-body session always samples different kinds of movement instead
// of drawing four core exercises in a row.
export function eligibleMovements({ focus = 'full', equipment = 'none', impact = 'low' } = {}) {
  const patterns = focusById(focus).patterns;
  return MOVEMENTS.filter(m => {
    if (!patterns.includes(m.pattern)) return false;
    if (m.equipment !== 'none' && m.equipment !== equipment) return false;
    if (impact === 'low' && m.highImpact) return false;
    return true;
  });
}

function pickBalanced(pool, count, patterns, rng) {
  const buckets = shuffled(patterns, rng).map(pattern => ({
    pattern,
    items: shuffled(pool.filter(m => m.pattern === pattern), rng),
  })).filter(b => b.items.length > 0);

  const picked = [];
  while (picked.length < count && buckets.length > 0) {
    let added = false;
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      const movement = bucket.items.shift();
      if (movement) { picked.push(movement); added = true; }
    }
    if (!added) break;
  }
  return picked;
}

// ── Session ────────────────────────────────────────────────
export function buildSession({
  minutes = 10,
  focus = 'full',
  equipment = 'none',
  impact = 'low',
  level = 'returning',
  seed = null,
} = {}) {
  const shape = SHAPE[minutes] ?? SHAPE[10];
  const rng = mulberry32(Number.isFinite(seed) ? seed : Math.floor(Math.random() * 2 ** 32));
  const focusDef = focusById(focus);
  const pool = eligibleMovements({ focus, equipment, impact });

  // If the filters leave fewer movements than the shape asks for (e.g. a
  // 30-minute cardio session with no equipment), repeat what is available
  // rather than returning a broken session.
  const picked = pickBalanced(pool, shape.items, focusDef.patterns, rng);
  if (picked.length === 0) return null;

  const items = picked.map(movement => ({
    movementId: movement.id,
    name: variantName(movement, level),
    pattern: movement.pattern,
    kind: movement.kind,
    unit: unitFor(movement),
    target: targetFor(movement, level),
    cue: movement.cue,
  }));

  const workSec = items.reduce(
    (sum, item) => sum + (item.kind === 'reps' ? item.target * 3 : item.target),
    0,
  );
  const perRound = workSec + shape.restSec * Math.max(0, items.length - 1);
  const totalSec = perRound * shape.rounds + shape.restSec * Math.max(0, shape.rounds - 1);

  return {
    seed: Number.isFinite(seed) ? seed : null,
    minutes,
    focus,
    focusLabel: focusDef.label,
    equipment,
    impact,
    level,
    name: `Quick ${focusDef.label.toLowerCase()}`,
    rounds: shape.rounds,
    restSec: shape.restSec,
    items,
    estimatedMin: Math.max(1, Math.round(totalSec / 60)),
  };
}

// A short line for the card / session header.
export function describeSession(session) {
  if (!session) return 'No session';
  return `${session.rounds} rounds · ${session.items.length} movements · ~${session.estimatedMin} min`;
}

// ── Daily session ──────────────────────────────────────────
// Today's move is drawn from a fixed five-day cycle anchored to a known date,
// so every install sees the same kind of session on the same day. It is pure:
// no clock, no network, no stored history — the date string is the only input.
// The level still scales the prescription, exactly as it does for a quick
// session, because that is a preference rather than part of the plan.
export const DAILY_CYCLE = ['full', 'cardio', 'core', 'mobility', 'rest'];
export const DAILY_ANCHOR = '2026-01-01';

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseDateStr(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const lastDay = month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
  if (day < 1 || day > lastDay) return null;
  return { year, month, day };
}

// Days since 1970-01-01 using civil-date arithmetic (Howard Hinnant's
// `days_from_civil`), which avoids `Date` and any timezone/DST surprises.
function daysFromCivil(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function positiveMod(n, size) {
  return ((n % size) + size) % size;
}

// Days since the anchor. Null for anything that is not a real YYYY-MM-DD date.
export function dailyOrdinal(dateStr) {
  const date = parseDateStr(dateStr);
  if (!date) return null;
  const anchor = parseDateStr(DAILY_ANCHOR);
  return daysFromCivil(date.year, date.month, date.day)
    - daysFromCivil(anchor.year, anchor.month, anchor.day);
}

// The kind of day the cycle lands on: full, cardio, core, mobility or rest.
export function dailyKind(dateStr) {
  const ordinal = dailyOrdinal(dateStr);
  if (ordinal === null) return null;
  return DAILY_CYCLE[positiveMod(ordinal, DAILY_CYCLE.length)];
}

const DAILY_COPY = {
  full: {
    title: 'Full body',
    name: "Today's full body",
    blurb: 'A balanced circuit for the whole body — push, pull, squat, hinge and core.',
  },
  cardio: {
    title: 'Cardio',
    name: "Today's cardio",
    blurb: 'Get the heart rate up with no equipment and no counting the clock.',
  },
  core: {
    title: 'Core',
    name: "Today's core",
    blurb: 'Steady trunk work. Quality of position beats speed.',
  },
  mobility: {
    title: 'Mobility',
    name: 'Mobility',
    blurb: 'Holds and positions, not effort. Move gently and breathe.',
  },
  rest: {
    title: 'Rest day',
    name: 'Rest day',
    blurb: 'Rest is training, not failure. Adaptation happens while you recover.',
  },
};

const REST_STEPS = [
  'Sleep is the main session today — aim for a full night.',
  'A short, easy walk is fine. It is not a workout.',
  'Check in on Recover so tomorrow can meet you where you are.',
];

export function dailyPlan(dateStr, { level = 'returning' } = {}) {
  const ordinal = dailyOrdinal(dateStr);
  if (ordinal === null) return null;

  const cycleIndex = positiveMod(ordinal, DAILY_CYCLE.length);
  const kind = DAILY_CYCLE[cycleIndex];
  const copy = DAILY_COPY[kind];
  const plan = {
    date: dateStr,
    ordinal,
    kind,
    cycleIndex,
    cycleLength: DAILY_CYCLE.length,
    title: copy.title,
    blurb: copy.blurb,
    session: null,
    routineId: null,
    routineName: null,
    routineHint: null,
    recovery: null,
  };

  if (kind === 'rest') {
    return { ...plan, recovery: [...REST_STEPS] };
  }

  if (kind === 'mobility') {
    // Alternate the two existing hold routines so both sides of the body get
    // attention across the cycle; the routine is launched, not regenerated.
    const routineId = positiveMod(ordinal, 2) === 0 ? 'lower' : 'upper';
    const routine = getHoldRoutine(routineId);
    return {
      ...plan,
      routineId,
      routineName: routine?.name ?? null,
      routineHint: routine?.hint ?? null,
    };
  }

  const minutes = kind === 'core' ? 10 : 15;
  const session = buildSession({
    minutes,
    focus: kind,
    equipment: 'none',
    impact: 'low',
    level,
    seed: ordinal,
  });
  if (session) session.name = copy.name;
  return { ...plan, session };
}

// ── Logging ────────────────────────────────────────────────
// One payload per completed movement in one round. `exerciseIds` maps the
// exercise *name* (which is the level variant) to its database id — the UI
// resolves or creates those before calling this.
export function roundPayloads(session, round, exerciseIds, { date, groupId }) {
  if (!session || !Number.isInteger(round) || round < 1) return [];
  return session.items
    .map(item => {
      const exerciseId = exerciseIds?.[item.name];
      if (!Number.isFinite(exerciseId)) return null;
      const base = {
        exerciseId,
        date,
        groupId,
        round,
        restSec: session.restSec,
        source: 'quick',
        unitLabel: item.unit,
      };
      return item.kind === 'reps'
        ? { ...base, type: 'output', output: item.target }
        : { ...base, type: 'timed', duration: item.target };
    })
    .filter(Boolean);
}
