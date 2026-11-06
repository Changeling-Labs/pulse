// ── Pulse trends ───────────────────────────────────────────
// Descriptive aggregates and tiny chart strings for Progress → Trends.
// Pure: no DOM, no storage, no network. Callers inject the returned markup.
//
// Guardrails (same spirit as js/insights.js):
//   • a gap is not a zero — a missed log renders as a gap, never as "0 sleep"
//   • nothing is scored, predicted, or called good/bad
//   • a line needs at least two real points before it draws
//
// Weekly buckets are Monday–Sunday and include the current partial week,
// flagged so the UI can say so.

import { localDateStr } from './dates.js';
import { mondayOf, weekSeries } from './insights.js';

export const RANGE_OPTIONS = Object.freeze([
  { id: '4w', label: '4 weeks', weeks: 4 },
  { id: '12w', label: '12 weeks', weeks: 12 },
  { id: '1y', label: '1 year', weeks: 52 },
]);

export function rangeFor(id) {
  return RANGE_OPTIONS.find(r => r.id === id) ?? RANGE_OPTIONS[1];
}

const MS_DAY = 86400000;
const MAX_WEEKS = 104;            // 2 years: enough for a 1-year window + its comparison

const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const round1 = v => Math.round(v * 10) / 10;
const sum = values => values.reduce((a, b) => a + b, 0);

function utc(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function iso(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(dateStr, days) {
  return iso(utc(dateStr) + days * MS_DAY);
}

// Monday starts for `weeks` buckets, oldest → newest, ending with the week
// that contains `endDate` (which may be partial).
export function weekStarts(weeks = 12, endDate = localDateStr()) {
  const n = Math.max(1, Math.min(MAX_WEEKS, Math.round(weeks)));
  const currentMonday = mondayOf(endDate);
  return Array.from({ length: n }, (_, i) => addDays(currentMonday, -7 * (n - 1 - i)));
}

// ── Generic weekly aggregation ─────────────────────────────
// `pick` is a field name or a function. Empty weeks stay null (a gap), so a
// chart never implies "you logged zero" when you simply did not log.
export function weeklyValues(records = [], pick, {
  weeks = 12,
  endDate = localDateStr(),
  combine = 'sum',
} = {}) {
  const starts = weekStarts(weeks, endDate);
  const groups = new Map(starts.map(s => [s, []]));

  for (const record of records ?? []) {
    if (!record?.date) continue;
    const bucket = groups.get(mondayOf(record.date));
    if (!bucket) continue;
    const value = typeof pick === 'function' ? pick(record) : record[pick];
    if (isNum(value)) bucket.push(Number(value));
  }

  return starts.map(weekStart => {
    const values = groups.get(weekStart);
    if (!values.length) return null;
    return combine === 'mean' ? round1(sum(values) / values.length) : sum(values);
  });
}

// Distinct days with a record in each week. 0 is a real zero here — not a gap.
export function weeklyDays(records = [], { weeks = 12, endDate = localDateStr() } = {}) {
  const starts = weekStarts(weeks, endDate);
  const days = new Map(starts.map(s => [s, new Set()]));

  for (const record of records ?? []) {
    if (!record?.date) continue;
    days.get(mondayOf(record.date))?.add(record.date);
  }

  return starts.map(weekStart => days.get(weekStart).size);
}

// Share of logged meals flagged whole-food, as a percentage. Null = no logs.
export function weeklyWholeShare(fuelLogs = [], { weeks = 12, endDate = localDateStr() } = {}) {
  const starts = weekStarts(weeks, endDate);
  const groups = new Map(starts.map(s => [s, []]));

  for (const log of fuelLogs ?? []) {
    if (!log?.date) continue;
    groups.get(mondayOf(log.date))?.push(log);
  }

  return starts.map(weekStart => {
    const logs = groups.get(weekStart);
    if (!logs.length) return null;
    return Math.round((logs.filter(l => l.isWholeFood).length / logs.length) * 100);
  });
}

// ── Training ───────────────────────────────────────────────
// Reuses the insight windowing so there is one definition of a training week.
export function trainingWeeks(sets = [], { weeks = 12, endDate = localDateStr() } = {}) {
  return weekSeries(sets, [], weeks, endDate, { includeCurrent: true })
    .map(w => ({ ...w, partial: w.weekStart <= endDate && endDate <= w.weekEnd }));
}

// Percentage change between two equal-length windows of weekly values.
// Returns null when either window has no data, or the baseline is zero.
export function compareWindows(current = [], previous = []) {
  const cur = current.filter(isNum).map(Number);
  const prev = previous.filter(isNum).map(Number);
  if (!cur.length || !prev.length) return null;
  const before = sum(prev);
  if (before <= 0) return null;
  return round1(((sum(cur) - before) / before) * 100);
}

// The chart can include the current partial week, but a sum-based delta must
// not: a Monday would always look like a collapse. Compare only complete weeks,
// taking the same number of baseline weeks from the window before.
export function trainingDelta(current = [], previous = []) {
  const complete = current.filter(w => !w.partial);
  if (!complete.length) return null;
  const baseline = previous.slice(-complete.length);
  return compareWindows(
    complete.map(w => (w.sets > 0 ? w.tonnage : null)),
    baseline.map(w => (w.sets > 0 ? w.tonnage : null))
  );
}

/** How many weeks the delta actually compared (complete weeks in the window). */
export function deltaBasis(current = []) {
  return current.filter(w => !w.partial).length;
}

export function formatDelta(pct) {
  if (!Number.isFinite(pct)) return '—';
  if (pct === 0) return 'no change';
  const magnitude = Math.round(Math.abs(pct) * 10) / 10;
  return `${pct > 0 ? '+' : '−'}${magnitude}%`;
}

// Top set per session for one lift. A "session" is a date with at least one
// valid strength set; ties on weight go to the higher rep count.
export function exerciseProgression(sets = [], exerciseId, { sessions = 8, since = null } = {}) {
  const byDate = new Map();

  for (const set of sets ?? []) {
    if (set?.exerciseId !== exerciseId) continue;
    if (!set.date) continue;
    if (since && set.date < since) continue;

    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) continue;
    if (weight < 0 || reps <= 0) continue;

    const previous = byDate.get(set.date);
    const better = !previous || weight > previous.weight || (weight === previous.weight && reps > previous.reps);
    if (better) {
      byDate.set(set.date, {
        date: set.date,
        weight,
        reps,
        e1rm: round1(weight * (1 + reps / 30)),
      });
    }
  }

  const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.slice(-Math.max(1, Math.round(sessions)));
}

export function progressionDelta(points = []) {
  if (points.length < 2) return null;
  const first = points[0].weight;
  const last = points[points.length - 1].weight;
  if (!(first > 0)) return null;
  return round1(((last - first) / first) * 100);
}

// ── Chart strings ──────────────────────────────────────────
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// A line that stretches to its container. Gaps split the line into separate
// paths instead of drawing through missing data; `vector-effect` keeps the
// stroke from being squashed by the non-uniform viewBox scale.
export function sparkline(values = [], { height = 34, label = '' } = {}) {
  const nums = values.map(v => (isNum(v) ? Number(v) : null));
  const present = nums.filter(v => v !== null);
  if (present.length < 2) return '';

  const W = 100;
  const H = Math.max(16, Number(height) || 34);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;

  const x = i => (nums.length === 1 ? W / 2 : (i / (nums.length - 1)) * W);
  const y = v => H - 3 - ((v - min) / span) * (H - 6);
  const pt = n => Math.round(n * 100) / 100;

  const runs = [];
  let run = [];
  nums.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push([i, v]);
    }
  });
  if (run.length) runs.push(run);

  const marks = runs.map(segment => {
    if (segment.length === 1) {
      const [i, v] = segment[0];
      return `<line class="spark-line spark-point" x1="${pt(x(i) - 1.5)}" y1="${pt(y(v))}" x2="${pt(x(i) + 1.5)}" y2="${pt(y(v))}"/>`;
    }
    const d = segment.map(([i, v], idx) => `${idx === 0 ? 'M' : 'L'}${pt(x(i))} ${pt(y(v))}`).join(' ');
    return `<path class="spark-line" d="${d}"/>`;
  }).join('');

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${marks}</svg>`;
}

// Bars for a weekly series. Nulls become the existing `.trend-gap` dash;
// a real zero gets a hairline bar so "trained, no tonnage" is not invisible.
export function barSeries(values = [], { labels = [], label = '', max = null } = {}) {
  const nums = values.map(v => (isNum(v) && Number(v) >= 0 ? Number(v) : null));
  const present = nums.filter(v => v !== null);
  const top = Number.isFinite(max) && max > 0 ? max : Math.max(1, ...present);

  const bars = nums.map((value, i) => {
    const title = labels[i] ?? '';
    if (value === null) {
      return `<div class="trend-gap"${title ? ` title="${esc(title)}"` : ''} aria-label="${esc(title || 'no data')}"></div>`;
    }
    const height = value === 0 ? 2 : Math.max(6, Math.round((value / top) * 100));
    return `<div class="trend-bar" style="height:${height}%" title="${esc(title)}" aria-label="${esc(title)}"></div>`;
  }).join('');

  return `<div class="trend-bars" role="img" aria-label="${esc(label)}">${bars}</div>`;
}
