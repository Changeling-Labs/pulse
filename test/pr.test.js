import test from 'node:test';
import assert from 'node:assert/strict';
import { metricPR, metricPRs, countPRSets } from '../js/pr.js';

const SETS = [
  // strength + timed + distance composite (rower)
  { id: 1, exerciseId: 7, type: 'distance', distance: 2000, duration: 420, date: '2026-10-01' },
  { id: 2, exerciseId: 7, type: 'distance', distance: 2000, duration: 400, date: '2026-10-20' },   // faster, same distance
  { id: 3, exerciseId: 7, type: 'distance', distance: 5000, duration: 1100, date: '2026-10-25' },
  // strength (bench)
  { id: 4, exerciseId: 1, type: 'strength', weight: 135, reps: 5, date: '2026-10-05' },
  { id: 5, exerciseId: 1, type: 'strength', weight: 155, reps: 3, date: '2026-10-18' },             // 465 volume < 675
  { id: 6, exerciseId: 1, type: 'strength', weight: 225, reps: 1, date: '2026-11-01' },             // 225 vol
  // output
  { id: 7, exerciseId: 9, type: 'output', output: 30, date: '2026-10-12' },
  { id: 8, exerciseId: 9, type: 'output', output: 45, date: '2026-10-02' },                          // all-time best but outside window
];

test('metricPR strength returns the best volume set', () => {
  const pr = metricPR(SETS.filter(s => s.exerciseId === 1), 'strength');
  assert.equal(pr.setId, 4);          // 675 lbs > 465 > 225
  assert.equal(pr.value, 675);
  assert.equal(pr.date, '2026-10-05');
});

test('metricPR strength honours the window and falls back to all-time', () => {
  // Window starts after every set → all-time fallback
  const pr = metricPR(SETS.filter(s => s.exerciseId === 1), 'strength', '2027-01-01');
  assert.equal(pr.setId, 4);

  // Window covers ids 5 and 6 only (after 2026-10-10) → best there is id 5
  const windowed = metricPR(SETS.filter(s => s.exerciseId === 1), 'strength', '2026-10-10');
  assert.equal(windowed.setId, 5);   // 465 > 225
});

test('metricPR timed returns the lowest duration', () => {
  const pr = metricPR(SETS.filter(s => s.exerciseId === 7), 'timed', '2026-01-01');
  assert.equal(pr.setId, 2);         // 400s
  assert.equal(pr.value, 400);
});

test('metricPR distance returns the longest distance', () => {
  const pr = metricPR(SETS.filter(s => s.exerciseId === 7), 'distance', '2026-01-01');
  assert.equal(pr.setId, 3);
  assert.equal(pr.value, 5000);
});

test('metricPR output returns the highest output with window fallback', () => {
  const allTime = metricPR(SETS.filter(s => s.exerciseId === 9), 'output');
  assert.equal(allTime.setId, 8);

  const windowed = metricPR(SETS.filter(s => s.exerciseId === 9), 'output', '2026-10-05');
  assert.equal(windowed.setId, 7);   // id 8 is before the window; id 7 wins inside it
});

test('metricPR returns null when no set carries the metric', () => {
  assert.equal(metricPR(SETS, 'timed', '2026-01-01') && metricPR([{ exerciseId: 1, type: 'strength', weight: 100, reps: 1, date: '2026-10-01' }], 'timed'), null);
  assert.equal(metricPR([], 'distance'), null);
});

test('metricPRs reports one entry per declared metric present in the sets', () => {
  const out = metricPRs(SETS.filter(s => s.exerciseId === 7), ['distance', 'timed', 'strength'], '2026-01-01');
  assert.deepEqual(Object.keys(out).sort(), ['distance', 'timed']);   // no strength data → no strength entry
  assert.equal(out.distance.value, 5000);
  assert.equal(out.timed.value, 400);
});

// ── "PRs today" counting ───────────────────────────────────
const TODAY = '2026-11-07';

test('countPRSets counts a first-ever set for every metric', () => {
  const today = [
    { id: 101, exerciseId: 1, type: 'strength', weight: 135, reps: 5, date: TODAY },
    { id: 102, exerciseId: 9, type: 'output', output: 8, date: TODAY },
    { id: 103, exerciseId: 7, type: 'timed', duration: 20, date: TODAY },
  ];
  assert.equal(countPRSets(today), 3);
});

test('countPRSets ignores a set that does not beat the history', () => {
  const history = [
    { id: 1, exerciseId: 1, type: 'strength', weight: 185, reps: 5, date: '2026-11-01' },
    { id: 2, exerciseId: 9, type: 'output', output: 12, date: '2026-11-01' },
    { id: 3, exerciseId: 7, type: 'timed', duration: 18, date: '2026-11-01' },
  ];
  const today = [
    { id: 11, exerciseId: 1, type: 'strength', weight: 135, reps: 5, date: TODAY },
    { id: 12, exerciseId: 9, type: 'output', output: 8, date: TODAY },
    { id: 13, exerciseId: 7, type: 'timed', duration: 20, date: TODAY },
  ];
  assert.equal(countPRSets(today, [...history, ...today]), 0);
});

test('countPRSets catches rep-count, hold and distance PRs from quick sessions', () => {
  const history = [
    { id: 1, exerciseId: 9, type: 'output', output: 8, date: '2026-11-01' },
    { id: 2, exerciseId: 7, type: 'timed', duration: 40, date: '2026-11-01' },
    { id: 3, exerciseId: 8, type: 'distance', distance: 2000, date: '2026-11-01' },
  ];
  const today = [
    { id: 11, exerciseId: 9, type: 'output', output: 12, date: TODAY },
    { id: 12, exerciseId: 7, type: 'timed', duration: 30, date: TODAY },
    { id: 13, exerciseId: 8, type: 'distance', distance: 2500, date: TODAY },
  ];
  assert.equal(countPRSets(today, [...history, ...today]), 3);
});

test('countPRSets counts a composite set once even when two metrics improve', () => {
  const history = [
    { id: 1, exerciseId: 7, type: 'distance', distance: 2000, duration: 420, date: '2026-11-01' },
  ];
  const today = [
    { id: 11, exerciseId: 7, type: 'distance', distance: 5000, duration: 400, date: TODAY },
  ];
  assert.equal(countPRSets(today, [...history, ...today]), 1);
});

test('countPRSets sees a best-volume PR at a non-tier rep count', () => {
  const history = [
    { id: 1, exerciseId: 1, type: 'strength', weight: 150, reps: 5, date: '2026-11-01' },   // 750 volume
  ];
  const today = [
    { id: 11, exerciseId: 1, type: 'strength', weight: 100, reps: 8, date: TODAY },          // 800 volume
  ];
  assert.equal(countPRSets(today, [...history, ...today]), 1);
});

test('countPRSets honours the PR window with an all-time fallback', () => {
  const history = [
    { id: 1, exerciseId: 9, type: 'output', output: 20, date: '2026-01-01' },
    { id: 2, exerciseId: 9, type: 'output', output: 8, date: '2026-11-01' },
  ];
  const today = [
    { id: 11, exerciseId: 9, type: 'output', output: 10, date: TODAY },
  ];
  // Inside the window, 10 beats 8, so it counts.
  assert.equal(countPRSets(today, [...history, ...today], '2026-10-01'), 1);
  // Across all time, 20 still leads, so it does not.
  assert.equal(countPRSets(today, [...history, ...today], null), 0);
});

test('countPRSets does not leak PRs across exercises', () => {
  const history = [
    { id: 1, exerciseId: 9, type: 'output', output: 20, date: '2026-11-01' },
  ];
  const today = [
    { id: 11, exerciseId: 10, type: 'output', output: 10, date: TODAY },
  ];
  assert.equal(countPRSets(today, [...history, ...today]), 1);
});
