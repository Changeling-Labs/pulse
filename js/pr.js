// ── Dynamic PR engine ──────────────────────────────────────
//
// An exercise can declare several metrics at once (schema v4): a rower
// logs distance AND time, a sled push the same. PRs are therefore computed
// per metric, off the fields each set actually carries — not off the
// singular `type`:
//
//   strength   best volume set      (weight × reps, lbs — ignores 1RM tiers;
//                                    those stay in db.js getAllPRs)
//   timed      best (lowest) duration
//   distance   best (longest) distance
//   output     best (highest) output
//
// Every metric honours the time window (sinceDate) with an all-time
// fallback, mirroring getPR(). Pure functions — no IndexedDB, unit-tested.

const FIELD = {
  strength: 'weight',   // presence test needs weight *and* reps
  timed: 'duration',
  distance: 'distance',
  output: 'output',
};

function hasMetric(set, metric) {
  if (metric === 'strength') {
    return Number.isFinite(set.weight) && Number.isFinite(set.reps) && set.reps >= 1;
  }
  return Number.isFinite(set[FIELD[metric]]) && set[FIELD[metric]] > 0;
}

function score(set, metric) {
  switch (metric) {
    case 'strength': return set.weight * set.reps;
    case 'timed':    return set.duration;
    case 'distance': return set.distance;
    case 'output':   return set.output;
    default:         return NaN;
  }
}

// Lower is better for time, higher for everything else.
const better = (metric) =>
  metric === 'timed' ? (a, b) => a < b : (a, b) => a > b;

function pick(candidates, metric) {
  if (candidates.length === 0) return null;
  const isBetter = better(metric);
  return candidates.reduce((best, cur) => (isBetter(cur.value, best.value) ? cur : best));
}

// Best value for one metric, as { value, date, setId } or null.
// Windowed first (when sinceDate is set), all-time fallback.
export function metricPR(sets, metric, sinceDate = null) {
  const candidates = sets
    .filter(s => hasMetric(s, metric))
    .map(s => ({ value: score(s, metric), date: s.date, setId: s.id ?? null }));

  if (sinceDate) {
    const windowed = candidates.filter(c => c.date >= sinceDate);
    if (windowed.length > 0) return pick(windowed, metric);
  }
  return pick(candidates, metric);
}

// PRs for every metric the exercise declares (or that its sets carry).
// Returns e.g. { strength: {value, date, setId}, distance: {...} }.
export function metricPRs(sets, metrics, sinceDate = null) {
  const out = {};
  for (const metric of metrics) {
    const pr = metricPR(sets, metric, sinceDate);
    if (pr) out[metric] = pr;
  }
  return out;
}
