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

// ── Consistency ────────────────────────────────────────────
// Distinct records per calendar day. Used by the heatmap, where a day with
// any activity is "on" and the number of sets only changes the shade.
export function countsByDate(records = []) {
  const counts = new Map();
  for (const record of records ?? []) {
    if (!record?.date) continue;
    counts.set(record.date, (counts.get(record.date) ?? 0) + 1);
  }
  return counts;
}

function countMap(input) {
  if (input instanceof Map) return input;
  if (Array.isArray(input)) return countsByDate(input);
  return new Map(Object.entries(input ?? {}));
}

export function activeDays(input) {
  let days = 0;
  for (const count of countMap(input).values()) if (count > 0) days++;
  return days;
}

// GitHub-style calendar: one column per week (oldest → newest), 7 rows
// Monday → Sunday. Days after `endDate` are marked `future` rather than empty
// so the current week does not read as a run of missed days.
export function heatmap(input, { weeks = 12, endDate = localDateStr(), label = 'Training consistency' } = {}) {
  const counts = countMap(input);
  const starts = weekStarts(weeks, endDate);
  const cells = [];

  for (const start of starts) {
    for (let row = 0; row < 7; row++) {
      const date = addDays(start, row);
      const count = counts.get(date) ?? 0;
      const future = date > endDate;
      const level = count >= 3 ? ' l3' : count === 2 ? ' l2' : '';
      const title = future
        ? `${date} — not yet`
        : count > 0
          ? `${date} — ${count} set${count === 1 ? '' : 's'}`
          : `${date} — no sets`;
      cells.push(`<div class="heat-cell${count > 0 ? ' on' : ''}${level}${future ? ' future' : ''}" title="${esc(title)}" aria-label="${esc(title)}"></div>`);
    }
  }

  return `<div class="heat" style="--weeks:${weeks}" role="img" aria-label="${esc(label)}">${cells.join('')}</div>`;
}

// ── Daily totals & weekly means ────────────────────────────
// Fuel is logged per meal, so average the *day* first, then the week. Summing
// meals and averaging weeks would let a heavily-logged day dominate.
export function dailyTotals(records = [], pick) {
  const totals = new Map();
  for (const record of records ?? []) {
    if (!record?.date) continue;
    const value = typeof pick === 'function' ? pick(record) : record[pick];
    if (!isNum(value)) continue;
    totals.set(record.date, (totals.get(record.date) ?? 0) + Number(value));
  }
  return totals;
}

export function weeklyFromDaily(daily = new Map(), {
  weeks = 12,
  endDate = localDateStr(),
  combine = 'mean',
} = {}) {
  return weekStarts(weeks, endDate).map(start => {
    const values = [];
    for (let i = 0; i < 7; i++) {
      const value = daily.get(addDays(start, i));
      if (value !== undefined) values.push(value);
    }
    if (!values.length) return null;
    return combine === 'mean' ? round1(sum(values) / values.length) : sum(values);
  });
}

export function weeklyProtein(fuelLogs = [], opts = {}) {
  return weeklyFromDaily(dailyTotals(fuelLogs, 'proteinGrams'), { ...opts, combine: 'mean' });
}

export function weeklyWater(waterLogs = [], opts = {}) {
  return weeklyFromDaily(dailyTotals(waterLogs, 'glasses'), { ...opts, combine: 'mean' });
}

export function weeklyBodyweight(recoveryLogs = [], opts = {}) {
  return weeklyValues(recoveryLogs, 'weightLbs', { ...opts, combine: 'mean' });
}

// ── Bodyweight points ──────────────────────────────────────
// Weight is optional on a check-in. A missing weight is not a missing day, so
// these only ever contain actual weigh-ins.
export function weightPoints(recoveryLogs = []) {
  return (recoveryLogs ?? [])
    .filter(log => log?.date && isNum(log.weightLbs))
    .map(log => ({ date: log.date, weightLbs: Number(log.weightLbs) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight(recoveryLogs = []) {
  const points = weightPoints(recoveryLogs);
  return points.length ? points[points.length - 1] : null;
}

// Descriptive change across the visible window: first → last weigh-in.
// Deliberately does not label a direction as good or bad.
export function weightChange(recoveryLogs = [], { weeks = 12, endDate = localDateStr() } = {}) {
  const start = weekStarts(weeks, endDate)[0];
  const points = weightPoints(recoveryLogs).filter(p => p.date >= start && p.date <= endDate);
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  return {
    from: first.weightLbs,
    to: last.weightLbs,
    delta: round1(last.weightLbs - first.weightLbs),
    weighIns: points.length,
    firstDate: first.date,
    lastDate: last.date,
  };
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
