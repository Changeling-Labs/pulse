// ── Pulse Recover: pure stats ──────────────────────────────
// Everything here is date math over normalized recovery_logs records
// ({ date, sleepHours, soreness, restingHr, note }) with no DOM and no IDB,
// so it runs under node's test runner.
//
// A check-in may carry any subset of metrics, so every average ignores
// missing values instead of treating them as zero. Windows are inclusive
// local calendar days ending at `endDate`.

import { localDateStr } from './dates.js';

const MS_DAY = 86400000;

export const SORENESS_LABELS = {
  1: 'Fresh', 2: 'Fresh', 3: 'Good', 4: 'Good', 5: 'Mild',
  6: 'Moderate', 7: 'Sore', 8: 'Sore', 9: 'Very sore', 10: 'Wrecked',
};

export function sorenessLabel(n) {
  if (!Number.isFinite(n)) return '—';
  const key = Math.max(1, Math.min(10, Math.round(n)));
  return SORENESS_LABELS[key];
}

// low / mid / high severity, used only for colour, never for decisions.
export function severity(n) {
  if (!Number.isFinite(n)) return 'none';
  if (n <= 3) return 'low';
  if (n <= 6) return 'mid';
  return 'high';
}

// ── Date windows ───────────────────────────────────────────
// Parse as UTC noon so DST transitions can never land on the previous day.
function parse(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

function format(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function shiftDate(dateStr, deltaDays) {
  return format(new Date(parse(dateStr).getTime() + deltaDays * MS_DAY));
}

// Oldest → newest, inclusive. `days` is clamped to 1..366.
export function dateRange(days, endDate = localDateStr()) {
  const n = Math.max(1, Math.min(366, Math.round(days)));
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDate(endDate, -i));
  return out;
}

// Dense series for charts: one entry per day, `log` null when nothing was
// logged, so bars keep their calendar spacing instead of collapsing.
export function seriesFor(logs, days, endDate = localDateStr()) {
  const byDate = new Map((logs ?? []).map(l => [l.date, l]));
  return dateRange(days, endDate).map(date => ({ date, log: byDate.get(date) ?? null }));
}

// ── Averages ───────────────────────────────────────────────
export function meanOf(values) {
  const nums = (values ?? []).filter(v => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

const round1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function periodStats(logs, days, endDate = localDateStr()) {
  const dates = new Set(dateRange(days, endDate));
  const rows = (logs ?? []).filter(l => dates.has(l.date));

  const pick = key => meanOf(rows.map(l => l[key]));
  const sleep = pick('sleepHours');
  const soreness = pick('soreness');
  const restingHr = pick('restingHr');

  return {
    days: Math.max(1, Math.min(366, Math.round(days))),
    logged: rows.length,
    sleepAvg: round1(sleep),
    sorenessAvg: round1(soreness),
    restingHrAvg: round1(restingHr),
    shortNights: rows.filter(l => Number.isFinite(l.sleepHours) && l.sleepHours < 7).length,
    // A rough, honest "how much of the window did you actually check in".
    coverage: Math.round((rows.length / dateRange(days, endDate).length) * 100),
  };
}

const delta = (current, previous) =>
  (Number.isFinite(current) && Number.isFinite(previous) ? Math.round((current - previous) * 10) / 10 : null);

// Compares the window ending `endDate` with the same-length window before it.
export function comparePeriods(logs, days, endDate = localDateStr()) {
  const current = periodStats(logs, days, endDate);
  const previousEnd = shiftDate(endDate, -current.days);
  const previous = periodStats(logs, days, previousEnd);

  return {
    current,
    previous,
    deltas: {
      sleep: delta(current.sleepAvg, previous.sleepAvg),
      soreness: delta(current.sorenessAvg, previous.sorenessAvg),
      restingHr: delta(current.restingHrAvg, previous.restingHrAvg),
    },
  };
}

// ── Chart helpers ──────────────────────────────────────────
// Fraction of the bar height a value should occupy. Ranges are deliberately
// fixed rather than data-scaled: a 58 bpm resting HR should look the same
// every week, not stretch to fill the chart when the week is flat.
const RANGES = {
  sleepHours: [0, 10],
  soreness: [1, 10],
  restingHr: [40, 100],
};

export function barFraction(key, value) {
  if (!Number.isFinite(value)) return 0;
  const [min, max] = RANGES[key] ?? [0, 1];
  const fraction = (value - min) / (max - min);
  return Math.max(0.06, Math.min(1, fraction));
}

export const METRICS = [
  { key: 'sleepHours', label: 'Sleep', unit: 'h', better: 'higher' },
  { key: 'soreness', label: 'Soreness', unit: '/10', better: 'lower' },
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm', better: 'lower' },
];

export function formatMetric(key, value) {
  if (!Number.isFinite(value)) return '—';
  if (key === 'sleepHours') return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
  if (key === 'soreness') return `${Math.round(value)}/10`;
  if (key === 'restingHr') return `${Math.round(value)} bpm`;
  return String(value);
}

// Short human line for the summary card, e.g. "+0.5h vs previous week".
export function describeDelta(key, value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return 'same as previous';
  const sign = value > 0 ? '+' : '−';
  const abs = Math.abs(value);
  const text = key === 'sleepHours'
    ? `${sign}${abs.toFixed(1)}h`
    : key === 'soreness'
      ? `${sign}${abs.toFixed(1)}`
      : `${sign}${Math.round(abs)} bpm`;
  return `${text} vs previous`;
}
