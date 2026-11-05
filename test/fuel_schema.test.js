import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_VERSION,
  normalizeFuelLog,
  validateFuelLog,
  normalizeWaterLog,
  normalizeHandPortions,
  normalizeExercise,
  migrateBackup,
} from '../js/schema.js';

const VALID_LOG = {
  id: 'uuid-1',
  timestamp: '2026-11-05T12:30:00.000Z',
  date: '2026-11-05',
  proteinGrams: 30,
  calories: 400,
  isWholeFood: true,
  handPortions: { palms: 1, fists: 1, cupped: 0, thumbs: 1 },
  notes: 'post-workout lunch',
};

test('normalizeFuelLog passes a valid log through unchanged', () => {
  const out = normalizeFuelLog(VALID_LOG);
  assert.deepEqual(out, VALID_LOG);
});

test('normalizeFuelLog fills defaults for a sparse record', () => {
  const out = normalizeFuelLog({});
  assert.equal(typeof out.id, 'string');
  assert.ok(out.id.length > 0);
  assert.match(out.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.proteinGrams, 0);
  assert.equal(out.calories, 0);
  assert.equal(out.isWholeFood, true);
  assert.deepEqual(out.handPortions, { palms: 0, fists: 0, cupped: 0, thumbs: 0 });
  assert.equal(out.notes, '');
});

test('normalizeFuelLog derives the date from the timestamp when missing', () => {
  const ts = '2026-03-15T22:00:00.000Z';
  const out = normalizeFuelLog({ timestamp: ts });
  assert.match(out.date, /^2026-03-1[456]$/);          // local day of a parseable ts
  assert.equal(out.timestamp, new Date(ts).toISOString());
});

test('normalizeFuelLog rejects garbage numbers and clamps negatives to 0', () => {
  const out = normalizeFuelLog({ proteinGrams: -5, calories: 'lots', handPortions: { palms: 2.9, fists: -1 } });
  assert.equal(out.proteinGrams, 0);
  assert.equal(out.calories, 0);
  assert.equal(out.handPortions.palms, 2);
  assert.equal(out.handPortions.fists, 0);
});

test('normalizeHandPortions drops unknown keys and keeps known ones', () => {
  const out = normalizeHandPortions({ palms: 3, bogus: 9, thumbs: '2' });
  assert.deepEqual(out, { palms: 3, fists: 0, cupped: 0, thumbs: 2 });
});

test('validateFuelLog accepts a valid log', () => {
  assert.equal(validateFuelLog(normalizeFuelLog(VALID_LOG)).ok, true);
});

test('validateFuelLog enforces bounds', () => {
  const base = () => normalizeFuelLog(VALID_LOG);

  const bad1 = { ...base(), proteinGrams: 1001 };
  assert.equal(validateFuelLog(bad1).ok, false);

  const bad2 = { ...base(), calories: -1 };
  assert.equal(validateFuelLog(bad2).ok, false);

  const bad3 = { ...base(), handPortions: { ...base().handPortions, palms: 51 } };
  assert.equal(validateFuelLog(bad3).ok, false);

  const bad4 = { ...base(), handPortions: { ...base().handPortions, fists: 1.5 } };
  assert.equal(validateFuelLog(bad4).ok, false);

  const bad5 = { ...base(), isWholeFood: 'yes' };
  assert.equal(validateFuelLog(bad5).ok, false);

  const bad6 = { ...base(), date: '05/11/2026' };
  assert.equal(validateFuelLog(bad6).ok, false);

  const good = { ...base(), proteinGrams: 0, calories: 0 };
  assert.equal(validateFuelLog(good).ok, true);
});

test('normalizeWaterLog fills defaults', () => {
  const out = normalizeWaterLog({});
  assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.glasses, 0);
  assert.equal(normalizeWaterLog({ date: '2026-11-05', glasses: 6 }).glasses, 6);
  assert.equal(normalizeWaterLog({ date: '2026-11-05', glasses: -3 }).glasses, 0);
});

test('migrateBackup upgrades a v3 backup without fuel data (fuelLogs/waterLogs default to [])', () => {
  const v3 = {
    version: 3,
    exercises: [{ id: 1, name: 'Bench Press' }],
    sets: [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 135, reps: 5, type: 'strength' }],
    equipment: { barWeight: 45, plates: [] },
  };
  const out = migrateBackup(v3);
  assert.equal(out.version, BACKUP_VERSION);
  assert.deepEqual(out.fuelLogs, []);
  assert.deepEqual(out.waterLogs, []);
  assert.deepEqual(out.exercises[0].metrics, ['strength']);
});

test('migrateBackup keeps and normalizes fuel data in a v4 backup', () => {
  const v4 = {
    version: 4,
    exercises: [{ id: 1, name: 'Bench Press', metrics: ['strength'] }],
    sets: [],
    fuelLogs: [{ id: 'f1', timestamp: '2026-11-05T08:00:00.000Z', date: '2026-11-05', proteinGrams: 25, calories: 175, isWholeFood: false, handPortions: { palms: 1, fists: 0, cupped: 0, thumbs: 0 }, notes: 'yogurt' }],
    waterLogs: [{ date: '2026-11-05', glasses: 6 }],
  };
  const out = migrateBackup(v4);
  assert.equal(out.version, BACKUP_VERSION);
  assert.equal(out.fuelLogs.length, 1);
  assert.equal(out.fuelLogs[0].proteinGrams, 25);
  assert.equal(out.waterLogs[0].glasses, 6);
});

test('migrateBackup drops malformed fuel entries instead of crashing', () => {
  const v4 = {
    version: 4,
    exercises: [],
    sets: [],
    fuelLogs: [{ notes: 'no id, no timestamp — still normalizes' }],
    waterLogs: [{ date: 'not-a-date', glasses: 'six' }],
  };
  const out = migrateBackup(v4);
  assert.equal(out.fuelLogs.length, 1);          // normalized, not dropped
  assert.equal(out.waterLogs[0].glasses, 0);     // garbage clamped
});
