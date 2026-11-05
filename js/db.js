import { normalizeSet, normalizeExercise, validateSet, normalizeFuelLog, validateFuelLog, normalizeWaterLog } from './schema.js';

// Pulse is the continuation of Iron Log. The IndexedDB name stays 'iron-log'
// on purpose: same github.io origin, same database — installed clients keep
// their full history after the rebrand. Do not rename without a migration.
//
// Shared-DB constraint: Iron Log (the gym-tracker build, still live) reads
// and writes this same store, and it opens with DB_VERSION = 3. Opening a
// v3 database from a higher-version app is fine, but the reverse is not:
// if Pulse bumps DB_VERSION to 4, Iron Log's open('iron-log', 3) would
// throw VersionError and the live gym app would stop booting. Record-shape
// changes therefore have to be additive and lazy in Pulse: new fields are
// written when convenient (see migrateExerciseMetrics), and old readers
// must keep working (the normalize* helpers do exactly that).
//
// Fuel data is DIFFERENT: it needs new object stores, which requires an
// upgrade. So fuel/water logs live in their own database, `pulse-fuel`
// (version 1), owned entirely by Pulse — the shared store never changes.

const DB_NAME = 'iron-log';
const DB_VERSION = 3;
const FUEL_DB_NAME = 'pulse-fuel';
const FUEL_DB_VERSION = 1;

let db;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      const oldVersion = e.oldVersion || 0;

      if (!d.objectStoreNames.contains('exercises')) {
        const ex = d.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        ex.createIndex('name', 'name', { unique: true });
      }

      if (!d.objectStoreNames.contains('sets')) {
        const sets = d.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        sets.createIndex('exerciseId', 'exerciseId');
        sets.createIndex('date', 'date');
        sets.createIndex('exerciseDate', ['exerciseId', 'date']);
      }

      if (!d.objectStoreNames.contains('equipment')) {
        d.createObjectStore('equipment', { keyPath: 'id' });
      }

      if (!d.objectStoreNames.contains('preferences')) {
        d.createObjectStore('preferences', { keyPath: 'key' });
      }

      // In-place record migrations. Each stamp is idempotent, so the read
      // path can assume the current shape instead of migrating per read.
      const migrateStore = (storeName, normalize, changed) => {
        if (!d.objectStoreNames.contains(storeName)) return;
        const store = e.target.transaction.objectStore(storeName);
        store.openCursor().onsuccess = ev => {
          const cursor = ev.target.result;
          if (!cursor) return;
          const next = normalize(cursor.value);
          if (changed(cursor.value, next)) cursor.update(next);
          cursor.continue();
        };
      };

      // v1 → v2: sets gained a `type` discriminator (see schema.js).
      if (oldVersion >= 1 && oldVersion < 2) {
        migrateStore('sets', normalizeSet, (before, after) =>
          before.type !== after.type || before.notes !== after.notes);
      }

      // v2 → v3: exercises gained a `metric`.
      if (oldVersion >= 1 && oldVersion < 3) {
        migrateStore('exercises', normalizeExercise, (before, after) =>
          before.metric !== after.metric);
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function all(store) {
  return new Promise((res, rej) => {
    const req = tx(store).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function get(store, key) {
  return new Promise((res, rej) => {
    const req = tx(store).get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function put(store, value) {
  return new Promise((res, rej) => {
    const req = tx(store, 'readwrite').put(value);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function del(store, key) {
  return new Promise((res, rej) => {
    const req = tx(store, 'readwrite').delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

// ── Exercises ──────────────────────────────────────────────
export async function getExercises() {
  return (await all('exercises')).map(normalizeExercise);
}

// v4 stamp: exercises gained a `metrics` list (derived from the legacy
// singular `metric` by normalizeExercise). Runs once at boot and rewrites
// only the records that still lack the list. Deliberately NOT a DB version
// bump — Iron Log shares this store (see the note at the top of this file).
export async function migrateExerciseMetrics() {
  const raw = await all('exercises');
  for (const ex of raw) {
    if (Array.isArray(ex.metrics) && ex.metrics.length > 0) continue;
    await put('exercises', normalizeExercise(ex));
  }
}

export const addExercise = (name, metrics = ['strength']) =>
  put('exercises', normalizeExercise({ name, metrics }));

export const deleteExercise = id => del('exercises', id);

export async function updateExerciseMetrics(id, metrics) {
  const exercise = await get('exercises', id);
  if (!exercise) return null;
  return put('exercises', normalizeExercise({ ...exercise, metrics }));
}

// ── Sets ───────────────────────────────────────────────────
//
// All reads run through normalizeSet() so callers always get a uniform
// shape, even if the underlying record predates the v2 migration.
export async function getSets() {
  return (await all('sets')).map(normalizeSet);
}

// The metrics an exercise declares, cached per call site. Needed to validate
// composite sets — a rower's set must carry BOTH distance and duration.
async function metricsFor(exerciseId, cache) {
  if (cache.has(exerciseId)) return cache.get(exerciseId);
  const exercise = await get('exercises', exerciseId);
  const metrics = exercise ? normalizeExercise(exercise).metrics : null;
  cache.set(exerciseId, metrics);
  return metrics;
}

export async function addSet(payload) {
  // weight is always stored in lbs
  const record = normalizeSet(payload);
  const metrics = await metricsFor(record.exerciseId, new Map());
  const { ok, error } = validateSet(record, metrics);
  if (!ok) throw new Error(error);
  return put('sets', record);
}

// Write several sets in one transaction. Circuit logging produces
// rounds × exercises records at once, and they should land together or
// not at all.
export async function addSets(payloads) {
  const records = payloads.map(normalizeSet);
  const cache = new Map();   // one exercise read per exerciseId, not per record
  for (const record of records) {
    const metrics = await metricsFor(record.exerciseId, cache);
    const { ok, error } = validateSet(record, metrics);
    if (!ok) throw new Error(error);
  }

  return new Promise((resolve, reject) => {
    const store = tx('sets', 'readwrite');
    for (const record of records) store.put(record);
    const t = store.transaction;
    t.oncomplete = () => resolve(records.length);
    t.onerror = e => reject(e.target.error);
    t.onabort = e => reject(e.target.error);
  });
}

export const deleteSet = id => del('sets', id);

// Delete every set in a circuit (all sets sharing a groupId).
export async function deleteSetsByGroup(groupId) {
  const sets = await getSets();
  const ids = sets.filter(s => s.groupId === groupId).map(s => s.id);
  for (const id of ids) await deleteSet(id);
  return ids.length;
}

// The most recently logged set for an exercise, or null. Pass a `type`
// to restrict the search (e.g. 'strength' when prefilling weight/reps).
export async function getLastSetForExercise(exerciseId, type = null) {
  let sets = await getSetsForExercise(exerciseId);
  if (type) sets = sets.filter(s => s.type === type);
  if (sets.length === 0) return null;
  return sets.reduce((latest, s) => {
    if (!latest) return s;
    if (s.date > latest.date) return s;
    if (s.date === latest.date && (s.id ?? 0) > (latest.id ?? 0)) return s;
    return latest;
  }, null);
}

export function getSetsForExercise(exerciseId) {
  return new Promise((res, rej) => {
    const req = tx('sets').index('exerciseId').getAll(exerciseId);
    req.onsuccess = e => res(e.target.result.map(normalizeSet));
    req.onerror = e => rej(e.target.error);
  });
}

// Returns the max weight logged for a given exercise + rep count,
// optionally filtered to a date window. Falls back to all-time if
// no result found within the window. Only strength sets qualify —
// timed/distance/output sets have no weight to compare.
export async function getPR(exerciseId, reps, sinceDate = null) {
  const sets = await getSetsForExercise(exerciseId);
  const matching = sets.filter(s => s.type === 'strength' && s.reps === reps && Number.isFinite(s.weight));

  if (sinceDate) {
    const windowed = matching.filter(s => s.date >= sinceDate);
    if (windowed.length > 0) {
      return Math.max(...windowed.map(s => s.weight));
    }
  }

  if (matching.length === 0) return null;
  return Math.max(...matching.map(s => s.weight));
}

// Returns PRs for all three rep tiers (1, 3, 5) for one exercise
export async function getAllPRs(exerciseId, sinceDate = null) {
  return {
    1: await getPR(exerciseId, 1, sinceDate),
    3: await getPR(exerciseId, 3, sinceDate),
    5: await getPR(exerciseId, 5, sinceDate),
  };
}

// ── Equipment ──────────────────────────────────────────────
export async function getEquipment() {
  const barRow = await get('equipment', 'barWeight');
  const platesRow = await get('equipment', 'plates');
  return {
    barWeight: barRow ? barRow.value : 45,
    plates: platesRow ? platesRow.value : [
      { weight: 45, count: 2 },
      { weight: 35, count: 2 },
      { weight: 25, count: 2 },
      { weight: 10, count: 4 },
      { weight: 5,  count: 4 },
      { weight: 2.5, count: 4 },
    ],
  };
}

export async function saveEquipment({ barWeight, plates }) {
  await put('equipment', { id: 'barWeight', value: barWeight });
  await put('equipment', { id: 'plates', value: plates });
}

// ── Preferences ────────────────────────────────────────────
export async function getPref(key, defaultVal = null) {
  const row = await get('preferences', key);
  return row ? row.value : defaultVal;
}

export function setPref(key, value) {
  return put('preferences', { key, value });
}

// ── Seed data (first run) ──────────────────────────────────
export async function seedIfEmpty() {
  const exercises = await getExercises();
  if (exercises.length > 0) return;
  const defaults = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Romanian Deadlift', 'Barbell Row'];
  for (const name of defaults) await addExercise(name);
}

// ── Pulse Fuel — separate database ─────────────────────────
//
// Fuel and water logs live in `pulse-fuel`, NOT in the shared `iron-log`
// store (see the note at the top of this file). This database is Pulse-owned,
// so it may bump versions freely. keyPaths/indices:
//   fuel_logs  keyPath 'id'   — indexes: by_date (date), by_timestamp (timestamp)
//   water_logs keyPath 'date' — one record per day: { date, glasses }
let fuelDB;

export function openFuelDB() {
  return new Promise((resolve, reject) => {
    if (fuelDB) return resolve(fuelDB);
    const req = indexedDB.open(FUEL_DB_NAME, FUEL_DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('fuel_logs')) {
        const store = d.createObjectStore('fuel_logs', { keyPath: 'id' });
        store.createIndex('by_date', 'date');
        store.createIndex('by_timestamp', 'timestamp');
      }
      if (!d.objectStoreNames.contains('water_logs')) {
        d.createObjectStore('water_logs', { keyPath: 'date' });
      }
    };

    req.onsuccess = e => { fuelDB = e.target.result; resolve(fuelDB); };
    req.onerror = e => reject(e.target.error);
  });
}

function fuelAll(store) {
  return openFuelDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  }));
}

function fuelPut(store, value) {
  return openFuelDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  }));
}

function fuelDel(store, key) {
  return openFuelDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  }));
}

export async function getFuelLogs() {
  return (await fuelAll('fuel_logs')).map(normalizeFuelLog);
}

export async function getFuelLogsForDate(date) {
  const logs = await getFuelLogs();
  return logs.filter(l => l.date === date);
}

export async function addFuelLog(payload) {
  const record = normalizeFuelLog(payload);
  const { ok, error } = validateFuelLog(record);
  if (!ok) throw new Error(error);
  return fuelPut('fuel_logs', record);
}

export const deleteFuelLog = id => fuelDel('fuel_logs', id);

export async function getWaterLog(date) {
  const db = await openFuelDB();
  return new Promise((res, rej) => {
    const req = db.transaction('water_logs').objectStore('water_logs').get(date);
    req.onsuccess = e => res(e.target.result ? normalizeWaterLog(e.target.result) : { date, glasses: 0 });
    req.onerror = e => rej(e.target.error);
  });
}

export async function setWaterGlasses(date, glasses) {
  return fuelPut('water_logs', normalizeWaterLog({ date, glasses }));
}

export async function adjustWater(date, delta) {
  const current = await getWaterLog(date);
  const next = Math.max(0, current.glasses + delta);
  await setWaterGlasses(date, next);
  return next;
}

export async function getWaterLogs() {
  return (await fuelAll('water_logs')).map(normalizeWaterLog);
}

// Used by backup replace: wipe the Fuel database (our DB — free to clear).
export async function clearFuelDB() {
  const db = await openFuelDB();
  return Promise.all(['fuel_logs', 'water_logs'].map(store =>
    new Promise((res, rej) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).clear();
      req.onsuccess = () => res();
      req.onerror = e => rej(e.target.error);
    })
  ));
}
