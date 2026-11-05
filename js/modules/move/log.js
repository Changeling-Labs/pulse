// ── Pulse Move: Log tab ──────────────────────────────────
import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { dw, fmtDate, todayStr, fmtDuration, sinceDate } from '../../kernel/helpers.js';
import { getSets, getAllPRs, deleteSet, deleteSetsByGroup } from '../../db.js';
import { groupByCircuit } from '../../circuits.js';
import { openLogModal } from './modal.js';
import { displayDistance } from '../../calc.js';

function setDetail(s) {
  const parts = [];
  if (Number.isFinite(s.reps)) parts.push(`${s.reps} rep${s.reps !== 1 ? 's' : ''}`);
  if (Number.isFinite(s.duration)) parts.push(fmtDuration(s.duration));
  if (Number.isFinite(s.distance)) parts.push(displayDistance(s.distance, state.unit));
  if (Number.isFinite(s.output)) parts.push(`${s.output} output`);
  return parts.join(' · ') || '—';
}

// The right-aligned "headline" for a set row: weight for lifts, otherwise
// the first non-strength metric the record carries.
function setPrimary(s) {
  if (Number.isFinite(s.weight)) return dw(s.weight);
  if (Number.isFinite(s.distance)) return displayDistance(s.distance, state.unit);
  if (Number.isFinite(s.duration)) return fmtDuration(s.duration);
  if (Number.isFinite(s.output)) return String(s.output);
  return '';
}


// ── Log Tab ────────────────────────────────────────────────
async function renderLog(el) {
  const allSets = await getSets();
  const today = todayStr();
  const todaySets = allSets.filter(s => s.date === today).reverse();

  let prCount = 0;
  for (const s of todaySets) {
    if (!Number.isFinite(s.weight) || !Number.isFinite(s.reps)) continue;   // weight PRs only
    const prs = await getAllPRs(s.exerciseId, sinceDate());
    if (prs[s.reps] === s.weight) prCount++;
  }

  const exMap = Object.fromEntries(state.exercises.map(e => [e.id, e.name]));
  const blocks = groupByCircuit(todaySets);

  const setsHtml = blocks.length === 0
    ? `<div class="empty"><div class="icon">🏋️</div><p>No sets logged today yet.</p></div>`
    : blocks.map(block =>
        block.groupId ? circuitBlockHtml(block, exMap) : setRowHtml(block.items[0], exMap)
      ).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${todaySets.length}</div><div class="stat-lbl">sets today</div></div>
      <div class="stat"><div class="stat-val">${new Set(todaySets.map(s => s.exerciseId)).size}</div><div class="stat-lbl">exercises</div></div>
      <div class="stat"><div class="stat-val accent">${prCount}</div><div class="stat-lbl">PRs today</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
        <button class="btn btn-ghost rest-start" onclick="startRest()">⏱ Rest</button>
      </div>
      ${setsHtml}
    </div>`;

}

// One standalone set.
function setRowHtml(s, exMap) {
  return `
    <div class="log-item" data-id="${s.id}">
      <div>
        <div class="log-name">${exMap[s.exerciseId] || '?'}</div>
        <div class="log-detail">${setDetail(s)} · ${fmtDate(s.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="log-weight">${setPrimary(s)}</div>
        <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteSetItem(${s.id})">✕</button>
      </div>
    </div>`;
}

// A circuit (superset): the sets sharing one groupId, shown round by round.
function circuitBlockHtml(block, exMap) {
  const exerciseCount = new Set(block.items.map(s => s.exerciseId)).size;
  const rest = block.restSec ? ` · ${formatClock(block.restSec * 1000)} rest` : '';
  const rows = block.items.map(s => `
    <div class="circuit-row">
      <span class="circuit-round">R${s.round ?? 1}</span>
      <span class="circuit-name">${exMap[s.exerciseId] || '?'}</span>
      <span class="circuit-detail">${setDetail(s)}</span>
      <span class="circuit-weight">${setPrimary(s)}</span>
    </div>`).join('');

  return `
    <div class="circuit-block">
      <div class="circuit-head">
        <div>
          <span class="circuit-title">Circuit</span>
          <span class="circuit-meta">${block.rounds} round${block.rounds !== 1 ? 's' : ''} · ${exerciseCount} exercises${rest}</span>
        </div>
        <div class="circuit-actions">
          <button class="btn btn-ghost circuit-run" onclick="runCircuit('${block.groupId}')">▶ Run</button>
          <button class="btn btn-ghost circuit-delete" onclick="deleteCircuit('${block.groupId}')">Delete</button>
        </div>
      </div>
      ${rows}
    </div>`;
}

window.deleteSetItem = async function(id) {
  if (!confirm('Delete this set?')) return;
  await deleteSet(id);
  renderTab('log');
};

window.deleteCircuit = async function(groupId) {
  if (!confirm('Delete this whole circuit?')) return;
  await deleteSetsByGroup(groupId);
  renderTab('log');
};



registerTab('log', { title: 'Pulse', fabLabel: 'Log a set', fabAction: () => openLogModal(), render: renderLog });
