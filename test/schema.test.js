import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SET_TYPES,
  METRIC_LABELS,
  BACKUP_VERSION,
  normalizeSet,
  normalizeExercise,
  validateSet,
  migrateBackup,
} from '../js/schema.js';

test('normalizeSet defaults legacy records to strength', () => {
  const s = normalizeSet({ exerciseId: 1, date: '2026-10-15', weight: 135, reps: 5 });
  assert.equal(s.type, 'strength');
  assert.equal(s.notes, '');
  assert.equal(s.weight, 135);
  assert.equal(s.reps, 5);
});

test('normalizeSet keeps a known type and ignores unknown ones', () => {
  assert.equal(normalizeSet({ type: 'timed' }).type, 'timed');
  assert.equal(normalizeSet({ type: 'nonsense' }).type, 'strength');
});

test('normalizeSet preserves existing notes', () => {
  assert.equal(normalizeSet({ notes: 'felt heavy' }).notes, 'felt heavy');
});

test('validateSet accepts a valid strength set', () => {
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', weight: 135, reps: 5 }).ok, true);
});

test('validateSet rejects strength sets without weight or reps', () => {
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', reps: 5 }).ok, false);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', weight: 135, reps: 0 }).ok, false);
});

test('validateSet requires the metric matching the type', () => {
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'timed', duration: 90 }).ok, true);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'timed' }).ok, false);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'distance', distance: 5000 }).ok, true);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'distance' }).ok, false);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'output', output: 30 }).ok, true);
  assert.equal(validateSet({ exerciseId: 1, date: '2026-10-15', type: 'output' }).ok, false);
});

test('validateSet requires an exercise and a date', () => {
  assert.equal(validateSet({ date: '2026-10-15', weight: 135, reps: 5 }).ok, false);
  assert.equal(validateSet({ exerciseId: 1, weight: 135, reps: 5 }).ok, false);
});

test('migrateBackup stamps metrics onto exercises (v3 → v4)', () => {
  const v3 = {
    version: 3,
    exercises: [{ id: 1, name: 'Bench Press' }, { id: 2, name: 'Rowing', metric: 'distance' }],
    sets: [{ id: 1, exerciseId: 2, date: '2026-08-01', distance: 5000, type: 'distance' }],
  };
  const out = migrateBackup(v3);
  assert.equal(out.version, BACKUP_VERSION);
  assert.deepEqual(out.exercises[0].metrics, ['strength']);
  assert.deepEqual(out.exercises[1].metrics, ['distance']);
  assert.equal(out.exercises[1].metric, 'distance');
  assert.equal(out.sets[0].distance, 5000);
});

test('migrateBackup upgrades a v1 backup to the current version', () => {
  const v1 = {
    version: 1,
    exercises: [{ id: 1, name: 'Bench Press' }],
    sets: [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 135, reps: 5 }],
    equipment: { barWeight: 45, plates: [] },
  };
  const out = migrateBackup(v1);
  assert.equal(out.version, BACKUP_VERSION);
  assert.equal(out.sets[0].type, 'strength');
  assert.equal(out.sets[0].weight, 135);
  assert.equal(out.exercises.length, 1);
});

test('migrateBackup treats a missing version as v1', () => {
  const out = migrateBackup({
    exercises: [],
    sets: [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 100, reps: 1 }],
  });
  assert.equal(out.version, BACKUP_VERSION);
  assert.equal(out.sets[0].type, 'strength');
});

test('migrateBackup rejects a backup from a newer app version', () => {
  assert.throws(() => migrateBackup({ version: 99, exercises: [], sets: [] }), /newer version/);
});

test('migrateBackup rejects malformed data', () => {
  assert.throws(() => migrateBackup(null));
  assert.throws(() => migrateBackup([]));
  assert.throws(() => migrateBackup({ version: 1 }));
});

test('SET_TYPES covers the four planned metric families', () => {
  assert.deepEqual(SET_TYPES, ['strength', 'timed', 'distance', 'output']);
});

test('every metric has a human label', () => {
  for (const type of SET_TYPES) {
    assert.equal(typeof METRIC_LABELS[type], 'string');
    assert.ok(METRIC_LABELS[type].length > 0);
  }
});

test('normalizeExercise defaults legacy exercises to strength', () => {
  assert.equal(normalizeExercise({ id: 1, name: 'Bench Press' }).metric, 'strength');
  assert.equal(normalizeExercise({ id: 2, name: 'Rowing' }).name, 'Rowing');
});

test('normalizeExercise keeps a known metric and rejects unknown ones', () => {
  assert.equal(normalizeExercise({ name: 'Plank', metric: 'timed' }).metric, 'timed');
  assert.equal(normalizeExercise({ name: 'Plank', metric: 'bogus' }).metric, 'strength');
});

test('normalizeExercise derives metrics from the legacy singular metric', () => {
  assert.deepEqual(normalizeExercise({ id: 1, name: 'Bench Press' }).metrics, ['strength']);
  assert.deepEqual(normalizeExercise({ name: 'Rowing', metric: 'distance' }).metrics, ['distance']);
});

test('normalizeExercise keeps a declared multi-metric list, preserving order and dropping dupes/unknowns', () => {
  const ex = normalizeExercise({ name: 'Rowing', metrics: ['distance', 'timed', 'distance', 'bogus'] });
  assert.deepEqual(ex.metrics, ['distance', 'timed']);
  assert.equal(ex.metric, 'distance');   // primary metric = first declared
});

test('normalizeExercise falls back to strength for empty or useless metrics lists', () => {
  assert.deepEqual(normalizeExercise({ name: 'X', metrics: [] }).metrics, ['strength']);
  assert.deepEqual(normalizeExercise({ name: 'X', metrics: ['bogus'] }).metrics, ['strength']);
});

test('validateSet validates every declared metric on composite sets', () => {
  const complete = { exerciseId: 1, date: '2026-11-05', type: 'distance', distance: 2000, duration: 420 };
  assert.equal(validateSet(complete, ['distance', 'timed']).ok, true);

  const missingTime = { exerciseId: 1, date: '2026-11-05', type: 'distance', distance: 2000 };
  const r1 = validateSet(missingTime, ['distance', 'timed']);
  assert.equal(r1.ok, false);
  assert.match(r1.error, /duration/i);

  const missingWeight = { exerciseId: 1, date: '2026-11-05', distance: 2000, duration: 420 };
  const r2 = validateSet(missingWeight, ['distance', 'timed', 'strength']);
  assert.equal(r2.ok, false);
  assert.match(r2.error, /weight/i);

  // Order of declaration does not matter for what is required
  assert.equal(validateSet(complete, ['timed', 'distance']).ok, true);
});

test('validateSet without metrics validates only the type (legacy call sites)', () => {
  const partial = { exerciseId: 1, date: '2026-11-05', type: 'distance', distance: 2000 };
  assert.equal(validateSet(partial).ok, true);
});

test('migrateBackup stamps a metric onto exercises (v2 → v3)', () => {
  const v2 = {
    version: 2,
    exercises: [{ id: 1, name: 'Bench Press' }, { id: 2, name: 'Rowing', metric: 'distance' }],
    sets: [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 135, reps: 5, type: 'strength' }],
  };
  const out = migrateBackup(v2);
  assert.equal(out.version, BACKUP_VERSION);
  assert.equal(out.exercises[0].metric, 'strength');
  assert.equal(out.exercises[1].metric, 'distance');
  assert.equal(out.sets[0].type, 'strength');
});
