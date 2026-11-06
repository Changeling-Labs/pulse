import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNC_DOMAINS, stableStringify, updatedAtMs, isoFromMs, pickLWW,
  payloadFor, externalIdFor, rowFor, tombstoneFor, validateRow,
  shouldApplyRemote, resolveExerciseRow, isDomain,
} from '../js/sync-core.js';

const uuidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uuidB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const nowIso = '2026-11-05T12:00:00.000Z';
const nowMs  = Date.parse(nowIso);
const laterIso = '2026-11-06T12:00:00.000Z';

test('domains are exactly the six we sync', () => {
  assert.deepEqual(SYNC_DOMAINS, ['equipment', 'exercises', 'fuel_logs', 'water_logs', 'recovery_logs', 'sets']);
  assert.ok(isDomain('sets'));
  assert.ok(!isDomain('preferences'));
});

test('stableStringify is key-order independent', () => {
  const a = { b: 2, a: 1, c: { z: 9, y: [3, 1, 2] } };
  const b = { c: { y: [3, 1, 2], z: 9 }, a: 1, b: 2 };
  assert.equal(stableStringify(a), stableStringify(b));
  assert.equal(stableStringify({ m: 1 }), '{"m":1}');
});

test('updatedAtMs prefers updatedAt, falls back to timestamp then date', () => {
  assert.equal(updatedAtMs({ updatedAt: laterIso }), Date.parse(laterIso));
  assert.equal(updatedAtMs({ timestamp: nowIso }), nowMs);
  assert.equal(updatedAtMs({ date: '2026-11-05' }), Date.parse('2026-11-05T00:00:00Z'));
  assert.equal(updatedAtMs({}), 0);
  assert.equal(updatedAtMs({ updatedAt: 'not-a-date' }), 0);
});

test('LWW picks newer remote row', () => {
  const local = { updatedAt: nowIso };
  assert.equal(pickLWW(local, { payload: {}, updated_at: laterIso }), 'remote');
});

test('LWW keeps newer local record', () => {
  const local = { updatedAt: laterIso };
  assert.equal(pickLWW(local, { payload: {}, updated_at: nowIso }), 'local');
});

test('LWW tie is broken deterministically by payload bytes (smaller canonical payload wins)', () => {
  const a = { updatedAt: nowIso, notes: 'alpha' };
  const b = { updatedAt: nowIso, notes: 'beta' };
  assert.equal(pickLWW(a, { payload: b, updated_at: nowIso }), 'local');  // alpha < beta → keep local a
  assert.equal(pickLWW(b, { payload: a, updated_at: nowIso }), 'remote'); // same winner from the other side
  assert.equal(pickLWW(a, { payload: a, updated_at: nowIso }), 'equal');
});

test('LWW: both devices converge to identical winner', () => {
  const rec1 = { updatedAt: nowIso, name: 'x', round: 2 };
  const rec2 = { updatedAt: nowIso, name: 'x', round: 3 };
  const from1 = pickLWW(rec1, { payload: rec2, updated_at: nowIso });
  const from2 = pickLWW(rec2, { payload: rec1, updated_at: nowIso });
  assert.equal(from1, 'local');   // device holding rec1 keeps it
  assert.equal(from2, 'remote');  // device holding rec2 takes rec1 — same winner both ways
});

test('LWW: deleted_at is honoured as an update clock', () => {
  const local = { updatedAt: nowIso };
  const remoteDelete = { payload: {}, updated_at: laterIso, deleted_at: laterIso };
  assert.equal(pickLWW(local, remoteDelete), 'remote');
});

test('rowFor encodes record timestamp, never push time, and strips device ids', () => {
  const exercise = { id: 7, name: 'Back Squat', syncId: uuidA, metrics: ['strength'], metric: 'strength', updatedAt: nowIso };
  const row = rowFor('exercises', exercise, new Map());
  assert.equal(row.external_id, uuidA);
  assert.equal(row.updated_at, nowIso);
  assert.equal(row.deleted_at, null);
  assert.equal('id' in row.payload, false);
  assert.equal('syncId' in row.payload, false);
  assert.equal(row.payload.name, 'Back Squat');
});

test('rowFor for sets rebases the exercise reference to the sync id', () => {
  const maps = new Map([[42, { syncId: uuidA, name: 'Back Squat' }]]);
  const set = { id: 1001, exerciseId: 42, type: 'strength', weight: 225, reps: 5, date: '2026-11-05', syncId: uuidB, updatedAt: nowIso };
  const row = rowFor('sets', set, maps);
  assert.equal(row.external_id, uuidB);
  assert.equal(row.payload.exerciseSyncId, uuidA);
  assert.equal(row.payload.exerciseName, 'Back Squat');
  assert.equal(row.payload.exerciseId, undefined);
});

test('fuel_logs keep the uuid id; water_logs key by date', () => {
  const fuel = { id: uuidA, timestamp: nowIso, date: '2026-11-05', proteinGrams: 30, calories: 400, isWholeFood: true, handPortions: { palms: 1, fists: 0, cupped: 0, thumbs: 0 }, notes: '' };
  const row = rowFor('fuel_logs', fuel, new Map());
  assert.equal(row.external_id, uuidA);
  assert.equal(row.payload.proteinGrams, 30);

  const water = { date: '2026-11-05', glasses: 8, updatedAt: nowIso };
  const wRow = rowFor('water_logs', water, new Map());
  assert.equal(wRow.external_id, '2026-11-05');
  assert.equal(wRow.payload.glasses, 8);

  const recovery = { date: '2026-11-05', sleepHours: 7.5, soreness: 3, restingHr: 56, note: '', updatedAt: nowIso };
  const rRow = rowFor('recovery_logs', recovery, new Map());
  assert.equal(rRow.external_id, '2026-11-05');
  assert.equal(rRow.payload.sleepHours, 7.5);
  assert.equal(rRow.payload.soreness, 3);
});

test('tombstones carry deleted_at and empty payload', () => {
  const t = tombstoneFor('sets', uuidA, nowIso);
  assert.equal(t.deleted_at, nowIso);
  assert.equal(t.payload && Object.keys(t.payload).length, 0);
});

test('validateRow accepts good rows and rejects garbage', () => {
  const good = { domain: 'sets', external_id: uuidA, payload: { weight: 1 }, updated_at: nowIso, deleted_at: null };
  assert.deepEqual(validateRow(good), { ...good, updated_at: isoFromMs(nowMs), deleted_at: null });
  assert.equal(validateRow({ ...good, domain: 'weather' }), null);
  assert.equal(validateRow({ ...good, payload: 'nope' }), null);
  assert.equal(validateRow({ ...good, external_id: '' }), null);
  assert.equal(validateRow({ ...good, updated_at: 'garbage' }), null);
});

test('dirty keys always win over remote rows (local intent beats clock)', () => {
  const dirty = new Set(['sets:' + uuidA]);
  assert.equal(shouldApplyRemote('sets', uuidA, dirty), false);
  assert.equal(shouldApplyRemote('sets', uuidB, dirty), true);
});

test('resolveExerciseRow prefers syncId, then name adoption, then insert', () => {
  const local = [
    { id: 1, name: 'Back Squat', syncId: uuidA },
    { id: 2, name: 'Bench Press', syncId: uuidB },
  ];
  const bySync = resolveExerciseRow({ external_id: uuidA, payload: { name: 'Renamed' } }, local);
  assert.deepEqual(bySync, { action: 'apply', localId: 1 });
  const byName = resolveExerciseRow({ external_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', payload: { name: 'Bench Press' } }, local);
  assert.deepEqual(byName, { action: 'adopt', localId: 2 });
  const insert = resolveExerciseRow({ external_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', payload: { name: 'Overhead Press' } }, local);
  assert.deepEqual(insert, { action: 'insert' });
});
