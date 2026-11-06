// ── Pulse insights: training volume ↔ recovery ─────────────
// Descriptive only. This module answers "in weeks when you trained more,
// how did sleep / soreness / resting HR look?" — it never produces a
// readiness score, a prediction, or training advice. Associations between
// weekly volume and recovery have many other inputs; the UI says so.
//
// Pure: no DOM, no IDB, no network. Unit-tested in test/insights.test.js.
//
// Weeks are local calendar weeks, Monday → Sunday. Only *completed* weeks
// are used, so a light Monday morning never reads as a light week.

import { localDateStr } from './dates.js';
import { meanOf } from './recover.js';

const MS_DAY = 86400000;

function parse(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

function format(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shift(dateStr, days) {
  return format(new Date(parse(dateStr).getTime() + days * MS_DAY));
}

// Monday of the week containing `dateStr` (Sunday belongs to the week that
// started six days earlier).
export function mondayOf(dateStr) {
  const day = parse(dateStr).getUTCDay();          // 0 = Sunday
  return shift(dateStr, -((day + 6) % 7));
}

// ── Volume ─────────────────────────────────────────────────
// Tonnage only exists for weighted reps. Bodyweight, timed, distance and
// output sets still count as *sets* — that is the universal measure and the
// one the split uses (a hard calisthenics week is a hard week).
export function setTonnage(set) {
  const weight = Number(set?.weight);
  const reps = Number(set?.reps);
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0;
  if (weight < 0 || reps <= 0) return 0;
  return weight * reps;
}

// ── Weekly series ──────────────────────────────────────────
// Returns `weeks` completed weeks, oldest → newest. Each entry carries the
// week's volume plus that week's average recovery markers (null when the
// marker was never logged that week).
export function weekSeries(sets = [], recoveryLogs = [], weeks = 12, endDate = localDateStr()) {
  const n = Math.max(1, Math.min(52, Math.round(weeks)));
  const lastStart = shift(mondayOf(endDate), -7);   // last completed week

  const recoveryByDate = new Map((recoveryLogs ?? []).map(l => [l.date, l]));
  const setsByDate = new Map();
  for (const s of sets ?? []) {
    if (!s?.date) continue;
    if (!setsByDate.has(s.date)) setsByDate.set(s.date, []);
    setsByDate.get(s.date).push(s);
  }

  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = shift(lastStart, -i * 7);
    const days = Array.from({ length: 7 }, (_, d) => shift(start, d));

    let count = 0;
    let tonnage = 0;
    let sessions = 0;
    const recovery = [];

    for (const day of days) {
      const daySets = setsByDate.get(day) ?? [];
      if (daySets.length) sessions++;
      for (const s of daySets) {
        count++;
        tonnage += setTonnage(s);
      }
      const log = recoveryByDate.get(day);
      if (log) recovery.push(log);
    }

    out.push({
      weekStart: start,
      weekEnd: shift(start, 6),
      sets: count,
      tonnage,
      sessions,
      recoveryDays: recovery.length,
      sleepAvg: avgOf(recovery, 'sleepHours'),
      sorenessAvg: avgOf(recovery, 'soreness'),
      restingHrAvg: avgOf(recovery, 'restingHr'),
    });
  }
  return out;
}

const avgOf = (rows, key) => round1(meanOf(rows.map(r => r[key])));

function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

// A week can only take part in the comparison if it had both training and
// at least one check-in — otherwise "recovery in light weeks" is undefined.
export function eligibleWeeks(weeks = []) {
  return weeks.filter(w => w.sets > 0 && w.recoveryDays > 0);
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

// ── Correlation ────────────────────────────────────────────
// Pearson r over paired weeks. Returns null for fewer than `minPairs` pairs
// or when either series has no variance.
export function pearson(pairs, minPairs = 5) {
  const xs = [];
  const ys = [];
  for (const [x, y] of pairs ?? []) {
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
  if (xs.length < minPairs) return null;

  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;

  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

export function correlationLabel(r) {
  if (!Number.isFinite(r)) return 'not enough weeks';
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'strongly';
  if (abs >= 0.4) return 'fairly';
  return 'barely';
}

// ── Summary ────────────────────────────────────────────────
// Minimum four eligible weeks: with fewer, a median split is two weeks on
// each side and the comparison is noise dressed up as a finding.
export const MIN_WEEKS = 4;
export const MIN_PAIRS = 5;

export function buildInsight(sets = [], recoveryLogs = [], { weeks = 12, endDate = localDateStr() } = {}) {
  const series = weekSeries(sets, recoveryLogs, weeks, endDate);
  const eligible = eligibleWeeks(series);
  const medianSets = median(eligible.map(w => w.sets));

  const base = { series, eligible, medianSets };

  if (eligible.length < MIN_WEEKS) {
    return {
      ...base,
      ok: false,
      reason: `This needs at least ${MIN_WEEKS} completed weeks with both training and a check-in.`,
      weeksNeeded: MIN_WEEKS - eligible.length,
    };
  }

  const high = eligible.filter(w => w.sets >= medianSets);
  const low = eligible.filter(w => w.sets < medianSets);

  // Every week identical volume → no contrast to describe.
  if (low.length === 0) {
    return { ...base, ok: false, reason: 'Your weekly volume has been almost identical — no contrast to compare yet.' };
  }

  const stats = group => ({
    weeks: group.length,
    setsAvg: round1(meanOf(group.map(w => w.sets))),
    tonnageAvg: Math.round(meanOf(group.map(w => w.tonnage)) ?? 0),
    sleepAvg: round1(meanOf(group.map(w => w.sleepAvg))),
    sorenessAvg: round1(meanOf(group.map(w => w.sorenessAvg))),
    restingHrAvg: round1(meanOf(group.map(w => w.restingHrAvg))),
  });

  const correlations = {
    sleep: pearson(eligible.map(w => [w.sets, w.sleepAvg]), MIN_PAIRS),
    soreness: pearson(eligible.map(w => [w.sets, w.sorenessAvg]), MIN_PAIRS),
    restingHr: pearson(eligible.map(w => [w.sets, w.restingHrAvg]), MIN_PAIRS),
  };

  return {
    ...base,
    ok: true,
    high: stats(high),
    low: stats(low),
    correlations,
    lines: insightLines(stats(high), stats(low), correlations),
  };
}

function fmt(key, value) {
  if (!Number.isFinite(value)) return '—';
  if (key === 'sleep') return `${value}h`;
  if (key === 'soreness') return `${value}/10`;
  if (key === 'restingHr') return `${Math.round(value)} bpm`;
  return String(value);
}

// Plain language, no advice. Each line states an association and leaves the
// interpretation to the reader.
function insightLines(high, low, r) {
  const lines = [];

  if (Number.isFinite(high.sorenessAvg) && Number.isFinite(low.sorenessAvg)) {
    const more = high.sorenessAvg > low.sorenessAvg;
    const gap = Math.abs(high.sorenessAvg - low.sorenessAvg);
    lines.push(
      `In heavier weeks you averaged ${fmt('soreness', high.sorenessAvg)} soreness, ` +
      `${more ? 'higher' : 'lower'} than ${fmt('soreness', low.sorenessAvg)} in lighter weeks` +
      `${gap < 0.3 ? ' (essentially the same)' : ''}.`
    );
  }

  if (Number.isFinite(high.sleepAvg) && Number.isFinite(low.sleepAvg)) {
    const gap = high.sleepAvg - low.sleepAvg;
    if (Math.abs(gap) >= 0.2) {
      lines.push(
        `Sleep averaged ${fmt('sleep', high.sleepAvg)} in heavier weeks vs ${fmt('sleep', low.sleepAvg)} in lighter ones.`
      );
    } else {
      lines.push(`Sleep barely changed between heavier and lighter weeks (${fmt('sleep', high.sleepAvg)} vs ${fmt('sleep', low.sleepAvg)}).`);
    }
  }

  const tracked = [
    ['soreness', 'Soreness'],
    ['sleep', 'Sleep'],
    ['restingHr', 'Resting HR'],
  ].filter(([key]) => Number.isFinite(r[key]));

  if (tracked.length) {
    const [key, name] = tracked.sort((a, b) => Math.abs(r[b[0]]) - Math.abs(r[a[0]]))[0];
    const dir = r[key] > 0 ? 'rose' : 'fell';
    lines.push(`${name} ${correlationLabel(r[key])} followed weekly volume (r = ${r[key].toFixed(2)}): it ${dir} as volume rose.`);
  }

  return lines;
}
