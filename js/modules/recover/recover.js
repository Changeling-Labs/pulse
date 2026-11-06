// ── Pulse Recover: daily check-in + trends ─────────────────
// One record per local calendar day in the `pulse-recover` DB. The form
// edits either today or a day picked from history; stats are pure
// (js/recover.js). Saving is explicit so half-finished check-ins never sync.

import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { fmtDate, todayStr } from '../../kernel/helpers.js';
import { getRecoveryLog, getRecoveryLogs, saveRecoveryLog, deleteRecoveryLog, getSets } from '../../db.js';
import {
  seriesFor, periodStats, comparePeriods, sorenessLabel, severity,
  barFraction, formatMetric, describeDelta, METRICS,
} from '../../recover.js';
import { buildInsight } from '../../insights.js';
import { toKg, toLbs, displayWeight } from '../../calc.js';

let windowDays = 7;
let editingDate = null;      // null = today
let draft = null;            // { date, sleepHours, soreness, restingHr, note }
let savedAt = null;          // ms timestamp of the last successful save

const esc = s => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const hasAnyValue = d => !!d && (
  Number.isFinite(d.sleepHours) || Number.isFinite(d.soreness) ||
  Number.isFinite(d.restingHr) || Number.isFinite(d.weightLbs) ||
  !!String(d.note ?? '').trim()
);

const sleepText = v => (Number.isFinite(v) ? `${Number.isInteger(v) ? v : v.toFixed(1)}h` : '—');
const rhrText = v => (Number.isFinite(v) ? `${Math.round(v)} bpm` : '—');
const weightText = v => (Number.isFinite(v) ? displayWeight(v, state.unit) : '—');

// The input edits in display units; storage stays in pounds.
const weightDisplayValue = lbs => {
  if (!Number.isFinite(lbs)) return '';
  const value = state.unit === 'kg' ? toKg(lbs) : Math.round(lbs * 10) / 10;
  return String(value);
};

function dateLabel(date) {
  const label = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  return date === todayStr() ? `Today · ${label}` : label;
}

function shortDate(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Form ───────────────────────────────────────────────────
function metricRow(key, label, note, valueText) {
  const isSet = Number.isFinite(draft[key]);
  return `
    <div class="recover-row">
      <div class="recover-row-label">
        <span>${label}</span>
        <small>${note}</small>
      </div>
      <div class="recover-step">
        <button type="button" class="recover-step-btn" aria-label="Decrease ${label}"
          onclick="recoverStep('${key}', ${key === 'sleepHours' ? -0.5 : -1})">−</button>
        <div class="recover-value" id="recover-${key === 'sleepHours' ? 'sleep' : 'rhr'}-val">${valueText}</div>
        <button type="button" class="recover-step-btn" aria-label="Increase ${label}"
          onclick="recoverStep('${key}', ${key === 'sleepHours' ? 0.5 : 1})">+</button>
      </div>
      <button type="button" class="recover-clear${isSet ? '' : ' hidden'}"
        id="recover-${key === 'sleepHours' ? 'sleep' : 'rhr'}-clear"
        onclick="recoverClearMetric('${key}')" aria-label="Clear ${label}">✕</button>
    </div>`;
}

// Bodyweight is the one check-in field typed rather than stepped: nobody
// wants to tap their way from 60 to 82 kg. Clearable like the others.
function weightRow() {
  const isSet = Number.isFinite(draft.weightLbs);
  const min = state.unit === 'kg' ? 22.7 : 50;
  const max = state.unit === 'kg' ? 453.6 : 1000;
  return `
    <div class="recover-row">
      <div class="recover-row-label">
        <span>Bodyweight</span>
        <small>optional · same time of day</small>
      </div>
      <div class="recover-weight">
        <input type="number" id="recover-weight" class="recover-weight-input"
          inputmode="decimal" step="0.1" min="${min}" max="${max}"
          value="${weightDisplayValue(draft.weightLbs)}" placeholder="—"
          oninput="recoverWeight(this.value)"
          aria-label="Bodyweight in ${state.unit === 'kg' ? 'kilograms' : 'pounds'}" />
        <span class="recover-weight-unit">${state.unit}</span>
      </div>
      <button type="button" class="recover-clear${isSet ? '' : ' hidden'}"
        id="recover-weight-clear"
        onclick="recoverClearMetric('weightLbs')" aria-label="Clear bodyweight">✕</button>
    </div>`;
}

function checkinCard(dateLabelText, isToday) {
  const chips = Array.from({ length: 10 }, (_, i) => i + 1).map(n => `
    <button type="button" data-n="${n}"
      class="sore-chip sev-${severity(n)}${draft.soreness === n ? ' active' : ''}"
      onclick="recoverSetSoreness(${n})" aria-label="Soreness ${n}">${n}</button>`).join('');

  return `
    <div class="card recover-card">
      <div class="card-head">
        <div>
          <div class="card-label" style="margin-bottom:3px">${dateLabelText}</div>
          <div class="recover-hint">${isToday ? 'How did you recover?' : 'Editing an earlier check-in'}</div>
        </div>
        ${isToday ? '' : `<button class="btn btn-ghost rest-start" onclick="recoverToday()">Today</button>`}
      </div>

      ${metricRow('sleepHours', 'Sleep', 'last night', sleepText(draft.sleepHours))}
      ${metricRow('restingHr', 'Resting HR', 'on waking', rhrText(draft.restingHr))}
      ${weightRow()}

      <div class="recover-block">
        <div class="recover-row-label" style="width:100%">
          <span>Soreness</span>
          <small id="recover-soreness-label">${Number.isFinite(draft.soreness) ? sorenessLabel(draft.soreness) : 'not logged'}</small>
        </div>
        <div class="sore-chips">${chips}</div>
      </div>

      <input class="recover-note" id="recover-note" type="text" maxlength="500"
        placeholder="Notes — sleep quality, a niggle, stress…"
        value="${esc(draft.note)}" oninput="recoverNote(this.value)" />

      <button type="button" class="btn btn-primary btn-full recover-save" id="recover-save"
        onclick="recoverSave()" ${hasAnyValue(draft) ? '' : 'disabled'}>Save check-in</button>
      ${savedAt ? `<div class="recover-saved">Saved ${new Date(savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>` : ''}
    </div>`;
}

// ── Summary ────────────────────────────────────────────────
function deltaText(key, delta, better) {
  if (!Number.isFinite(delta)) return '<span class="recover-delta muted">no prior window</span>';
  if (delta === 0) return '<span class="recover-delta muted">same as previous</span>';
  const improving = better === 'higher' ? delta > 0 : delta < 0;
  return `<span class="recover-delta ${improving ? 'good' : 'warn'}">${describeDelta(key, delta)}</span>`;
}

function summaryStat(label, key, value, delta, better) {
  return `
    <div class="recover-stat">
      <div class="recover-stat-val">${formatMetric(key, value)}</div>
      <div class="recover-stat-lbl">${label}</div>
      ${deltaText(key, delta, better)}
    </div>`;
}

function summaryCard(logs, today) {
  const cmp = comparePeriods(logs, windowDays, today);
  const c = cmp.current;
  const coverage = c.logged === 0
    ? 'No check-ins in this window yet.'
    : `${c.logged} of ${c.days} days logged${c.shortNights ? ` · ${c.shortNights} night${c.shortNights === 1 ? '' : 's'} under 7h` : ''}`;

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">${windowDays}-day snapshot</div>
        <div class="range-toggle">
          <button type="button" class="${windowDays === 7 ? 'active' : ''}" onclick="recoverWindow(7)">7d</button>
          <button type="button" class="${windowDays === 30 ? 'active' : ''}" onclick="recoverWindow(30)">30d</button>
        </div>
      </div>
      <div class="recover-stats">
        ${summaryStat('Sleep', 'sleepHours', c.sleepAvg, cmp.deltas.sleep, 'higher')}
        ${summaryStat('Soreness', 'soreness', c.sorenessAvg, cmp.deltas.soreness, 'lower')}
        ${summaryStat('Resting HR', 'restingHr', c.restingHrAvg, cmp.deltas.restingHr, 'lower')}
      </div>
      <div class="recover-coverage">${coverage}</div>
    </div>`;
}

// ── Trends ─────────────────────────────────────────────────
function trendBar(metric, log) {
  const value = log?.[metric.key];
  if (!Number.isFinite(value)) return '<div class="trend-gap" aria-hidden="true"></div>';
  const pct = Math.round(barFraction(metric.key, value) * 100);
  const cls = metric.key === 'soreness' ? ` sev-${severity(value)}` : '';
  const title = `${shortDate(log.date)} — ${formatMetric(metric.key, value)}`;
  return `<div class="trend-bar${cls}" style="height:${pct}%" title="${title}" aria-label="${title}"></div>`;
}

function trendsCard(logs, today) {
  const series = seriesFor(logs, windowDays, today);
  const stats = periodStats(logs, windowDays, today);
  const avgFor = { sleepHours: stats.sleepAvg, soreness: stats.sorenessAvg, restingHr: stats.restingHrAvg };

  return `
    <div class="card">
      <div class="card-label">Trends · ${shortDate(series[0].date)} – ${shortDate(series.at(-1).date)}</div>
      ${METRICS.map(metric => `
        <div class="trend">
          <div class="trend-head">
            <span class="trend-name">${metric.label}</span>
            <span class="trend-avg">${avgFor[metric.key] === null ? '—' : `${formatMetric(metric.key, avgFor[metric.key])} avg`}</span>
          </div>
          <div class="trend-bars">${series.map(point => trendBar(metric, point.log)).join('')}</div>
        </div>`).join('')}
    </div>`;
}

// ── Training ↔ recovery ────────────────────────────────────
// Descriptive only: how recovery markers looked in heavier vs lighter
// weeks. No score, no prediction, no advice — see js/insights.js.
function insightRow(label, key, high, low) {
  return `
    <div class="insight-row">
      <span class="insight-metric">${label}</span>
      <span class="insight-val">${formatMetric(key, high)}</span>
      <span class="insight-val">${formatMetric(key, low)}</span>
    </div>`;
}

function insightsCard(sets, logs, today) {
  const insight = buildInsight(sets, logs, { weeks: 12, endDate: today });

  if (!insight.ok) {
    const hint = Number.isFinite(insight.weeksNeeded)
      ? `${insight.weeksNeeded} more week${insight.weeksNeeded === 1 ? '' : 's'} to go.`
      : 'Keep logging sets and check-ins.';
    return `
      <div class="card">
        <div class="card-label">Training ↔ recovery</div>
        <div class="recover-empty">${esc(insight.reason)}<br>${esc(hint)}</div>
      </div>`;
  }

  const rows = [
    ['Soreness', 'soreness', insight.high.sorenessAvg, insight.low.sorenessAvg],
    ['Sleep', 'sleepHours', insight.high.sleepAvg, insight.low.sleepAvg],
    ['Resting HR', 'restingHr', insight.high.restingHrAvg, insight.low.restingHrAvg],
  ].filter(([, , high, low]) => Number.isFinite(high) || Number.isFinite(low));

  return `
    <div class="card">
      <div class="card-label">Training ↔ recovery</div>
      <div class="insight-head">
        <span></span>
        <span class="insight-col">Heavier weeks<small>${insight.high.setsAvg} sets/wk</small></span>
        <span class="insight-col">Lighter weeks<small>${insight.low.setsAvg} sets/wk</small></span>
      </div>
      ${rows.map(([label, key, high, low]) => insightRow(label, key, high, low)).join('')}
      <div class="insight-lines">
        ${insight.lines.map(line => `<p>${esc(line)}</p>`).join('')}
      </div>
      <div class="insight-foot">
        Based on ${insight.eligible.length} completed weeks with both training and a check-in.
        Association only — recovery has many other inputs.
      </div>
    </div>`;
}

// ── History ────────────────────────────────────────────────
function historyRow(log) {
  const parts = [
    Number.isFinite(log.sleepHours) ? sleepText(log.sleepHours) : null,
    Number.isFinite(log.soreness) ? `${log.soreness}/10` : null,
    Number.isFinite(log.restingHr) ? `${log.restingHr} bpm` : null,
    Number.isFinite(log.weightLbs) ? weightText(log.weightLbs) : null,
  ].filter(Boolean);
  if (!parts.length && log.note) parts.push(log.note);

  return `
    <div class="recover-history-row">
      <button type="button" class="recover-history-main" onclick="recoverEditDay('${log.date}')">
        <span class="recover-history-date">${fmtDate(log.date)}</span>
        <span class="recover-history-vals">${esc(parts.join(' · '))}</span>
      </button>
      <button type="button" class="recover-history-del" onclick="recoverDeleteDay('${log.date}')"
        aria-label="Delete check-in for ${log.date}">✕</button>
    </div>`;
}

function historyCard(logs) {
  if (logs.length === 0) {
    return `
      <div class="card">
        <div class="card-label">Recent check-ins</div>
        <div class="recover-empty">Nothing logged yet — the card above is the whole routine.</div>
      </div>`;
  }
  return `
    <div class="card">
      <div class="card-label">Recent check-ins</div>
      ${logs.slice(-8).reverse().map(historyRow).join('')}
    </div>`;
}

// ── Tab ────────────────────────────────────────────────────
async function renderRecover(el) {
  const today = todayStr();
  const date = editingDate ?? today;
  const [logs, existing, sets] = await Promise.all([
    getRecoveryLogs(),
    getRecoveryLog(date),
    getSets(),          // read-only, for the training ↔ recovery card
  ]);

  draft = {
    date,
    sleepHours: existing?.sleepHours ?? null,
    soreness: existing?.soreness ?? null,
    restingHr: existing?.restingHr ?? null,
    weightLbs: existing?.weightLbs ?? null,
    note: existing?.note ?? '',
  };

  el.innerHTML = `
    ${checkinCard(dateLabel(date), date === today)}
    ${summaryCard(logs, today)}
    ${trendsCard(logs, today)}
    ${insightsCard(sets, logs, today)}
    ${historyCard(logs)}`;

  // The saved banner belongs to one render only.
  savedAt = null;
}

// ── Draft helpers ──────────────────────────────────────────
function syncFormDom() {
  if (!draft) return;
  // Any edit invalidates the "Saved" banner from the previous save.
  document.querySelector('.recover-saved')?.remove();
  const sleepVal = document.getElementById('recover-sleep-val');
  const rhrVal = document.getElementById('recover-rhr-val');
  if (sleepVal) sleepVal.textContent = sleepText(draft.sleepHours);
  if (rhrVal) rhrVal.textContent = rhrText(draft.restingHr);

  // Never rewrite the field the user is typing in — that moves the caret.
  const weightInput = document.getElementById('recover-weight');
  if (weightInput && document.activeElement !== weightInput) {
    weightInput.value = weightDisplayValue(draft.weightLbs);
  }

  const sleepClear = document.getElementById('recover-sleep-clear');
  const rhrClear = document.getElementById('recover-rhr-clear');
  const weightClear = document.getElementById('recover-weight-clear');
  sleepClear?.classList.toggle('hidden', !Number.isFinite(draft.sleepHours));
  rhrClear?.classList.toggle('hidden', !Number.isFinite(draft.restingHr));
  weightClear?.classList.toggle('hidden', !Number.isFinite(draft.weightLbs));

  document.querySelectorAll('.sore-chip').forEach(chip => {
    chip.classList.toggle('active', Number(chip.dataset.n) === draft.soreness);
  });
  const soreLabel = document.getElementById('recover-soreness-label');
  if (soreLabel) soreLabel.textContent = Number.isFinite(draft.soreness) ? sorenessLabel(draft.soreness) : 'not logged';

  const save = document.getElementById('recover-save');
  if (save) save.disabled = !hasAnyValue(draft);
}

// ── Handlers (inline onclick) ──────────────────────────────
window.recoverStep = function(key, delta) {
  if (!draft) return;
  const base = Number.isFinite(draft[key]) ? draft[key] : (key === 'sleepHours' ? 7.5 : 60);
  const next = Math.round((base + delta) * 4) / 4;
  draft[key] = key === 'sleepHours'
    ? Math.max(0, Math.min(14, next))
    : Math.max(30, Math.min(220, Math.round(next)));
  syncFormDom();
};

window.recoverWeight = function(value) {
  if (!draft) return;
  const n = parseFloat(value);
  draft.weightLbs = Number.isFinite(n)
    ? (state.unit === 'kg' ? toLbs(n) : n)
    : null;
  const clear = document.getElementById('recover-weight-clear');
  clear?.classList.toggle('hidden', !Number.isFinite(draft.weightLbs));
  document.querySelector('.recover-saved')?.remove();
  const save = document.getElementById('recover-save');
  if (save) save.disabled = !hasAnyValue(draft);
};

window.recoverSetSoreness = function(n) {
  if (!draft) return;
  draft.soreness = draft.soreness === n ? null : n;
  syncFormDom();
};

window.recoverClearMetric = function(key) {
  if (!draft) return;
  draft[key] = null;
  syncFormDom();
};

window.recoverNote = function(value) {
  if (!draft) return;
  draft.note = value;
  syncFormDom();
};

window.recoverSave = async function() {
  if (!draft || !hasAnyValue(draft)) return;
  const btn = document.getElementById('recover-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await saveRecoveryLog(draft);
    savedAt = Date.now();
    await renderTab('recover');
  } catch (err) {
    alert(err?.message ?? String(err));
    if (btn) { btn.disabled = false; btn.textContent = 'Save check-in'; }
  }
};

window.recoverWindow = function(days) {
  windowDays = days === 30 ? 30 : 7;
  renderTab('recover');
};

window.recoverEditDay = function(date) {
  editingDate = date;
  savedAt = null;
  renderTab('recover');
};

window.recoverToday = function() {
  editingDate = null;
  savedAt = null;
  renderTab('recover');
};

window.recoverDeleteDay = async function(date) {
  if (!confirm(`Delete the check-in for ${fmtDate(date)}?`)) return;
  await deleteRecoveryLog(date);
  if (editingDate === date) editingDate = null;
  savedAt = null;
  renderTab('recover');
};

registerTab('recover', { title: 'Recover', render: renderRecover });
