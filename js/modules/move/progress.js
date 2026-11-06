// ── Pulse Move: Progress tab (records + trends) ────────────
// One tab, two views. Records is the old PRs screen rebuilt on the same data;
// Trends is descriptive only — no score, no prediction, no advice.
import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { dw, sinceDate, fmtDate, fmtDuration } from '../../kernel/helpers.js';
import { displayDistance } from '../../calc.js';
import { getSets, getAllPRs, setPref } from '../../db.js';
import { METRIC_LABELS } from '../../schema.js';
import { metricPR } from '../../pr.js';
import { strengthExercises } from './shared.js';
import { localDateStr } from '../../dates.js';
import {
  RANGE_OPTIONS, rangeFor, trainingWeeks, exerciseProgression, progressionDelta,
  trainingDelta, deltaBasis, formatDelta, sparkline, barSeries,
} from '../../trends.js';

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
// Two charts and a summary row, all computed on-device from the sets the tab
// already loads. The delta compares the selected window with the window
// immediately before it, so "4 weeks" means 4 weeks vs the previous 4.
async function renderTrends(el, seg) {
  const range = rangeFor(state.trendRange);
  const today = localDateStr();
  const sets = await getSets();

  const rangeToggle = `
    <div class="range-toggle progress-range" role="tablist" aria-label="Trend range">
      ${RANGE_OPTIONS.map(r => `
        <button role="tab" aria-selected="${r.id === range.id}" class="${r.id === range.id ? 'active' : ''}" onclick="setTrendRange('${r.id}')">${r.label}</button>
      `).join('')}
    </div>`;

  if (sets.length === 0) {
    el.innerHTML = `${seg}${rangeToggle}
      <div class="card">
        <div class="empty">
          <div class="icon">📈</div>
          <p>No sets logged yet. Trends appear once you have a couple of weeks of training.</p>
        </div>
      </div>`;
    return;
  }

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
  const completeWeeks = current.filter(w => !w.partial);
  const sessionsPerWeek = completeWeeks.length
    ? Math.round((completeWeeks.reduce((n, w) => n + w.sessions, 0) / completeWeeks.length) * 10) / 10
    : 0;

  const weekLabels = current.map(w =>
    `Week of ${fmtDate(w.weekStart)} — ${w.sets ? `${w.sets} sets · ${fmtTonnage(w.tonnage)}` : 'no sets'}${w.partial ? ' (partial)' : ''}`
  );
  const tonnageBars = barSeries(currentTonnage, { labels: weekLabels, label: 'Weekly tonnage' });
  const sessionBars = barSeries(current.map(w => (w.sets > 0 ? w.sessions : null)), {
    labels: current.map(w => `Week of ${fmtDate(w.weekStart)} — ${w.sessions} session${w.sessions === 1 ? '' : 's'}`),
    label: 'Sessions per week',
    max: 7,
  });

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

  el.innerHTML = `${seg}${rangeToggle}
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
      ${tonnageBars}
      <div class="trend-foot">Mon–Sun. The current week is partial; gaps are weeks with no sets.</div>
    </div>

    <div class="card">
      <div class="card-label">Sessions per week</div>
      ${sessionBars}
      <div class="trend-foot">A session is a day with at least one set. Nothing here is a target.</div>
    </div>

    <div class="card">
      <div class="card-label">Lift progression · top set</div>
      ${liftCards || '<div class="empty"><p>Log the same lift on two different days to see its line.</p></div>'}
      ${liftCards ? '<div class="trend-foot">Top set per session, last 8 sessions in range. Bodyweight and timed work are not plotted.</div>' : ''}
    </div>`;
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
