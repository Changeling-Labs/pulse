import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGE_OPTIONS, rangeFor, addDays, weekStarts,
  weeklyValues, weeklyDays, weeklyWholeShare, trainingWeeks,
  compareWindows, trainingDelta, deltaBasis, formatDelta,
  exerciseProgression, progressionDelta,
  sparkline, barSeries,
  countsByDate, activeDays, heatmap,
  dailyTotals, weeklyFromDaily, weeklyProtein, weeklyWater,
  weeklyBodyweight, latestWeight, weightChange,
} from '../js/trends.js';

// Friday 2026-11-06 → current week starts Monday 2026-11-02.
const TODAY = '2026-11-06';
const THIS_WEEK = '2026-11-02';

// ── Ranges & dates ─────────────────────────────────────────
test('rangeFor falls back to 12 weeks and exposes a 4w/12w/1y choice', () => {
  assert.equal(rangeFor('4w').weeks, 4);
  assert.equal(rangeFor('1y').weeks, 52);
  assert.equal(rangeFor('nonsense').id, '12w');
  assert.deepEqual(RANGE_OPTIONS.map(r => r.id), ['4w', '12w', '1y']);
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weekStarts returns Monday buckets oldest → newest, ending this week', () => {
  assert.deepEqual(weekStarts(4, TODAY), ['2026-10-12', '2026-10-19', '2026-10-26', THIS_WEEK]);
  assert.equal(weekStarts(12, TODAY).length, 12);
  assert.equal(weekStarts(12, TODAY).at(-1), THIS_WEEK);
});

// ── Weekly aggregation ─────────────────────────────────────
test('weeklyValues sums a field and leaves empty weeks as gaps', () => {
  const logs = [
    { date: '2026-10-13', proteinGrams: 30 },   // week 10-12
    { date: '2026-10-14', proteinGrams: 40 },   // week 10-12
    { date: '2026-11-03', proteinGrams: 50 },   // current week
  ];
  assert.deepEqual(weeklyValues(logs, 'proteinGrams', { weeks: 4, endDate: TODAY }), [70, null, null, 50]);
});

test('weeklyValues can average instead of sum', () => {
  const logs = [
    { date: '2026-11-02', sleepHours: 7.5 },
    { date: '2026-11-03', sleepHours: 8 },
  ];
  const series = weeklyValues(logs, 'sleepHours', { weeks: 4, endDate: TODAY, combine: 'mean' });
  assert.equal(series.at(-1), 7.8);
});

test('weeklyValues ignores records outside the window and non-numeric values', () => {
  const logs = [
    { date: '2026-01-01', proteinGrams: 99 },    // far outside a 4-week window
    { date: '2026-11-03', proteinGrams: 'nope' },
    { date: '2026-11-04' },                       // no value at all
  ];
  assert.deepEqual(weeklyValues(logs, 'proteinGrams', { weeks: 2, endDate: TODAY }), [null, null]);
});

test('weeklyDays counts distinct logged days and 0 is a real zero', () => {
  const logs = [
    { date: '2026-10-27' }, { date: '2026-10-27' }, { date: '2026-10-29' },
    { date: '2026-11-03' },
  ];
  assert.deepEqual(weeklyDays(logs, { weeks: 2, endDate: TODAY }), [2, 1]);
  assert.deepEqual(weeklyDays([], { weeks: 2, endDate: TODAY }), [0, 0]);
});

test('weeklyWholeShare reports a percentage and null for unlogged weeks', () => {
  const logs = [
    { date: '2026-11-02', isWholeFood: true },
    { date: '2026-11-03', isWholeFood: false },
    { date: '2026-11-04', isWholeFood: true },
  ];
  assert.deepEqual(weeklyWholeShare(logs, { weeks: 2, endDate: TODAY }), [null, 67]);
});

// ── Training ───────────────────────────────────────────────
test('trainingWeeks includes the current partial week and marks it', () => {
  const sets = [
    { date: '2026-10-27', exerciseId: 1, weight: 100, reps: 5 },
    { date: '2026-10-29', exerciseId: 1, weight: 100, reps: 5 },
    { date: '2026-11-03', exerciseId: 1, weight: 120, reps: 3 },
  ];
  const weeks = trainingWeeks(sets, { weeks: 2, endDate: TODAY });

  assert.deepEqual(weeks.map(w => w.weekStart), ['2026-10-26', THIS_WEEK]);
  assert.equal(weeks[0].partial, false);
  assert.equal(weeks[1].partial, true);
  assert.equal(weeks[0].tonnage, 1000);
  assert.equal(weeks[0].days, 2);
  assert.equal(weeks[1].tonnage, 360);
  assert.equal(weeks[1].sets, 1);
});

// ── Deltas ─────────────────────────────────────────────────
test('compareWindows compares equal windows and refuses empty baselines', () => {
  assert.equal(compareWindows([15, 15], [10, 10]), 50);
  assert.equal(compareWindows([5, 5], [10, 10]), -50);
  assert.equal(compareWindows([10], []), null);
  assert.equal(compareWindows([10, 10], [0, 0]), null);
  assert.equal(compareWindows([null, null], [10]), null);
});

test('trainingDelta compares complete weeks only, against an equal baseline', () => {
  const week = (tons, extra = {}) => ({ sets: tons ? 1 : 0, tonnage: tons, partial: false, ...extra });

  // Last week is partial and tiny; it must not drag the comparison down.
  const current = [week(100), week(100), week(100), week(10, { partial: true })];
  const previous = [week(50), week(50), week(50), week(50)];

  assert.equal(trainingDelta(current, previous), 100);   // 300 vs 150
  assert.equal(deltaBasis(current), 3);
  assert.equal(trainingDelta([week(10, { partial: true })], previous), null);
  assert.equal(trainingDelta([week(100)], [week(0)]), null);  // baseline has no tonnage
});

test('formatDelta keeps the sign honest', () => {
  assert.equal(formatDelta(50), '+50%');
  assert.equal(formatDelta(-8.25), '−8.3%');
  assert.equal(formatDelta(0), 'no change');
  assert.equal(formatDelta(null), '—');
});

// ── Lift progression ───────────────────────────────────────
test('exerciseProgression keeps the best set per day and sorts by date', () => {
  const sets = [
    { date: '2026-11-03', exerciseId: 1, weight: 100, reps: 5 },
    { date: '2026-10-20', exerciseId: 1, weight: 90, reps: 5 },
    { date: '2026-11-03', exerciseId: 1, weight: 100, reps: 8 },   // same weight, more reps
    { date: '2026-10-20', exerciseId: 1, weight: 85, reps: 10 },
  ];
  const points = exerciseProgression(sets, 1);

  assert.deepEqual(points.map(p => p.date), ['2026-10-20', '2026-11-03']);
  assert.equal(points[0].weight, 90);
  assert.equal(points[1].reps, 8);
  assert.equal(points[1].e1rm, 126.7);        // 100 × (1 + 8/30) = 126.67
});

test('exerciseProgression filters other lifts, invalid sets and the since date', () => {
  const sets = [
    { date: '2026-11-03', exerciseId: 2, weight: 200, reps: 5 },   // other exercise
    { date: '2026-11-04', exerciseId: 1, weight: 0, reps: 0 },     // invalid
    { date: '2026-11-05', exerciseId: 1, weight: 50, reps: 10 },
    { date: '2026-10-01', exerciseId: 1, weight: 80, reps: 5 },    // before since
  ];
  const points = exerciseProgression(sets, 1, { since: '2026-10-15' });
  assert.deepEqual(points.map(p => p.date), ['2026-11-05']);
});

test('exerciseProgression caps the session count', () => {
  const sets = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    exerciseId: 1,
    weight: 100 + i,
    reps: 5,
  }));
  const points = exerciseProgression(sets, 1, { sessions: 4 });
  assert.equal(points.length, 4);
  assert.equal(points.at(-1).weight, 111);
});

test('progressionDelta describes the first → last change', () => {
  assert.equal(progressionDelta([{ weight: 100 }, { weight: 110 }]), 10);
  assert.equal(progressionDelta([{ weight: 0 }, { weight: 10 }]), null);
  assert.equal(progressionDelta([{ weight: 100 }]), null);
});

// ── Chart strings ──────────────────────────────────────────
test('sparkline needs two real points and draws gaps as separate paths', () => {
  assert.equal(sparkline([5]), '');
  assert.equal(sparkline([null, null]), '');

  const continuous = sparkline([1, 2, 3], { label: 'Back squat' });
  assert.match(continuous, /^<svg class="spark"/);
  assert.equal((continuous.match(/<path /g) || []).length, 1);
  assert.match(continuous, /aria-label="Back squat"/);

  const gapped = sparkline([1, 2, null, 4, 5]);
  assert.equal((gapped.match(/<path /g) || []).length, 2);
});

test('sparkline escapes text that goes into the aria-label', () => {
  const svg = sparkline([1, 2], { label: 'Squat "A" <B>' });
  assert.match(svg, /aria-label="Squat &quot;A&quot; &lt;B&gt;"/);
});

test('barSeries renders gaps, a visible zero and scales to the max', () => {
  const html = barSeries([10, null, 0, 5], { labels: ['a', 'b', 'c', 'd'], label: 'Tonnage' });
  assert.match(html, /class="trend-bars"/);
  assert.equal((html.match(/trend-gap/g) || []).length, 1);
  assert.match(html, /height:100%/);
  assert.match(html, /height:2%/);          // real zero, still visible
  assert.match(html, /height:50%/);
  assert.match(html, /title="a"/);
});

test('barSeries honours an explicit max', () => {
  const html = barSeries([3], { max: 7, label: 'Sessions' });
  assert.match(html, /height:43%/);
});

// ── Consistency ────────────────────────────────────────────
test('countsByDate and activeDays count records, not values', () => {
  const sets = [
    { date: '2026-11-02' }, { date: '2026-11-02' }, { date: '2026-11-04' },
    { date: '2026-11-04' }, { date: '2026-11-04' },
  ];
  const counts = countsByDate(sets);
  assert.equal(counts.get('2026-11-02'), 2);
  assert.equal(counts.get('2026-11-04'), 3);
  assert.equal(activeDays(sets), 2);
  assert.equal(activeDays([]), 0);
});

test('heatmap renders 7 rows per week, shades by set count and marks future days', () => {
  const sets = [
    { date: '2026-11-02' },
    { date: '2026-11-03' }, { date: '2026-11-03' },
    { date: '2026-11-04' }, { date: '2026-11-04' }, { date: '2026-11-04' },
  ];
  const html = heatmap(sets, { weeks: 2, endDate: TODAY, label: 'Training days' });

  assert.equal((html.match(/class="heat-cell/g) || []).length, 14);
  assert.equal((html.match(/heat-cell on/g) || []).length, 3);
  assert.equal((html.match(/ on l2/g) || []).length, 1);
  assert.equal((html.match(/ on l3/g) || []).length, 1);
  assert.equal((html.match(/heat-cell future/g) || []).length, 2);   // Nov 7–8
  assert.match(html, /aria-label="Training days"/);
  assert.match(html, /2026-11-04 — 3 sets/);
});

test('heatmap accepts a prebuilt count map', () => {
  const html = heatmap(new Map([['2026-11-05', 1]]), { weeks: 1, endDate: TODAY });
  assert.equal((html.match(/heat-cell on/g) || []).length, 1);
  assert.equal((html.match(/class="heat-cell/g) || []).length, 7);
});

// ── Fuel & body series ─────────────────────────────────────
test('dailyTotals sums repeated meals within a day', () => {
  const totals = dailyTotals([
    { date: '2026-11-02', proteinGrams: 30 },
    { date: '2026-11-02', proteinGrams: 25 },
    { date: '2026-11-03', proteinGrams: 40 },
    { date: '2026-11-03', proteinGrams: null },
  ], 'proteinGrams');
  assert.equal(totals.get('2026-11-02'), 55);
  assert.equal(totals.get('2026-11-03'), 40);
});

test('weeklyProtein averages daily totals and leaves empty weeks as gaps', () => {
  const logs = [
    { date: '2026-11-02', proteinGrams: 30 },
    { date: '2026-11-02', proteinGrams: 20 },   // same day → 50
    { date: '2026-11-03', proteinGrams: 40 },   // next day
  ];
  assert.deepEqual(weeklyProtein(logs, { weeks: 2, endDate: TODAY }), [null, 45]);
});

test('weeklyWater averages glasses per logged day', () => {
  const water = [
    { date: '2026-11-02', glasses: 8 },
    { date: '2026-11-03', glasses: 6 },
  ];
  assert.deepEqual(weeklyWater(water, { weeks: 2, endDate: TODAY }), [null, 7]);
});

test('weeklyFromDaily can sum instead of mean', () => {
  const daily = new Map([['2026-11-02', 2], ['2026-11-03', 3]]);
  assert.deepEqual(weeklyFromDaily(daily, { weeks: 1, endDate: TODAY, combine: 'sum' }), [5]);
});

test('weeklyBodyweight averages weigh-ins inside the week', () => {
  const logs = [
    { date: '2026-11-02', weightLbs: 180 },
    { date: '2026-11-05', weightLbs: 178.5 },
    { date: '2026-10-27', weightLbs: 190 },       // previous week
    { date: '2026-11-04', sleepHours: 8 },         // no weight: ignore
  ];
  assert.deepEqual(weeklyBodyweight(logs, { weeks: 2, endDate: TODAY }), [190, 179.3]);
});

test('latestWeight and weightChange describe real weigh-ins only', () => {
  const logs = [
    { date: '2026-11-05', weightLbs: 178.4 },
    { date: '2026-10-20', weightLbs: 182.4 },
    { date: '2026-11-01' },                        // no weight
    { date: '2026-10-25', weightLbs: null },
  ];
  assert.deepEqual(latestWeight(logs), { date: '2026-11-05', weightLbs: 178.4 });
  assert.equal(latestWeight([]), null);

  const change = weightChange(logs, { weeks: 4, endDate: TODAY });
  assert.equal(change.from, 182.4);
  assert.equal(change.to, 178.4);
  assert.equal(change.delta, -4);
  assert.equal(change.weighIns, 2);

  assert.equal(weightChange([{ date: '2026-11-05', weightLbs: 178 }], { weeks: 4, endDate: TODAY }), null);
});
