import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOALS, GOAL_BY_ID, DEFAULT_GOAL, goalById, dayDiff, patternGaps,
  recoverySignal, chooseFocus, adaptiveDailyPlan,
} from '../js/adaptive.js';

const DATE = '2026-11-07';

const EXERCISES = [
  { id: 1, name: 'Back Squat', pattern: 'squat' },
  { id: 2, name: 'Bench Press', pattern: 'push' },
  { id: 3, name: 'Barbell Row', pattern: 'pull' },
  { id: 4, name: 'Plank', pattern: 'core' },
  { id: 5, name: 'March in place', pattern: 'cardio' },
];

function set(exerciseId, date) {
  return { exerciseId, date, type: 'strength', weight: 100, reps: 5 };
}

// A normal week: everything trained two days ago except one deliberately
// stale pattern, so the gap calculation has a clear winner.
function week({ pullDaysAgo = 20, cardioDaysAgo = 2 } = {}) {
  const recent = '2026-11-05';
  const stale = '2026-10-18';
  return [
    set(1, recent),                 // squat
    set(2, recent),                 // push
    set(3, pullDaysAgo === 20 ? stale : recent), // pull
    set(4, recent),                 // core
    { exerciseId: 99, date: recent, type: 'cardio' }, // no exercise → ignored
    set(5, cardioDaysAgo === 20 ? stale : recent), // cardio
  ];
}

test('goal profiles are well-formed and default to getting moving', () => {
  assert.equal(GOALS.length, 6);
  assert.equal(new Set(GOALS.map(goal => goal.id)).size, GOALS.length);
  assert.equal(DEFAULT_GOAL, 'move');
  assert.equal(goalById('nope').id, 'move');
  assert.equal(GOAL_BY_ID.heart.label, 'Heart health');

  for (const goal of GOALS) {
    assert.ok(goal.label);
    assert.ok(goal.hint);
    for (const focus of ['full', 'upper', 'lower', 'core', 'cardio', 'mobility', 'rest']) {
      assert.ok(Number.isFinite(goal.weights[focus]), `${goal.id} needs a ${focus} weight`);
    }
  }
});

test('dayDiff is pure calendar arithmetic', () => {
  assert.equal(dayDiff('2026-11-07', '2026-11-10'), 3);
  assert.equal(dayDiff('2026-11-10', '2026-11-07'), -3);
  assert.equal(dayDiff('2026-11-07', '2026-11-07'), 0);
  assert.equal(dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(dayDiff('2028-02-28', '2028-03-01'), 2);
  assert.equal(dayDiff('bad', '2026-11-07'), null);
  assert.equal(dayDiff('2026-11-07', null), null);
});

test('pattern gaps use prior days only and ignore unknown exercises', () => {
  const sets = [
    set(1, '2026-11-01'),                 // squat, 6 days ago
    set(2, '2026-11-05'),                 // push, 2 days ago
    set(3, DATE),                         // pull, today → excluded
    { exerciseId: 99, date: '2026-11-01' }, // unknown → ignored
  ];
  const gaps = patternGaps(sets, EXERCISES, DATE);
  assert.equal(gaps.squat, 6);
  assert.equal(gaps.push, 2);
  assert.equal(gaps.pull, null);
  assert.equal(gaps.core, null);
  assert.equal(gaps.cardio, null);
  assert.equal(gaps.mobility, null);
  assert.equal(Object.keys(gaps).length, 8);
});

test('a pattern gaps object can fall back to an inferred exercise pattern', () => {
  const gaps = patternGaps(
    [set(7, '2026-11-04')],
    [{ id: 7, name: 'Barbell Row' }],
    DATE,
  );
  assert.equal(gaps.pull, 3);
});

test('no history keeps the deterministic daily plan and says why', () => {
  const plan = adaptiveDailyPlan({ date: DATE, sets: [], exercises: EXERCISES });
  assert.equal(plan.kind, 'full');
  assert.equal(plan.lighter, false);
  assert.match(plan.reason, /balanced start/i);
  assert.ok(plan.session);

  // Sets logged today do not count as prior history either.
  const todayOnly = adaptiveDailyPlan({ date: DATE, sets: [set(1, DATE)], exercises: EXERCISES });
  assert.match(todayOnly.reason, /balanced start/i);
});

test('a strength goal fills the largest pattern gap', () => {
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets: week({ pullDaysAgo: 20 }),
    exercises: EXERCISES,
  });
  assert.equal(plan.kind, 'full');
  assert.match(plan.reason, /pulled in 20 days/);
  assert.ok(plan.session);
});

test('the default get-moving goal still prefers a balanced session over an unlogged pattern', () => {
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'move',
    sets: week({ pullDaysAgo: 20 }),
    exercises: EXERCISES,
  });
  assert.equal(plan.kind, 'full');
  assert.match(plan.reason, /pulled in 20 days/);
});

test('a heart-health goal can choose cardio when cardio is stale', () => {
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'heart',
    sets: week({ cardioDaysAgo: 20 }),
    exercises: EXERCISES,
  });
  assert.equal(plan.kind, 'cardio');
  assert.match(plan.reason, /cardio/i);
  assert.match(plan.reason, /20 days/);
});

test('a heart-health goal still prefers cardio over an unlogged mobility pattern', () => {
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'heart',
    sets: week(),
    exercises: EXERCISES,
  });
  assert.equal(plan.kind, 'cardio');
});

test('a return-to-activity goal can choose mobility', () => {
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'return',
    sets: week(),
    exercises: EXERCISES,
  });
  assert.equal(plan.kind, 'mobility');
  assert.ok(plan.routineId);
  assert.equal(plan.session, null);
  assert.match(plan.reason, /mobility/i);
});

test('three prior training days become a rest day', () => {
  const sets = [
    set(1, '2026-11-06'),
    set(2, '2026-11-05'),
    set(3, '2026-11-04'),
  ];
  const plan = adaptiveDailyPlan({ date: DATE, sets, exercises: EXERCISES });
  assert.equal(plan.kind, 'rest');
  assert.match(plan.reason, /three days in a row/i);
  assert.ok(Array.isArray(plan.recovery));
});

test('rough recovery swaps in mobility and keeps the usual session as an override', () => {
  const sets = week();
  const recovery = { date: '2026-11-06', soreness: 8, sleepHours: 7 };
  const plan = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets,
    exercises: EXERCISES,
    recovery,
  });

  assert.equal(plan.kind, 'mobility');
  assert.equal(plan.lighter, true);
  assert.ok(plan.usualKind);
  assert.match(plan.reason, /soreness 8\/10/);
  assert.match(plan.reason, /mobility/);

  const usual = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets,
    exercises: EXERCISES,
    recovery,
    override: true,
  });
  assert.equal(usual.kind, plan.usualKind);
  assert.equal(usual.lighter, false);
});

test('short sleep is a recovery cue, and stale or mild check-ins are not', () => {
  const sets = week();
  const short = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets,
    exercises: EXERCISES,
    recovery: { date: '2026-11-06', sleepHours: 5.5, soreness: 4 },
  });
  assert.equal(short.kind, 'mobility');
  assert.match(short.reason, /5\.5h sleep/);

  const stale = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets,
    exercises: EXERCISES,
    recovery: { date: '2026-10-30', soreness: 9, sleepHours: 4 },
  });
  assert.notEqual(stale.kind, 'mobility');

  const mild = adaptiveDailyPlan({
    date: DATE,
    goal: 'strength',
    sets,
    exercises: EXERCISES,
    recovery: { date: '2026-11-06', soreness: 5, sleepHours: 7 },
  });
  assert.notEqual(mild.kind, 'mobility');
});

test('recoverySignal is a plain-language cue with no score', () => {
  assert.equal(recoverySignal(null, DATE), null);
  assert.equal(recoverySignal({ date: '2026-11-06', soreness: 5, sleepHours: 7 }, DATE), null);
  const signal = recoverySignal({ date: '2026-11-06', soreness: 8, sleepHours: 5.5 }, DATE);
  assert.match(signal.reason, /soreness 8\/10 and 5\.5h sleep/);
  assert.doesNotMatch(signal.reason, /score|ready|readiness|diagnos|injur/i);
});

test('choices are deterministic and free of medical claims', () => {
  const args = {
    date: DATE,
    goal: 'recomp',
    sets: week(),
    exercises: EXERCISES,
    recovery: { date: '2026-11-06', soreness: 8, sleepHours: 7 },
  };
  const a = adaptiveDailyPlan(args);
  const b = adaptiveDailyPlan(args);
  assert.deepEqual(a, b);

  const reasons = [
    a.reason,
    adaptiveDailyPlan({ ...args, recovery: null }).reason,
    adaptiveDailyPlan({ date: DATE, sets: [], exercises: EXERCISES }).reason,
    adaptiveDailyPlan({ date: DATE, sets: week({ pullDaysAgo: 20 }), exercises: EXERCISES, goal: 'strength' }).reason,
  ];
  for (const reason of reasons) {
    assert.doesNotMatch(reason, /injur|diagnos|readiness|medical advice|\bAI\b/i);
  }
});

test('chooseFocus respects the three-day rest rule before scoring', () => {
  const sets = [
    set(1, '2026-11-06'),
    set(2, '2026-11-05'),
    set(3, '2026-11-04'),
  ];
  const gaps = patternGaps(sets, EXERCISES, DATE);
  const choice = chooseFocus({ goal: goalById('strength'), gaps, sets, date: DATE });
  assert.equal(choice.focus, 'rest');
});
