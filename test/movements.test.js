import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVEMENTS, MOVEMENT_BY_ID, FOCUS, LEVELS, EQUIPMENT, IMPACT, TIME_OPTIONS,
  focusById, levelById, equipmentById, impactById,
  variantName, targetFor, unitFor,
  eligibleMovements, buildSession, describeSession, roundPayloads,
  DAILY_CYCLE, DAILY_ANCHOR, dailyOrdinal, dailyKind, dailyPlan,
} from '../js/movements.js';

const PATTERNS = ['push', 'pull', 'squat', 'hinge', 'core', 'cardio'];
const LEVEL_IDS = LEVELS.map(l => l.id);
const EQUIPMENT_IDS = EQUIPMENT.map(e => e.id);

test('movement library is well-formed and uniquely identified', () => {
  const ids = new Set(MOVEMENTS.map(m => m.id));
  assert.equal(ids.size, MOVEMENTS.length);

  for (const m of MOVEMENTS) {
    assert.ok(m.name, `${m.id} needs a name`);
    assert.ok(PATTERNS.includes(m.pattern), `${m.id} has unknown pattern ${m.pattern}`);
    assert.ok(['reps', 'timed'].includes(m.kind), `${m.id} has unknown kind ${m.kind}`);
    assert.ok(EQUIPMENT_IDS.includes(m.equipment), `${m.id} has unknown equipment ${m.equipment}`);
    assert.ok(m.cue && m.cue.length > 10, `${m.id} needs a usable cue`);
    assert.equal(MOVEMENT_BY_ID[m.id], m);

    for (const level of LEVEL_IDS) {
      assert.ok(targetFor(m, level) > 0, `${m.id} needs a ${level} target`);
    }
  }
});

test('option lists resolve by id with sane fallbacks', () => {
  assert.equal(focusById('upper').label, 'Upper body');
  assert.equal(levelById('new').label, 'New to this');
  assert.equal(equipmentById('band').label, 'Bands');
  assert.equal(impactById('normal').label, 'Jumping ok');

  // Unknown ids fall back rather than throwing.
  assert.equal(focusById('nope').id, 'full');
  assert.equal(levelById('nope').id, 'returning');
  assert.equal(equipmentById('nope').id, 'none');
  assert.equal(impactById('nope').id, 'low');
});

test('targets scale up with level and variants change the name', () => {
  for (const m of MOVEMENTS) {
    const targets = LEVEL_IDS.map(l => targetFor(m, l));
    for (let i = 1; i < targets.length; i++) {
      assert.ok(targets[i] >= targets[i - 1], `${m.id} targets should not fall as level rises`);
    }
  }

  const pushup = MOVEMENT_BY_ID.pushup;
  assert.equal(variantName(pushup, 'new'), 'Incline push-up');
  assert.equal(variantName(pushup, 'regular'), 'Push-up');

  // A movement without variants keeps its own name at every level.
  assert.equal(variantName(MOVEMENT_BY_ID.plank, 'new'), 'Plank');
  assert.equal(unitFor(MOVEMENT_BY_ID.plank), 'sec');
  assert.equal(unitFor(MOVEMENT_BY_ID.pushup), 'reps');
});

test('equipment and impact filters remove what they say they remove', () => {
  const bodyweight = eligibleMovements({ equipment: 'none', impact: 'normal' });
  assert.ok(bodyweight.length > 0);
  assert.ok(bodyweight.every(m => m.equipment === 'none'));

  const lowImpact = eligibleMovements({ equipment: 'none', impact: 'low' });
  assert.ok(lowImpact.length > 0);
  assert.ok(lowImpact.every(m => !m.highImpact));

  const withDb = eligibleMovements({ equipment: 'dumbbell', impact: 'normal' });
  assert.ok(withDb.some(m => m.equipment === 'dumbbell'));
  assert.ok(withDb.every(m => m.equipment === 'none' || m.equipment === 'dumbbell'));
});

test('focus narrows the patterns on offer, keeping core support work', () => {
  const upper = eligibleMovements({ focus: 'upper', impact: 'normal' });
  assert.ok(upper.every(m => ['push', 'pull', 'core'].includes(m.pattern)));

  const cardio = eligibleMovements({ focus: 'cardio', impact: 'normal' });
  assert.ok(cardio.every(m => ['cardio', 'squat', 'core'].includes(m.pattern)));
});

test('the same seed always builds the same session', () => {
  const opts = { minutes: 10, focus: 'full', equipment: 'none', impact: 'low', level: 'returning', seed: 424242 };
  const a = buildSession(opts);
  const b = buildSession(opts);
  assert.deepEqual(a, b);
  assert.equal(a.seed, 424242);

  const c = buildSession({ ...opts, seed: 9 });
  assert.notDeepEqual(a.items, c.items === a.items ? [] : c.items);
});

test('session shape follows the chosen length', () => {
  assert.deepEqual(TIME_OPTIONS, [5, 10, 15, 20, 30]);

  for (const minutes of TIME_OPTIONS) {
    const s = buildSession({ minutes, equipment: 'none', impact: 'normal', seed: 7 });
    assert.ok(s, `${minutes} min should build a session`);
    assert.equal(s.minutes, minutes);
    assert.ok(s.rounds >= 2, 'always at least two rounds');
    assert.ok(s.items.length >= 3, 'always at least three movements');
    assert.ok(s.estimatedMin >= 1);
    assert.ok(s.items.length <= s.rounds * s.items.length);
  }

  // Unknown lengths fall back to the 10-minute shape.
  const fallback = buildSession({ minutes: 11, seed: 7 });
  const ten = buildSession({ minutes: 10, seed: 7 });
  assert.equal(fallback.rounds, ten.rounds);
  assert.equal(fallback.items.length, ten.items.length);
});

test('a no-equipment, low-impact session asks for nothing but floor space', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = buildSession({ minutes: 15, focus: 'full', equipment: 'none', impact: 'low', level: 'new', seed });
    for (const item of s.items) {
      const movement = MOVEMENT_BY_ID[item.movementId];
      assert.equal(movement.equipment, 'none');
      assert.ok(!movement.highImpact);
      assert.ok(item.target > 0);
      assert.ok(['reps', 'sec'].includes(item.unit));
      assert.equal(item.name, variantName(movement, 'new'));
    }
  }
});

test('no focus is ever empty and every session has rounds of work', () => {
  for (const { id: focus } of FOCUS) {
    for (const equipment of ['none', 'dumbbell', 'band']) {
      const s = buildSession({ minutes: 10, focus, equipment, impact: 'normal', level: 'regular', seed: 11 });
      assert.ok(s, `${focus}/${equipment} should build`);
      assert.ok(s.items.length >= 1);
      assert.ok(s.rounds >= 2);
      assert.equal(s.restSec > 0, true);

      // A session never repeats the same movement within a round.
      const ids = s.items.map(i => i.movementId);
      assert.equal(new Set(ids).size, ids.length, `${focus}/${equipment} repeats a movement`);
    }
  }
});

test('level scales the prescription, not the session shape', () => {
  const base = { minutes: 10, focus: 'full', equipment: 'none', impact: 'low', seed: 99 };
  const beginner = buildSession({ ...base, level: 'new' });
  const regular = buildSession({ ...base, level: 'regular' });

  assert.deepEqual(beginner.items.map(i => i.movementId), regular.items.map(i => i.movementId));
  for (let i = 0; i < beginner.items.length; i++) {
    assert.ok(regular.items[i].target >= beginner.items[i].target);
  }
  assert.ok(beginner.name);

  // Names are the variant for that level, so history stays honest per variant.
  assert.ok(beginner.items.every(i => i.name));
});

test('describeSession reads as one line', () => {
  assert.equal(describeSession(null), 'No session');
  const s = buildSession({ minutes: 10, seed: 3 });
  assert.match(describeSession(s), /^\d+ rounds · \d+ movements · ~\d+ min$/);
});

test('roundPayloads builds one valid set per movement, tagged as quick', () => {
  const session = buildSession({ minutes: 10, seed: 5, level: 'returning' });
  const exerciseIds = {};
  session.items.forEach((item, i) => { exerciseIds[item.name] = 100 + i; });

  const payloads = roundPayloads(session, 2, exerciseIds, { date: '2026-11-07', groupId: 'g1' });
  assert.equal(payloads.length, session.items.length);

  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    const item = session.items[i];
    assert.equal(p.exerciseId, 100 + i);
    assert.equal(p.date, '2026-11-07');
    assert.equal(p.groupId, 'g1');
    assert.equal(p.round, 2);
    assert.equal(p.source, 'quick');
    assert.equal(p.unitLabel, item.unit);
    assert.equal(p.restSec, session.restSec);
    if (item.kind === 'reps') {
      assert.equal(p.type, 'output');
      assert.equal(p.output, item.target);
      assert.equal(p.duration, undefined);
    } else {
      assert.equal(p.type, 'timed');
      assert.equal(p.duration, item.target);
      assert.equal(p.output, undefined);
    }
  }
});

test('roundPayloads skips unknown exercises and rejects bad rounds', () => {
  const session = buildSession({ minutes: 5, seed: 2 });
  const ids = { [session.items[0].name]: 1 };

  const partial = roundPayloads(session, 1, ids, { date: '2026-11-07', groupId: 'g' });
  assert.equal(partial.length, 1);
  assert.equal(partial[0].exerciseId, 1);

  assert.deepEqual(roundPayloads(session, 0, ids, { date: '2026-11-07', groupId: 'g' }), []);
  assert.deepEqual(roundPayloads(null, 1, ids, { date: '2026-11-07', groupId: 'g' }), []);
});

test('generation is offline and free of clock reads', () => {
  // Same seed, different "now" cannot matter: nothing in the module takes a date.
  const a = buildSession({ minutes: 10, seed: 123 });
  const b = buildSession({ minutes: 10, seed: 123 });
  assert.equal(a.estimatedMin, b.estimatedMin);
  assert.equal(describeSession(a), describeSession(b));
});

// ── Daily session ──────────────────────────────────────────
test('the daily cycle is anchored and advances one kind per day', () => {
  assert.deepEqual(DAILY_CYCLE, ['full', 'cardio', 'core', 'mobility', 'rest']);
  assert.equal(dailyOrdinal(DAILY_ANCHOR), 0);
  assert.equal(dailyOrdinal('2026-01-02'), 1);

  const kinds = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']
    .map(dailyKind);
  assert.deepEqual(kinds, ['full', 'cardio', 'core', 'mobility', 'rest']);

  // Five days later the cycle repeats, and the checkpoint date lands on full.
  assert.equal(dailyKind('2026-01-06'), 'full');
  assert.equal(dailyKind('2026-11-07'), 'full');

  // Consecutive days never repeat the kind.
  let previous = dailyKind('2026-03-01');
  for (let day = 2; day <= 20; day++) {
    const date = `2026-03-${String(day).padStart(2, '0')}`;
    const kind = dailyKind(date);
    assert.notEqual(kind, previous, `${date} repeated ${kind}`);
    previous = kind;
  }
});

test('the daily plan is deterministic for a date and level', () => {
  const a = dailyPlan('2026-11-07', { level: 'returning' });
  const b = dailyPlan('2026-11-07', { level: 'returning' });
  assert.deepEqual(a, b);
  assert.equal(a.kind, 'full');
  assert.equal(a.date, '2026-11-07');
  assert.equal(a.session.name, "Today's full body");
  assert.ok(a.session.items.length >= 3);

  // A different date is a different session even within the same kind.
  const other = dailyPlan('2026-11-02', { level: 'returning' });
  assert.equal(other.kind, 'full');
  assert.notEqual(other.session.seed, a.session.seed);
});

test('level scales a daily session without changing its shape', () => {
  const beginner = dailyPlan('2026-11-07', { level: 'new' });
  const regular = dailyPlan('2026-11-07', { level: 'regular' });

  assert.equal(regular.kind, beginner.kind);
  assert.deepEqual(
    regular.session.items.map(i => i.movementId),
    beginner.session.items.map(i => i.movementId),
  );
  regular.session.items.forEach((item, i) => {
    assert.ok(item.target >= beginner.session.items[i].target);
  });
});

test('daily sessions are bodyweight-only and low impact', () => {
  for (const date of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-12']) {
    const plan = dailyPlan(date);
    for (const item of plan.session.items) {
      const movement = MOVEMENT_BY_ID[item.movementId];
      assert.equal(movement.equipment, 'none');
      assert.ok(!movement.highImpact);
      assert.ok(item.target > 0);
    }
  }
});

test('mobility days point at an existing hold routine', () => {
  const upper = dailyPlan('2026-01-04');
  assert.equal(upper.kind, 'mobility');
  assert.equal(upper.session, null);
  assert.equal(upper.routineId, 'upper');
  assert.equal(upper.routineName, 'Upper body');

  const lower = dailyPlan('2026-01-09');
  assert.equal(lower.kind, 'mobility');
  assert.equal(lower.routineId, 'lower');
  assert.equal(lower.routineName, 'Lower body');
  assert.match(lower.routineHint, /holds/);
});

test('rest days are first class and never carry a session', () => {
  const rest = dailyPlan('2026-01-05');
  assert.equal(rest.kind, 'rest');
  assert.equal(rest.session, null);
  assert.equal(rest.title, 'Rest day');
  assert.match(rest.blurb, /Rest is training, not failure/);
  assert.ok(Array.isArray(rest.recovery));
  assert.equal(rest.recovery.length, 3);
  assert.ok(rest.recovery.some(step => /Sleep/i.test(step)));
});

test('dailyPlan rejects impossible or malformed dates', () => {
  for (const date of ['', 'not-a-date', '2026-13-01', '2026-02-30', '2027-02-29', '2026-1-1']) {
    assert.equal(dailyOrdinal(date), null, `${date} should be invalid`);
    assert.equal(dailyKind(date), null);
    assert.equal(dailyPlan(date), null);
  }

  // Real leap days are valid.
  assert.notEqual(dailyOrdinal('2028-02-29'), null);
  assert.notEqual(dailyPlan('2028-02-29'), null);
});
