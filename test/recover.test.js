import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecoveryLog, validateRecoveryLog, migrateBackup, BACKUP_VERSION } from '../js/schema.js';
import {
  shiftDate, dateRange, seriesFor, meanOf, periodStats, comparePeriods,
  sorenessLabel, severity, barFraction, formatMetric, describeDelta, METRICS,
} from '../js/recover.js';

// ── Schema ─────────────────────────────────────────────────
test('normalizeRecoveryLog clamps metrics and rounds sleep to a quarter hour', () => {
  const log = normalizeRecoveryLog({ date: '2026-11-06', sleepHours: 7.6, soreness: 12, restingHr: 21, note: '  tight calves  ' });
  assert.equal(log.date, '2026-11-06');
  assert.equal(log.sleepHours, 7.5);
  assert.equal(log.soreness, 10);
  assert.equal(log.restingHr, 30);
  assert.equal(log.note, 'tight calves');
});

test('normalizeRecoveryLog keeps missing metrics as null, not zero', () => {
  const log = normalizeRecoveryLog({ date: '2026-11-06', sleepHours: null, soreness: '', restingHr: undefined });
  assert.equal(log.sleepHours, null);
  assert.equal(log.soreness, null);
  assert.equal(log.restingHr, null);
  assert.equal(log.note, '');
});

test('normalizeRecoveryLog clamps bodyweight to 50–1000 lb, one decimal', () => {
  const log = normalizeRecoveryLog({ date: '2026-11-06', weightLbs: 182.46 });
  assert.equal(log.weightLbs, 182.5);
  assert.equal(normalizeRecoveryLog({ weightLbs: 10 }).weightLbs, 50);
  assert.equal(normalizeRecoveryLog({ weightLbs: 2000 }).weightLbs, 1000);
  assert.equal(normalizeRecoveryLog({ weightLbs: '' }).weightLbs, null);
  assert.equal(normalizeRecoveryLog({ weightLbs: 'heavy' }).weightLbs, null);
});

test('validateRecoveryLog accepts a weight-only check-in but rejects absurd weights', () => {
  const weightOnly = { date: '2026-11-06', sleepHours: null, soreness: null, restingHr: null, weightLbs: 180, note: '' };
  assert.equal(validateRecoveryLog(weightOnly).ok, true);

  assert.equal(validateRecoveryLog({ ...weightOnly, weightLbs: 20 }).ok, false);
  assert.equal(validateRecoveryLog({ ...weightOnly, weightLbs: 1200 }).ok, false);
  assert.equal(validateRecoveryLog({ ...weightOnly, weightLbs: null }).ok, false);   // now empty
});

test('validateRecoveryLog rejects empty rows and accepts partial ones', () => {
  assert.equal(validateRecoveryLog({ date: '2026-11-06', sleepHours: null, soreness: null, restingHr: null, note: '' }).ok, false);
  assert.equal(validateRecoveryLog({ date: '2026-11-06', sleepHours: 7, soreness: null, restingHr: null, note: '' }).ok, true);
  assert.equal(validateRecoveryLog({ date: 'bad', sleepHours: 7, soreness: null, restingHr: null, note: '' }).ok, false);
  assert.equal(validateRecoveryLog({ date: '2026-11-06', sleepHours: 30, soreness: null, restingHr: null, note: '' }).ok, false);
});

// ── Date windows ───────────────────────────────────────────
test('shiftDate crosses month and year boundaries', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-11-06', 0), '2026-11-06');
});

test('dateRange is oldest to newest and inclusive', () => {
  assert.deepEqual(dateRange(3, '2026-11-06'), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(dateRange(7, '2026-11-06').length, 7);
  assert.equal(dateRange(0, '2026-11-06').length, 1);
  assert.equal(dateRange(9999, '2026-11-06').length, 366);
});

test('seriesFor keeps calendar spacing with nulls for missing days', () => {
  const logs = [
    { date: '2026-11-04', sleepHours: 7, soreness: 4, restingHr: 60 },
    { date: '2026-11-06', sleepHours: 8, soreness: 2, restingHr: 56 },
  ];
  const series = seriesFor(logs, 3, '2026-11-06');
  assert.deepEqual(series.map(p => p.date), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(series[1].log, null);
  assert.equal(series[2].log.sleepHours, 8);
});

// ── Averages ───────────────────────────────────────────────
test('meanOf ignores nulls and returns null when nothing is logged', () => {
  assert.equal(meanOf([7, null, 8, undefined]), 7.5);
  assert.equal(meanOf([]), null);
  assert.equal(meanOf([null, null]), null);
});

test('periodStats averages each metric independently', () => {
  const logs = [
    { date: '2026-11-01', sleepHours: 6, soreness: 8, restingHr: 62 },
    { date: '2026-11-03', sleepHours: 8, soreness: null, restingHr: 58 },
    { date: '2026-11-05', sleepHours: null, soreness: 4, restingHr: 60 },
    // outside the window
    { date: '2026-10-20', sleepHours: 2, soreness: 10, restingHr: 90 },
  ];
  const stats = periodStats(logs, 7, '2026-11-06');
  assert.equal(stats.logged, 3);
  assert.equal(stats.sleepAvg, 7);
  assert.equal(stats.sorenessAvg, 6);
  assert.equal(stats.restingHrAvg, 60);
  assert.equal(stats.shortNights, 1);
  assert.equal(stats.coverage, 43);          // 3 of 7 days
});

test('periodStats boundaries are inclusive', () => {
  const logs = [{ date: '2026-11-06', sleepHours: 8, soreness: 3, restingHr: 55 }];
  assert.equal(periodStats(logs, 1, '2026-11-06').logged, 1);
  assert.equal(periodStats(logs, 1, '2026-11-07').logged, 0);
});

test('comparePeriods reports deltas against the previous window', () => {
  const logs = [
    { date: '2026-11-05', sleepHours: 8, soreness: 3, restingHr: 56 },
    { date: '2026-11-02', sleepHours: 6, soreness: 5, restingHr: 62 },
  ];
  const cmp = comparePeriods(logs, 3, '2026-11-06');
  assert.equal(cmp.current.sleepAvg, 8);
  assert.equal(cmp.previous.sleepAvg, 6);
  assert.equal(cmp.deltas.sleep, 2);
  assert.equal(cmp.deltas.soreness, -2);
  assert.equal(cmp.deltas.restingHr, -6);
});

test('comparePeriods returns null deltas when a window has no data', () => {
  const logs = [{ date: '2026-11-06', sleepHours: 8, soreness: 3, restingHr: 56 }];
  const cmp = comparePeriods(logs, 2, '2026-11-06');
  assert.equal(cmp.deltas.sleep, null);
  assert.equal(cmp.deltas.soreness, null);
  assert.equal(cmp.deltas.restingHr, null);
});

// ── Labels and chart helpers ───────────────────────────────
test('soreness labels stay in range', () => {
  assert.equal(sorenessLabel(1), 'Fresh');
  assert.equal(sorenessLabel(6), 'Moderate');
  assert.equal(sorenessLabel(10), 'Wrecked');
  assert.equal(sorenessLabel(99), 'Wrecked');
  assert.equal(sorenessLabel(null), '—');
});

test('severity buckets low, mid and high', () => {
  assert.equal(severity(2), 'low');
  assert.equal(severity(5), 'mid');
  assert.equal(severity(9), 'high');
  assert.equal(severity(null), 'none');
});

test('barFraction clamps into a visible range', () => {
  assert.equal(barFraction('sleepHours', 10), 1);
  assert.equal(barFraction('sleepHours', 30), 1);
  assert.equal(barFraction('sleepHours', 0), 0.06);
  assert.ok(barFraction('restingHr', 58) > 0.25 && barFraction('restingHr', 58) < 0.35);
  assert.equal(barFraction('soreness', null), 0);
});

test('formatMetric renders each unit without trailing noise', () => {
  assert.equal(formatMetric('sleepHours', 7), '7h');
  assert.equal(formatMetric('sleepHours', 7.5), '7.5h');
  assert.equal(formatMetric('soreness', 4.2), '4/10');
  assert.equal(formatMetric('restingHr', 58.4), '58 bpm');
  assert.equal(formatMetric('sleepHours', null), '—');
});

test('describeDelta reads naturally and handles zero', () => {
  assert.equal(describeDelta('sleepHours', 0.5), '+0.5h vs previous');
  assert.equal(describeDelta('soreness', -1.5), '−1.5 vs previous');
  assert.equal(describeDelta('restingHr', -3), '−3 bpm vs previous');
  assert.equal(describeDelta('sleepHours', 0), 'same as previous');
  assert.equal(describeDelta('sleepHours', null), '');
});

test('METRICS covers the three tracked signals', () => {
  assert.deepEqual(METRICS.map(m => m.key), ['sleepHours', 'soreness', 'restingHr']);
});

// ── Backups ────────────────────────────────────────────────
test('backups stay at v4 and default recoveryLogs for older files', () => {
  assert.equal(BACKUP_VERSION, 4);
  const base = { version: 4, exercises: [], sets: [] };
  assert.deepEqual(migrateBackup(base).recoveryLogs, []);

  const withLogs = migrateBackup({
    ...base,
    recoveryLogs: [{ date: '2026-11-06', sleepHours: 7, soreness: 3, restingHr: 55, note: '' }],
  });
  assert.equal(withLogs.version, 4);
  assert.equal(withLogs.recoveryLogs.length, 1);
  assert.equal(withLogs.recoveryLogs[0].sleepHours, 7);
  assert.equal(withLogs.recoveryLogs[0].soreness, 3);
});
