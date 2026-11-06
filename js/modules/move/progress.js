// ── Pulse Move: Progress tab (records + trends) ────────────
// One tab, two views. Records is the old PRs screen rebuilt on the same data;
// Trends is descriptive only — no score, no prediction, no advice.
import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { dw, sinceDate, fmtDate, fmtDuration } from '../../kernel/helpers.js';
import { displayDistance, displayWeight } from '../../calc.js';
import { getSets, getAllPRs, setPref, getRecoveryLogs, getFuelLogs, getWaterLogs } from '../../db.js';
import { METRIC_LABELS } from '../../schema.js';
import { metricPR } from '../../pr.js';
import { strengthExercises } from './shared.js';
import { localDateStr } from '../../dates.js';
import {
  RANGE_OPTIONS, rangeFor, weekStarts, trainingWeeks, exerciseProgression, progressionDelta,
  trainingDelta, deltaBasis, formatDelta, sparkline, barSeries,
  heatmap, weeklyProtein, weeklyWater, weeklyWholeShare,
  weeklyBodyweight, weeklyValues, latestWeight, weightChange,
} from '../../trends.js';
import { METRICS, formatMetric } from '../../recover.js';

const PR_METRIC_LABEL = { timed: 'Best time', distance: 'Best distance', output: 'Best output' };
const WINDOW_LABEL = { '90': 'Last 3 months', '180': 'Last 6 months', '365': 'Last year', 'all': 'All time' };

function fmtMetricPR(metric, value) {
  if (metric === 'timed') return fmtDuration(value);
  if (metric === 'distance') return displayDistance(value, state.unit);
  return String(value);
}

// Tonnage is pounds × reps in storage. Show it in the user's unit, with
// thousands separators — the raw number gets long fast.
function fmtTonnage(lbs) {
  const value = Number(lbs);
  if (!Number.isFinite(value)) return '—';
  if (state.unit === 'kg') return `${Math.round(value * 0.45359237).toLocaleString('en-US')} kg`;
  return `${Math.round(value).toLocaleString('en-US')} lb`;
}

function viewSwitch(view) {
  return `
    <div class="range-toggle progress-seg" role="tablist" aria-label="Progress view">
      <button role="tab" aria-selected="${view === 'records'}" class="${view === 'records' ? 'active' : ''}" onclick="setProgressView('records')">Records</button>
      <button role="tab" aria-selected="${view === 'trends'}" class="${view === 'trends' ? 'active' : ''}" onclick="setProgressView('trends')">Trends</button>
    </div>`;
}

// ── Records ────────────────────────────────────────────────
async function recordsHtml() {
  const since = sinceDate();
  const windowLabel = WINDOW_LABEL[state.prWindow] || 'Last year';

  // One getSets() pass, bucketed by exercise — the PR maths below reads it.
  const allSets = await getSets();
  const byExercise = new Map();
  for (const s of allSets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
    byExercise.get(s.exerciseId).push(s);
  }

  // Strength card — 1RM/3RM/5RM + best volume set — for lifts only.
  const strengthRows = await Promise.all(strengthExercises().map(async ex => ({
    ex,
    prs: await getAllPRs(ex.id, since),
    vol: metricPR(byExercise.get(ex.id) || [], 'strength', since),
  })));
  const hasStrength = strengthRows.some(r => r.prs[1] || r.prs[3] || r.prs[5] || r.vol);

  // Metric card — best value per non-strength metric any exercise declares.
  const metricRows = [];
  for (const ex of state.exercises) {
    for (const metric of (ex.metrics || []).filter(m => m !== 'strength')) {
      const best = metricPR(byExercise.get(ex.id) || [], metric, since);
      if (best) metricRows.push({ ex, metric, best });
    }
  }

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">PR window</div>
      <select onchange="setPRWindow(this.value)">
        <option value="90"  ${state.prWindow==='90' ?'selected':''}>Last 3 months</option>
        <option value="180" ${state.prWindow==='180'?'selected':''}>Last 6 months</option>
        <option value="365" ${state.prWindow==='365'?'selected':''}>Last year</option>
        <option value="all" ${state.prWindow==='all' ?'selected':''}>All time</option>
      </select>
    </div>
    ${hasStrength ? `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">${windowLabel} · Strength</div>
      ${strengthRows.map(({ ex, prs, vol }) => `
        <div class="pr-row">
          <div class="pr-name">${ex.name}</div>
          <div class="pr-cells">
            ${[1,3,5].map(r => `
              <div class="pr-cell">
                <div class="pr-cell-lbl">${r}RM</div>
                <div class="pr-cell-val${prs[r] ? '' : ' empty'}">${prs[r] ? dw(prs[r]) : '—'}</div>
              </div>`).join('')}
            <div class="pr-cell">
              <div class="pr-cell-lbl">Vol</div>
              <div class="pr-cell-val${vol ? '' : ' empty'}">${vol ? dw(vol.value) : '—'}</div>
            </div>
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${metricRows.length ? `
    <div class="card">
      <div class="card-label">${windowLabel} · Metric bests</div>
      ${metricRows.map(({ ex, metric, best }) => `
        <div class="pr-row">
          <div>
            <div class="pr-name">${ex.name}</div>
            <div class="pr-cell-lbl" style="margin-top:2px">${METRIC_LABELS[metric]}</div>
          </div>
          <div class="pr-cells">
            <div class="pr-cell">
              <div class="pr-cell-lbl">${PR_METRIC_LABEL[metric]}</div>
              <div class="pr-cell-val">${fmtMetricPR(metric, best.value)}</div>
            </div>
            <div class="pr-cell">
              <div class="pr-cell-lbl">Date</div>
              <div class="pr-cell-val">${fmtDate(best.date)}</div>
            </div>
          </div>
        </div>`).join('')}
    </div>` : ''}
    ${!hasStrength && metricRows.length === 0 ? `
    <div class="card">
      <div class="empty"><p>No sets logged yet. Start logging to see your records here.</p></div>
    </div>` : ''}`;
}

// ── Trends ─────────────────────────────────────────────────
// Descriptive charts over one window, all computed on-device. Training is the
// anchor; body and fuel cards appear when those stores have data. The delta
// compares complete weeks in the window with the same number of weeks before,
// so a Monday morning never reads as a collapse.
async function renderTrends(el, seg) {
  const range = rangeFor(state.trendRange);
  const today = localDateStr();
  const [sets, recoveryLogs, fuelLogs, waterLogs] = await Promise.all([
    getSets(), getRecoveryLogs(), getFuelLogs(), getWaterLogs(),
  ]);

  const rangeToggle = `
    <div class="range-toggle progress-range" role="tablist" aria-label="Trend range">
      ${RANGE_OPTIONS.map(r => `
        <button role="tab" aria-selected="${r.id === range.id}" class="${r.id === range.id ? 'active' : ''}" onclick="setTrendRange('${r.id}')">${r.label}</button>
      `).join('')}
    </div>`;

  const hasTraining = sets.length > 0;
  const hasRecovery = recoveryLogs.length > 0;
  const hasFuel = fuelLogs.length > 0 || waterLogs.length > 0;

  if (!hasTraining && !hasRecovery && !hasFuel) {
    el.innerHTML = `${seg}${rangeToggle}
      <div class="card">
        <div class="empty">
          <div class="icon">📈</div>
          <p>Nothing to trend yet. Log a set, a meal or a check-in and this view fills in.</p>
        </div>
      </div>`;
    return;
  }

  const starts = weekStarts(range.weeks, today);
  const weekLabel = (i, text) => `Week of ${fmtDate(starts[i])} — ${text}`;

  // ── Training ──
  let trainingHtml = '';
  let trainingDayCount = 0;

  if (hasTraining) {
    const wide = trainingWeeks(sets, { weeks: range.weeks * 2, endDate: today });
    const current = wide.slice(-range.weeks);
    const previous = wide.slice(0, range.weeks);

    // A week with no sets is a gap, not a zero-tonnage week.
    const currentTonnage = current.map(w => (w.sets > 0 ? w.tonnage : null));
    const delta = trainingDelta(current, previous);
    const basis = deltaBasis(current);

    const totalSets = current.reduce((n, w) => n + w.sets, 0);
    const totalTonnage = current.reduce((n, w) => n + w.tonnage, 0);
    const trainingDays = current.reduce((n, w) => n + w.days, 0);
    trainingDayCount = trainingDays;
    const completeWeeks = current.filter(w => !w.partial);
    const sessionsPerWeek = completeWeeks.length
      ? Math.round((completeWeeks.reduce((n, w) => n + w.sessions, 0) / completeWeeks.length) * 10) / 10
      : 0;

    const weekLabels = current.map(w =>
      `Week of ${fmtDate(w.weekStart)} — ${w.sets ? `${w.sets} sets · ${fmtTonnage(w.tonnage)}` : 'no sets'}${w.partial ? ' (partial)' : ''}`
    );
    const sessionLabels = current.map(w =>
      `Week of ${fmtDate(w.weekStart)} — ${w.sets ? `${w.sessions} session${w.sessions === 1 ? '' : 's'}` : 'no sets'}`
    );

    const since = current[0]?.weekStart ?? null;
    const lifts = strengthExercises()
      .map(ex => ({ ex, points: exerciseProgression(sets, ex.id, { sessions: 8, since }) }))
      .filter(({ points }) => points.length >= 2)
      .sort((a, b) => b.points.length - a.points.length)
      .slice(0, 6);

    const liftCards = lifts.map(({ ex, points }) => {
      const first = points[0];
      const last = points[points.length - 1];
      const deltaPct = progressionDelta(points);
      return `
        <div class="lift-row">
          <div class="lift-head">
            <span class="lift-name">${ex.name}</span>
            <span class="lift-val">${dw(last.weight)} <span class="lift-reps">× ${last.reps}</span></span>
          </div>
          ${sparkline(points.map(p => p.weight), { label: `${ex.name} top set, ${points.length} sessions` })}
          <div class="lift-foot">
            ${fmtDate(first.date)} ${dw(first.weight)} → ${fmtDate(last.date)} ${dw(last.weight)}
            ${deltaPct === null ? '' : ` · ${formatDelta(deltaPct)}`}
            · ${points.length} session${points.length === 1 ? '' : 's'}
          </div>
        </div>`;
    }).join('');

    trainingHtml = `
      <div class="stat-grid four">
        <div class="stat"><div class="stat-val">${trainingDays}</div><div class="stat-lbl">Training days</div></div>
        <div class="stat"><div class="stat-val">${totalSets}</div><div class="stat-lbl">Sets</div></div>
        <div class="stat"><div class="stat-val sm">${fmtTonnage(totalTonnage)}</div><div class="stat-lbl">Tonnage</div></div>
        <div class="stat"><div class="stat-val">${sessionsPerWeek}</div><div class="stat-lbl">Sessions / wk</div></div>
      </div>

      <div class="card">
        <div class="card-label">Weekly tonnage</div>
        <div class="trend-head">
          <span class="trend-name">${range.label} · ${fmtDate(current[0].weekStart)} – ${fmtDate(current.at(-1).weekEnd)}</span>
          <span class="trend-avg">${delta === null
            ? 'no earlier complete weeks to compare'
            : `${formatDelta(delta)} vs previous ${basis} week${basis === 1 ? '' : 's'}`}</span>
        </div>
        ${barSeries(currentTonnage, { labels: weekLabels, label: 'Weekly tonnage' })}
        <div class="trend-foot">Mon–Sun. The current week is partial; gaps are weeks with no sets.</div>
      </div>

      <div class="card">
        <div class="card-label">Sessions per week</div>
        ${barSeries(current.map(w => (w.sets > 0 ? w.sessions : null)), {
          labels: sessionLabels, label: 'Sessions per week', max: 7,
        })}
        <div class="trend-foot">A session is a day with at least one set. Nothing here is a target.</div>
      </div>

      <div class="card">
        <div class="card-label">Lift progression · top set</div>
        ${liftCards || '<div class="empty"><p>Log the same lift on two different days to see its line.</p></div>'}
        ${liftCards ? '<div class="trend-foot">Top set per session, last 8 sessions in range. Bodyweight and timed work are not plotted.</div>' : ''}
      </div>`;
  }

  // ── Consistency heatmap ──
  const consistencyCard = hasTraining ? `
    <div class="card">
      <div class="card-label">Consistency</div>
      ${heatmap(sets, { weeks: range.weeks, endDate: today, label: `Training days over ${range.label}` })}
      <div class="heat-foot">
        <span>${trainingDayCount} training day${trainingDayCount === 1 ? '' : 's'} in ${range.label}</span>
        <span>Darker = more sets</span>
      </div>
      <div class="trend-foot">One column per week, Monday → Sunday. Outlined cells have not happened yet. A blank cell is a day with no sets — not a verdict.</div>
    </div>` : '';

  // ── Bodyweight ──
  const weightSeries = weeklyBodyweight(recoveryLogs, { weeks: range.weeks, endDate: today });
  const latest = latestWeight(recoveryLogs);
  const change = weightChange(recoveryLogs, { weeks: range.weeks, endDate: today });

  let changeText = 'Log on two different weeks to see a change.';
  if (change) {
    const sign = change.delta > 0 ? '+' : change.delta < 0 ? '−' : '';
    const magnitude = displayWeight(Math.abs(change.delta), state.unit);
    changeText = `${sign}${magnitude} across ${change.weighIns} weigh-in${change.weighIns === 1 ? '' : 's'} since ${fmtDate(change.firstDate)}`;
  }

  const bodyweightCard = `
    <div class="card">
      <div class="card-label">Bodyweight</div>
      ${latest ? `
        <div class="lift-head">
          <span class="lift-name">Latest · ${fmtDate(latest.date)}</span>
          <span class="lift-val">${displayWeight(latest.weightLbs, state.unit)}</span>
        </div>
        ${sparkline(weightSeries, { height: 40, label: `Weekly average bodyweight over ${range.label}` })}
        <div class="lift-foot">${changeText}</div>
        <div class="trend-foot">Weekly average of the bodyweight on your Recover check-ins. Shown for information — up or down is not automatically good or bad.</div>
      ` : '<div class="empty"><p>Add bodyweight to a Recover check-in to see this line.</p></div>'}
    </div>`;

  // ── Body signals ──
  const signalSeries = new Map(METRICS.map(metric => [
    metric.key,
    weeklyValues(recoveryLogs, metric.key, { weeks: range.weeks, endDate: today, combine: 'mean' }),
  ]));
  const hasSignals = [...signalSeries.values()].some(series => series.some(v => v !== null));

  const signalRows = METRICS.map(metric => {
    const series = signalSeries.get(metric.key);
    const logged = series.filter(v => v !== null);
    const latestValue = logged.length ? logged[logged.length - 1] : null;
    return `
      <div class="lift-row">
        <div class="lift-head">
          <span class="lift-name">${metric.label}</span>
          <span class="lift-val">${latestValue === null ? '—' : formatMetric(metric.key, latestValue)} <span class="lift-reps">weekly avg</span></span>
        </div>
        ${sparkline(series, { label: `${metric.label} weekly average` })}
        <div class="lift-foot">${logged.length < 2
          ? 'Log another week to see a line.'
          : `${logged.length} weeks logged in ${range.label}`}</div>
      </div>`;
  }).join('');

  const bodySignalsCard = `
    <div class="card">
      <div class="card-label">Body signals</div>
      ${hasSignals ? signalRows : '<div class="empty"><p>Log sleep, soreness or resting HR in Recover to see these lines.</p></div>'}
      ${hasSignals ? '<div class="trend-foot">Weekly averages of what you logged. Soreness has no universal good direction, so none is implied.</div>' : ''}
    </div>`;

  // ── Fuel ──
  const proteinSeries = weeklyProtein(fuelLogs, { weeks: range.weeks, endDate: today });
  const waterSeries = weeklyWater(waterLogs, { weeks: range.weeks, endDate: today });
  const wholeSeries = weeklyWholeShare(fuelLogs, { weeks: range.weeks, endDate: today });

  const fuelRow = (title, values, format, { max = null, foot = '' } = {}) => {
    const logged = values.filter(v => v !== null);
    const mean = logged.length
      ? Math.round((logged.reduce((a, b) => a + b, 0) / logged.length) * 10) / 10
      : null;
    return `
      <div class="trend">
        <div class="trend-head">
          <span class="trend-name">${title}</span>
          <span class="trend-avg">${mean === null ? '—' : `${format(mean)} avg`}</span>
        </div>
        ${barSeries(values, {
          labels: values.map((v, i) => weekLabel(i, v === null ? 'no logs' : format(v))),
          label: title,
          max,
        })}
        ${foot ? `<div class="trend-foot">${foot}</div>` : ''}
      </div>`;
  };

  const hasFuelData = proteinSeries.some(v => v !== null) ||
    waterSeries.some(v => v !== null) ||
    wholeSeries.some(v => v !== null);

  const fuelCard = `
    <div class="card">
      <div class="card-label">Fuel</div>
      ${hasFuelData ? `
        ${fuelRow('Protein · daily mean', proteinSeries, v => `${Math.round(v)} g`)}
        ${fuelRow('Water · daily mean', waterSeries, v => `${Math.round(v * 10) / 10} glasses`, { max: 8 })}
        ${fuelRow('Whole-food share', wholeSeries, v => `${Math.round(v)}%`, { max: 100 })}
        <div class="trend-foot">Meals are totalled per day, then averaged per week. A gap is a week with no logs, not a zero.</div>
      ` : '<div class="empty"><p>Log a meal or some water to see these bars.</p></div>'}
    </div>`;

  el.innerHTML = `${seg}${rangeToggle}${trainingHtml}${consistencyCard}${bodyweightCard}${bodySignalsCard}${fuelCard}`;
}

// ── Tab ────────────────────────────────────────────────────
async function renderProgress(el) {
  const view = state.progressView === 'trends' ? 'trends' : 'records';
  const seg = viewSwitch(view);

  if (view === 'trends') {
    await renderTrends(el, seg);
    return;
  }

  el.innerHTML = seg + await recordsHtml();
}

window.setProgressView = function(view) {
  state.progressView = view === 'trends' ? 'trends' : 'records';
  setPref('progressView', state.progressView).catch(() => {});
  renderTab('progress');
};

window.setTrendRange = function(id) {
  state.trendRange = rangeFor(id).id;
  setPref('trendRange', state.trendRange).catch(() => {});
  renderTab('progress');
};

window.setPRWindow = async function(val) {
  state.prWindow = val;
  await setPref('prWindow', val);
  renderTab('progress');
};

registerTab('progress', { title: 'Progress', render: renderProgress });
