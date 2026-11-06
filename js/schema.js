// Pulse — schema for sets, exercises and fuel logs.
import { localDateStr } from './dates.js';

// ── Set schema ─────────────────────────────────────────────
//
// A logged "set" is a record whose meaningful metric fields are picked
// out by the metrics its exercise declares. Everything else in the app
// reads through the helpers here.
//
//   strength   { weight (lbs), reps }
//   timed      { duration (seconds) }
//   distance   { distance (metres) }
//   output     { output (generic work / rep / calorie count) }
//
// An exercise can declare several metrics at once (v4) — e.g. a rower
// logs distance AND time in one effort. The set then carries every
// declared field together, and `type` records the *primary* metric
// (metrics[0]) for backwards compatibility with v3 readers.
//
// Every set also carries: exerciseId, date (YYYY-MM-DD), notes.
//
// Legacy records (v1) have no `type`; they are weight/reps sets and
// normalize to 'strength'.

export const SET_TYPES = ['strength', 'timed', 'distance', 'output'];

// Human labels for the exercise metric configurator.
export const METRIC_LABELS = {
  strength: 'Weight × Reps',
  timed: 'Time',
  distance: 'Distance',
  output: 'Output',
};

// An exercise declares which metrics it logs, so the Log modal can show
// the right inputs. `metrics` (v4) is a non-empty list, e.g. a rower logs
// ['distance', 'timed']. `metric` is kept as a derived alias (metrics[0])
// so older readers — including Iron Log, which shares this database —
// keep working untouched. Exercises without either default to strength.
export function normalizeExercise(exercise = {}) {
  const known = Array.isArray(exercise.metrics) && exercise.metrics.length
    ? exercise.metrics
    : [exercise.metric];
  const metrics = [...new Set(known.filter(m => SET_TYPES.includes(m)))];
  if (metrics.length === 0) metrics.push('strength');
  return { ...exercise, metric: metrics[0], metrics };
}

// ── Fuel schema (Pulse Fuel) ───────────────────────────────
//
// A fuelLog records one hand-logged eating moment — deliberately not a
// 100k-item barcode database. Hand portions are the primary unit; macros
// are *estimates* derived from portions (see js/fuel.js). Water is tracked
// per day in a separate `water_logs` record ({ date, glasses }).
//
// Fuel logs live in their OWN database (`pulse-fuel`, see js/db.js) — the
// shared `iron-log` store stays at DB_VERSION 3 so the live Iron Log app
// keeps booting.
const FUEL_LOG_KEYS = ['palms', 'fists', 'cupped', 'thumbs'];

function intOr(value, def) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return def;
  return Math.floor(n);
}

function boolOr(value, def) {
  return typeof value === 'boolean' ? value : def;
}

export function normalizeHandPortions(p = {}) {
  const out = {};
  for (const key of FUEL_LOG_KEYS) out[key] = intOr(p?.[key], 0);
  return out;
}

export function normalizeFuelLog(raw = {}) {
  const log = { ...raw };

  log.id = typeof log.id === 'string' && log.id.trim() ? log.id : crypto.randomUUID();

  const ts = new Date(log.timestamp);
  const tsValid = !Number.isNaN(ts.getTime());
  log.timestamp = tsValid ? ts.toISOString() : new Date().toISOString();
  // date defaults to the local day of the timestamp (never UTC)
  const dateCandidate = typeof log.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.date)
    ? log.date
    : localDateStr(tsValid ? ts : new Date());
  log.date = dateCandidate;

  log.proteinGrams = Number.isFinite(Number(log.proteinGrams)) && Number(log.proteinGrams) >= 0
    ? Number(log.proteinGrams) : 0;
  log.calories = Number.isFinite(Number(log.calories)) && Number(log.calories) >= 0
    ? Math.round(Number(log.calories)) : 0;
  log.isWholeFood = boolOr(log.isWholeFood, true);
  log.handPortions = normalizeHandPortions(log.handPortions);
  log.notes = typeof log.notes === 'string' ? log.notes : '';

  return log;
}

export function validateFuelLog(log = {}) {
  if (typeof log.id !== 'string' || !log.id.trim()) return { ok: false, error: 'Missing id.' };
  if (Number.isNaN(new Date(log.timestamp).getTime())) return { ok: false, error: 'Missing or invalid timestamp.' };
  if (typeof log.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return { ok: false, error: 'Missing or invalid date (YYYY-MM-DD).' };
  if (!Number.isFinite(log.proteinGrams) || log.proteinGrams < 0 || log.proteinGrams > 1000) {
    return { ok: false, error: 'Protein grams must be between 0 and 1000.' };
  }
  if (!Number.isFinite(log.calories) || log.calories < 0 || log.calories > 10000) {
    return { ok: false, error: 'Calories must be between 0 and 10000.' };
  }
  if (typeof log.isWholeFood !== 'boolean') return { ok: false, error: 'isWholeFood must be a boolean.' };
  const portions = log.handPortions || {};
  for (const key of FUEL_LOG_KEYS) {
    const n = Number(portions[key]);
    if (!Number.isInteger(n) || n < 0 || n > 50) return { ok: false, error: `handPortions.${key} must be a whole number between 0 and 50.` };
  }
  return { ok: true };
}

export function normalizeWaterLog(raw = {}) {
  const out = { ...raw };
  const date = typeof out.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : localDateStr();
  return { date, glasses: intOr(out.glasses, 0) };
}

// ── Pulse Recover ──────────────────────────────────────────
// One check-in per calendar day. Any metric may be null ("not logged") so
// a quick sleep-only entry is valid; validateRecoveryLog still requires at
// least one value, and the UI never writes an empty row.
export function normalizeRecoveryLog(raw = {}) {
  const out = { ...raw };
  const date = typeof out.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : localDateStr();
  const numOrNull = v =>
    (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

  let sleepHours = numOrNull(out.sleepHours);
  if (sleepHours !== null) sleepHours = Math.round(Math.max(0, Math.min(24, sleepHours)) * 4) / 4;

  let soreness = numOrNull(out.soreness);
  if (soreness !== null) soreness = Math.round(Math.max(1, Math.min(10, soreness)));

  let restingHr = numOrNull(out.restingHr);
  if (restingHr !== null) restingHr = Math.round(Math.max(30, Math.min(220, restingHr)));

  const note = typeof out.note === 'string' ? out.note.trim().slice(0, 500) : '';
  return { ...out, date, sleepHours, soreness, restingHr, note };
}

export function validateRecoveryLog(log = {}) {
  if (typeof log.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(log.date)) {
    return { ok: false, error: 'Missing or invalid date (YYYY-MM-DD).' };
  }
  if (log.sleepHours !== null && (!Number.isFinite(log.sleepHours) || log.sleepHours < 0 || log.sleepHours > 24)) {
    return { ok: false, error: 'Sleep must be between 0 and 24 hours.' };
  }
  if (log.soreness !== null && (!Number.isInteger(log.soreness) || log.soreness < 1 || log.soreness > 10)) {
    return { ok: false, error: 'Soreness must be a whole number from 1 to 10.' };
  }
  if (log.restingHr !== null && (!Number.isInteger(log.restingHr) || log.restingHr < 30 || log.restingHr > 220)) {
    return { ok: false, error: 'Resting heart rate must be between 30 and 220 bpm.' };
  }
  if (log.sleepHours === null && log.soreness === null && log.restingHr === null && !log.note) {
    return { ok: false, error: 'Log at least one recovery metric.' };
  }
  return { ok: true };
}

// Bump when the *backup file* shape changes. See migrateBackup().
// v4 = exercises carry `metrics[]` AND backups carry fuelLogs/waterLogs.
// Older exports (≤v2.1.0) import fine: fuel arrays default to [].
export const BACKUP_VERSION = 4;

// Fill in defaults so every consumer can assume a uniform shape.
// `groupId`/`round` mark membership of a circuit, and `restSec` carries the
// circuit's rest-between-rounds interval (see circuits.js); standalone sets
// have groupId null.
export function normalizeSet(set = {}) {
  const type = SET_TYPES.includes(set.type) ? set.type : 'strength';
  return {
    ...set,
    type,
    notes: set.notes ?? '',
    groupId: set.groupId ?? null,
    round: Number.isInteger(set.round) && set.round > 0 ? set.round : null,
    restSec: Number.isFinite(set.restSec) && set.restSec > 0 ? Math.round(set.restSec) : null,
  };
}

// Returns { ok: true } or { ok: false, error } for user-facing display.
// Pass the exercise's declared `metrics` to validate composite sets — every
// declared metric must be present and in range. Without it, only the set's
// `type` is validated (the v3 behaviour, still used by legacy call sites).
export function validateSet(set = {}, metrics = null) {
  if (!Number.isFinite(set.exerciseId)) return { ok: false, error: 'Choose an exercise.' };
  if (!set.date) return { ok: false, error: 'Missing date.' };

  const required = Array.isArray(metrics) && metrics.length ? metrics : [normalizeSet(set).type];
  for (const metric of required) {
    switch (metric) {
      case 'timed':
        if (!Number.isFinite(set.duration) || set.duration <= 0) return { ok: false, error: 'Enter a duration.' };
        break;
      case 'distance':
        if (!Number.isFinite(set.distance) || set.distance <= 0) return { ok: false, error: 'Enter a distance.' };
        break;
      case 'output':
        if (!Number.isFinite(set.output) || set.output <= 0) return { ok: false, error: 'Enter an output value.' };
        break;
      default:
        if (!Number.isFinite(set.weight) || set.weight < 0) return { ok: false, error: 'Enter a weight.' };
        if (!Number.isInteger(set.reps) || set.reps < 1) return { ok: false, error: 'Enter a rep count.' };
    }
  }
  return { ok: true };
}

// Upgrade a parsed backup file to the current version, or throw with a
// message safe to show the user. Older files are migrated; newer files
// are rejected rather than silently misinterpreted.
export function migrateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error("This doesn't look like a valid Pulse backup file.");
  }
  if (!Array.isArray(data.exercises) || !Array.isArray(data.sets)) {
    throw new Error("This doesn't look like a valid Pulse backup file.");
  }

  const version = Number(data.version) || 1;
  if (version > BACKUP_VERSION) {
    throw new Error(`This backup was made with a newer version of Pulse (v${version}). Update the app, then try again.`);
  }

  // v1 → v2: sets gained a `type` discriminator. Records without one
  // are weight/reps sets, so normalizeSet() defaults them to 'strength'.
  const sets = data.sets.map(normalizeSet);

  // v2 → v3: exercises gained a `metric`. Defaults to 'strength'.
  // v3 → v4: exercises gained `metrics` (non-empty list). v3 files carry a
  // singular `metric`; normalizeExercise() derives the list from it, and a
  // composite v4 set validates against every declared metric (see db.js).
  //   v4 also added fuel data: `fuelLogs` (hand-logged entries) and
  //   `waterLogs` (glasses/day). Files that predate Fuel ship neither.
  const exercises = data.exercises.map(normalizeExercise);
  const fuelLogs = Array.isArray(data.fuelLogs) ? data.fuelLogs.map(normalizeFuelLog) : [];
  const waterLogs = Array.isArray(data.waterLogs) ? data.waterLogs.map(normalizeWaterLog) : [];
  // v2.8.0 adds `recoveryLogs` additively — still BACKUP_VERSION 4, so v4
  // files exported before Recover existed import with an empty array.
  const recoveryLogs = Array.isArray(data.recoveryLogs) ? data.recoveryLogs.map(normalizeRecoveryLog) : [];

  return { ...data, version: BACKUP_VERSION, exercises, sets, fuelLogs, waterLogs, recoveryLogs };
}
