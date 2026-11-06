import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mondayOf, setTonnage, weekSeries, eligibleWeeks, pearson, correlationLabel,
  buildInsight, MIN_WEEKS,
} from '../js/insights.js';

const MS_DAY = 86400000;
const fmt = d => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return fmt(new Date(Date.UTC(y, m - 1, d + n, 12)));
};

// ── Weeks ──────────────────────────────────────────────────
test('mondayOf snaps any weekday to the Monday that started it', () => {
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');   // Monday
  assert.equal(mondayOf('2026-11-06'), '2026-11-02');   // Friday
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');   // Sunday
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');   // next Monday
  assert.equal(mondayOf('2026-01-01'), '2025-12-29');   // year boundary
});

test('setTonnage only counts weighted reps', () => {
  assert.equal(setTonnage({ weight: 100, reps: 5 }), 500);
  assert.equal(setTonnage({ weight: 0, reps: 10 }), 0);
  assert.equal(setTonnage({ duration: 60 }), 0);
  assert.equal(setTonnage({ weight: 100, reps: 0 }), 0);
  assert.equal(setTonnage(null), 0);
});

// ── Weekly series ──────────────────────────────────────────
test('weekSeries uses completed weeks only and buckets sets and recovery', () => {
  const sets = [
    { date: '2026-10-27', type: 'strength', weight: 100, reps: 5 },
    { date: '2026-10-27', type: 'strength', weight: 80, reps: 10 },
    { date: '2026-10-28', type: 'timed', duration: 60 },
    { date: '2026-11-02', type: 'strength', weight: 200, reps: 5 },   // current week
  ];
  const recovery = [
    { date: '2026-10-27', sleepHours: 7, soreness: 4, restingHr: 60 },
    { date: '2026-10-29', sleepHours: 8, soreness: 6, restingHr: 58 },
  ];

  const weeks = weekSeries(sets, recovery, 3, '2026-11-06');
  assert.deepEqual(weeks.map(w => w.weekStart), ['2026-10-12', '2026-10-19', '2026-10-26']);

  const last = weeks[2];
  assert.equal(last.weekEnd, '2026-11-01');
  assert.equal(last.sets, 3);
  assert.equal(last.sessions, 2);
  assert.equal(last.tonnage, 1300);
  assert.equal(last.recoveryDays, 2);
  assert.equal(last.sleepAvg, 7.5);
  assert.equal(last.sorenessAvg, 5);
  assert.equal(last.restingHrAvg, 59);

  // The in-progress week (Nov 2) never appears.
  assert.ok(!weeks.some(w => w.weekStart === '2026-11-02'));
});

test('weekSeries leaves a marker null when nobody logged it', () => {
  const recovery = [{ date: '2026-10-27', sleepHours: 7, soreness: null, restingHr: 58 }];
  const week = weekSeries([], recovery, 3, '2026-11-06')[2];
  assert.equal(week.sorenessAvg, null);
  assert.equal(week.recoveryDays, 1);
});

test('eligibleWeeks needs training and at least one check-in', () => {
  const weeks = [
    { sets: 10, recoveryDays: 2 },
    { sets: 0, recoveryDays: 3 },
    { sets: 8, recoveryDays: 0 },
    { sets: 5, recoveryDays: 1 },
  ];
  assert.equal(eligibleWeeks(weeks).length, 2);
});

// ── Correlation ────────────────────────────────────────────
test('pearson is +1, −1 and null for flat or short series', () => {
  assert.equal(pearson([[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]]), 1);
  assert.equal(pearson([[1, 10], [2, 8], [3, 6], [4, 4], [5, 2]]), -1);
  assert.equal(pearson([[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]), null);   // no variance
  assert.equal(pearson([[1, 2], [2, 4], [3, 6], [4, 8]]), null);            // too few pairs
  assert.equal(pearson([[1, 2], [2, null], [3, 6], [4, 8], [5, 10], [6, 12]]), 1);   // gaps are skipped
});

test('correlationLabel buckets strength', () => {
  assert.equal(correlationLabel(0.75), 'strongly');
  assert.equal(correlationLabel(-0.5), 'fairly');
  assert.equal(correlationLabel(0.1), 'barely');
  assert.equal(correlationLabel(null), 'not enough weeks');
});

// ── Insight ────────────────────────────────────────────────
// Six completed weeks whose volume rises linearly, with soreness, sleep and
// resting HR each a linear function of that volume.
function scenario(counts, { endDate = '2026-11-06' } = {}) {
  const sets = [];
  const recovery = [];
  const lastStart = addDays(mondayOf(endDate), -7);

  counts.forEach((count, i) => {
    const weekStart = addDays(lastStart, -(counts.length - 1 - i) * 7);
    for (let n = 0; n < count; n++) {
      sets.push({ date: weekStart, type: 'strength', weight: 100, reps: 5 });
    }
    recovery.push({
      date: weekStart,
      soreness: count / 2,
      sleepHours: 8 - count * 0.1,
      restingHr: 50 + count * 0.5,
    });
  });
  return { sets, recovery };
}

test('buildInsight splits weeks at the median and averages each side', () => {
  const { sets, recovery } = scenario([4, 8, 12, 16, 20, 24]);
  const insight = buildInsight(sets, recovery, { weeks: 12, endDate: '2026-11-06' });

  assert.equal(insight.ok, true);
  assert.equal(insight.medianSets, 14);
  assert.equal(insight.high.weeks, 3);
  assert.equal(insight.low.weeks, 3);
  assert.equal(insight.high.setsAvg, 20);
  assert.equal(insight.low.setsAvg, 8);
  assert.equal(insight.high.sorenessAvg, 10);
  assert.equal(insight.low.sorenessAvg, 4);
  assert.equal(insight.high.sleepAvg, 6);
  assert.equal(insight.low.sleepAvg, 7.2);
  assert.equal(insight.high.restingHrAvg, 60);
  assert.equal(insight.low.restingHrAvg, 54);
});

test('buildInsight reports correlations and plain-language lines', () => {
  const { sets, recovery } = scenario([4, 8, 12, 16, 20, 24]);
  const insight = buildInsight(sets, recovery);
  assert.equal(insight.correlations.soreness, 1);
  assert.equal(insight.correlations.sleep, -1);
  assert.equal(insight.correlations.restingHr, 1);

  const text = insight.lines.join(' ');
  assert.match(text, /heavier weeks/i);
  assert.match(text, /10\/10/);
  assert.match(text, /4\/10/);
  assert.match(text, /Sleep averaged 6h in heavier weeks vs 7\.2h/);
  assert.match(text, /Soreness strongly followed weekly volume/);
});

test('buildInsight refuses to guess with fewer than four eligible weeks', () => {
  const { sets, recovery } = scenario([10, 20, 30]);
  const insight = buildInsight(sets, recovery);
  assert.equal(insight.ok, false);
  assert.equal(insight.weeksNeeded, MIN_WEEKS - 3);
  assert.match(insight.reason, /at least 4/);
});

test('buildInsight ignores weeks without check-ins when counting', () => {
  const { sets } = scenario([10, 20, 30, 40]);
  const insight = buildInsight(sets, []);
  assert.equal(insight.ok, false);
  assert.equal(insight.eligible.length, 0);
});

test('buildInsight declines to split identical weeks', () => {
  const { sets, recovery } = scenario([10, 10, 10, 10]);
  const insight = buildInsight(sets, recovery);
  assert.equal(insight.ok, false);
  assert.match(insight.reason, /almost identical/);
});

test('sleep that barely moves is described as barely moving', () => {
  const { sets, recovery } = scenario([4, 8, 12, 16, 20, 24]);
  // Flatten sleep and drop the other markers; the split stays valid.
  for (const log of recovery) { log.sleepHours = 7; delete log.soreness; delete log.restingHr; }
  const insight = buildInsight(sets, recovery);
  assert.equal(insight.ok, true);
  assert.equal(insight.correlations.sleep, null);            // no variance
  assert.match(insight.lines.join(' '), /barely changed/);
  assert.doesNotMatch(insight.lines.join(' '), /followed weekly volume/);
});
