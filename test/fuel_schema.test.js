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

const NEW_LOG = {
  id: 'uuid-1',
  timestamp: '2026-11-05T12:30:00.000Z',
  date: '2026-11-05',
  components: {
    protein: { size: 'palm', count: 1 },
    veg: { size: 'fist', count: 1 },
    carbs: { size: 'cupped', count: 0 },
    fat: { size: 'thumb', count: 1 },
  },
  proteinGrams: 25,
  carbsGrams: 0,
  fatGrams: 10,
  calories: 190,                 // 25 × 4 + 10 × 9
  vegPortions: 1,
  wholeFoodLevel: 'whole',
  isWholeFood: true,
  handPortions: { palms: 1, fists: 1, cupped: 0, thumbs: 1 },
  notes: 'post-workout lunch',
};

const LEGACY_LOG = {
  id: 'uuid-legacy',
  timestamp: '2026-11-04T12:30:00.000Z',
  date: '2026-11-04',
  proteinGrams: 30,
  calories: 400,
  isWholeFood: false,
  handPortions: { palms: 1, fists: 1, cupped: 0, thumbs: 1 },
  notes: 'old shape',
};

test('normalizeFuelLog passes a valid new-shape log through unchanged', () => {
  const out = normalizeFuelLog(NEW_LOG);
  assert.deepEqual(out, NEW_LOG);
});

test('normalizeFuelLog fills defaults for a sparse record', () => {
  const out = normalizeFuelLog({});
  assert.equal(typeof out.id, 'string');
  assert.ok(out.id.length > 0);
  assert.match(out.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.proteinGrams, 0);
  assert.equal(out.carbsGrams, 0);
  assert.equal(out.fatGrams, 0);
  assert.equal(out.calories, 0);
  assert.equal(out.vegPortions, 0);
  assert.equal(out.isWholeFood, true);
  assert.equal(out.wholeFoodLevel, 'whole');
  assert.deepEqual(out.components, {
    protein: { size: 'palm', count: 0 },
    veg: { size: 'fist', count: 0 },
    carbs: { size: 'cupped', count: 0 },
    fat: { size: 'thumb', count: 0 },
  });
  assert.deepEqual(out.handPortions, { palms: 0, fists: 0, cupped: 0, thumbs: 0 });
  assert.equal(out.notes, '');
});

test('normalizeFuelLog migrates legacy handPortions into components', () => {
  const out = normalizeFuelLog(LEGACY_LOG);
  assert.deepEqual(out.components, {
    protein: { size: 'palm', count: 1 },
    veg: { size: 'fist', count: 1 },
    carbs: { size: 'cupped', count: 0 },
    fat: { size: 'thumb', count: 1 },
  });
  assert.deepEqual(out.handPortions, { palms: 1, fists: 1, cupped: 0, thumbs: 1 });
  assert.equal(out.proteinGrams, 30);       // legacy macro survives
  assert.equal(out.calories, 400);          // legacy macro survives
  assert.equal(out.carbsGrams, 0);
  assert.equal(out.fatGrams, 10);
  assert.equal(out.vegPortions, 1);
  assert.equal(out.wholeFoodLevel, 'processed');
  assert.equal(out.isWholeFood, false);
});

test('normalizeFuelLog maps wholeFoodLevel and derives the legacy boolean', () => {
  const mixed = normalizeFuelLog({ wholeFoodLevel: 'mixed', isWholeFood: true });
  assert.equal(mixed.wholeFoodLevel, 'mixed');
  assert.equal(mixed.isWholeFood, false);

  const legacyFalse = normalizeFuelLog({ isWholeFood: false });
  assert.equal(legacyFalse.wholeFoodLevel, 'processed');
  assert.equal(legacyFalse.isWholeFood, false);

  const legacyTrue = normalizeFuelLog({ isWholeFood: true });
  assert.equal(legacyTrue.wholeFoodLevel, 'whole');
  assert.equal(legacyTrue.isWholeFood, true);
});

test('normalizeFuelLog derives legacy macros when they are missing or invalid', () => {
  const out = normalizeFuelLog({
    handPortions: { palms: 2.9, fists: -1, cupped: 0, thumbs: 0 },
    proteinGrams: -5,
    calories: 'lots',
  });
  assert.equal(out.components.protein.count, 2);
  assert.equal(out.components.veg.count, 0);
  assert.equal(out.proteinGrams, 50);
  assert.equal(out.calories, 200);
});

test('normalizeFuelLog always recomputes macros for the new component shape', () => {
  const out = normalizeFuelLog({
    components: {
      protein: { size: 'fist', count: 1 },
      veg: { size: 'thumb', count: 1 },
      carbs: { size: 'fist', count: 1 },
      fat: { size: 'palm', count: 1 },
    },
    proteinGrams: 999,
    carbsGrams: 999,
    fatGrams: 999,
    calories: 9999,
  });
  assert.equal(out.proteinGrams, 40);
  assert.equal(out.carbsGrams, 30);
  assert.equal(out.fatGrams, 20);
  assert.equal(out.vegPortions, 0.25);
  assert.equal(out.calories, 460);
});

test('normalizeFuelLog derives the date from the timestamp when missing', () => {
  const ts = '2026-03-15T22:00:00.000Z';
  const out = normalizeFuelLog({ timestamp: ts });
  assert.match(out.date, /^2026-03-1[456]$/);          // local day of a parseable ts
  assert.equal(out.timestamp, new Date(ts).toISOString());
});

test('normalizeHandPortions drops unknown keys and keeps known ones', () => {
  const out = normalizeHandPortions({ palms: 3, bogus: 9, thumbs: '2' });
  assert.deepEqual(out, { palms: 3, fists: 0, cupped: 0, thumbs: 2 });
});

test('validateFuelLog accepts a valid log', () => {
  assert.equal(validateFuelLog(normalizeFuelLog(NEW_LOG)).ok, true);
  assert.equal(validateFuelLog(normalizeFuelLog(LEGACY_LOG)).ok, true);
});

test('validateFuelLog enforces bounds and component shape', () => {
  const base = () => normalizeFuelLog(NEW_LOG);

  assert.equal(validateFuelLog({ ...base(), proteinGrams: 1001 }).ok, false);
  assert.equal(validateFuelLog({ ...base(), carbsGrams: 1001 }).ok, false);
  assert.equal(validateFuelLog({ ...base(), fatGrams: -1 }).ok, false);
  assert.equal(validateFuelLog({ ...base(), calories: -1 }).ok, false);
  assert.equal(validateFuelLog({ ...base(), vegPortions: 201 }).ok, false);
  assert.equal(validateFuelLog({ ...base(), isWholeFood: 'yes' }).ok, false);
  assert.equal(validateFuelLog({ ...base(), wholeFoodLevel: 'sometimes' }).ok, false);
  assert.equal(validateFuelLog({ ...base(), date: '05/11/2026' }).ok, false);

  const tooMany = {
    ...base(),
    components: { ...base().components, protein: { size: 'palm', count: 51 } },
  };
  assert.equal(validateFuelLog(tooMany).ok, false);

  const fractional = {
    ...base(),
    components: { ...base().components, protein: { size: 'palm', count: 1.5 } },
  };
  assert.equal(validateFuelLog(fractional).ok, false);

  const badSize = {
    ...base(),
    components: { ...base().components, protein: { size: 'handful', count: 1 } },
  };
  assert.equal(validateFuelLog(badSize).ok, false);

  const missing = { ...base(), components: { protein: { size: 'palm', count: 1 } } };
  assert.equal(validateFuelLog(missing).ok, false);

  const good = normalizeFuelLog({
    ...base(),
    components: {
      protein: { size: 'palm', count: 0 },
      veg: { size: 'fist', count: 0 },
      carbs: { size: 'cupped', count: 0 },
      fat: { size: 'thumb', count: 0 },
    },
  });
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

test('migrateBackup migrates v4 fuel handPortions into v5 components', () => {
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
  assert.deepEqual(out.fuelLogs[0].components, {
    protein: { size: 'palm', count: 1 },
    veg: { size: 'fist', count: 0 },
    carbs: { size: 'cupped', count: 0 },
    fat: { size: 'thumb', count: 0 },
  });
  assert.equal(out.fuelLogs[0].carbsGrams, 0);
  assert.equal(out.fuelLogs[0].fatGrams, 0);
  assert.equal(out.fuelLogs[0].wholeFoodLevel, 'processed');
  assert.equal(out.waterLogs[0].glasses, 6);
});

test('migrateBackup keeps v5 component logs intact', () => {
  const v5 = {
    version: 5,
    exercises: [],
    sets: [],
    fuelLogs: [NEW_LOG],
    waterLogs: [],
  };
  const out = migrateBackup(v5);
  assert.equal(out.version, BACKUP_VERSION);
  assert.deepEqual(out.fuelLogs[0].components, NEW_LOG.components);
  assert.equal(out.fuelLogs[0].proteinGrams, 25);
  assert.equal(out.fuelLogs[0].fatGrams, 10);
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
