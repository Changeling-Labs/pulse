// ── Pulse Move: PRs tab ────────────────────────────────────
import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { dw, sinceDate, fmtDate, fmtDuration } from '../../kernel/helpers.js';
import { displayDistance } from '../../calc.js';
import { getSets, getAllPRs } from '../../db.js';
import { metricPR } from '../../pr.js';
import { strengthExercises } from './shared.js';

// ── PRs Tab ────────────────────────────────────────────────
const PR_METRIC_LABEL = { timed: 'Best time', distance: 'Best distance', output: 'Best output' };

function fmtMetricPR(metric, value) {
  if (metric === 'timed') return fmtDuration(value);
  if (metric === 'distance') return displayDistance(value, state.unit);
  return String(value);
}

async function renderPRs(el) {
  const since = sinceDate();
  const windowLabel = { '90': 'Last 3 months', '180': 'Last 6 months', '365': 'Last year', 'all': 'All time' }[state.prWindow] || 'Last year';

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

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">PR window</div>
      <select onchange="setPRWindow(this.value)">
        <option value="90"  ${state.prWindow==='90' ?'selected':''}>Last 3 months</option>
        <option value="180" ${state.prWindow==='180'?'selected':''}>Last 6 months</option>
        <option value="365" ${state.prWindow==='365'?'selected':''}>Last year</option>
        <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
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
      <div class="empty"><p>No sets logged yet. Start logging to see your PRs here.</p></div>
    </div>` : ''}`;
}

window.setPRWindow = async function(val) {
  state.prWindow = val;
  await setPref('prWindow', val);
  renderTab('prs');
};



registerTab('prs', { title: 'Personal Records', render: renderPRs });
