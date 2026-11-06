// ── Pulse Settings tab ─────────────────────────────────────
import { state, renderTab, registerTab } from '../kernel/shell.js';
import { getExercises, getPref, setPref } from '../db.js';
import { exportBackup, importBackup } from '../backup.js';
import { SET_TYPES, METRIC_LABELS } from '../schema.js';
import { VERSION, BUILD_DATE } from '../version.js';
import { REST_OPTIONS } from './move/timer.js';
import { getSyncStatus, sendMagicLink, signOutSync, syncNow, resetCloudToLocal } from '../sync.js';

function syncCardHtml(status) {
  if (status.signedIn) {
    const last = status.lastSyncAt
      ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}`
      : 'Not synced yet';
    const queue = status.queueCount > 0 ? `${status.queueCount} pending` : 'up to date';
    return `
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">${status.email}</div>
        <div class="setting-sub">${last} · ${queue}</div>
      </div>
      <button class="btn btn-primary" style="padding:8px 14px" onclick="syncPulseNow()">Sync now</button>
    </div>
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Sign out</div>
        <div class="setting-sub">The session leaves this device; your cloud rows stay until you delete the project from Supabase.</div>
      </div>
      <button class="btn btn-ghost" onclick="signOutPulseSync()">Sign out</button>
    </div>
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Automatic sync</div>
        <div class="setting-sub">On — Pulse pushes after every save, when this tab reopens, and when your connection returns. Nothing leaves before you sign in.</div>
      </div>
    </div>
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label" style="color:#f87171">Reset cloud to match this device</div>
        <div class="setting-sub">Deletes every row Pulse has stored for you in Supabase, then re-uploads what's on this device. Use this after restoring a backup. No undo.</div>
      </div>
      <button class="btn btn-ghost" style="color:#f87171;border-color:#f8717144;white-space:nowrap" onclick="resetCloudPulse()">Reset</button>
    </div>
    <div id="sync-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px"></div>`;
  }
  return `
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Cloud sync</div>
        <div class="setting-sub">Optional. Sign in and your sets, exercises, fuel logs, hydration and equipment roam across devices. Nothing ever leaves this device until you sign in. Works on every device, including offline training sessions.</div>
      </div>
    </div>
    <div class="setting-row" style="gap:8px">
      <input type="email" id="sync-email" placeholder="you@example.com" style="flex:1;min-width:0" />
      <button class="btn btn-primary" style="padding:8px 14px;white-space:nowrap" onclick="sendPulseSyncLink()">Send magic link</button>
    </div>
    <div id="sync-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px"></div>`;
}

// ── Settings ───────────────────────────────────────────────
async function renderSettings(el) {
  const syncStatus = await getSyncStatus();
  const syncCard = `<div class="card-label" style="margin-bottom:8px">Cloud Sync</div>
    <div class="card" id="sync-card">${syncCardHtml(syncStatus)}</div>`;
  el.innerHTML = `
    ${syncCard}
    <div class="card-label" style="margin-bottom:8px">Preferences</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Units</div><div class="setting-sub">Weight display throughout the app</div></div>
        <select style="width:80px" onchange="setUnit(this.value)">
          <option value="lbs" ${state.unit==='lbs'?'selected':''}>lbs</option>
          <option value="kg"  ${state.unit==='kg' ?'selected':''}>kg</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Default PR window</div><div class="setting-sub">Used in PRs tab and planner</div></div>
        <select style="width:130px" onchange="setPRWindow(this.value)">
          <option value="90"  ${state.prWindow==='90' ?'selected':''}>3 months</option>
          <option value="180" ${state.prWindow==='180'?'selected':''}>6 months</option>
          <option value="365" ${state.prWindow==='365'?'selected':''}>1 year</option>
          <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Rest timer</div><div class="setting-sub">Counts down after you save a set</div></div>
        <select style="width:130px" onchange="setRestSeconds(this.value)">
          ${REST_OPTIONS.map(o => `<option value="${o.value}" ${String(state.restSeconds) === String(o.value) ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Equipment</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Bar weight</div><div class="setting-sub">Used in plate calculator</div></div>
        <input type="number" value="${state.equipment.barWeight}" style="width:70px;text-align:right" onchange="setBarWeight(this.value)" />
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="setting-label">Plates available (per side)</div>
        <div id="plate-editor"></div>
        <button class="btn btn-ghost" style="padding:4px 0" onclick="addPlateType()">+ Add plate size</button>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Exercises</div>
    <div class="card">
      ${state.exercises.map(e => `
        <div class="setting-row" style="gap:8px">
          <div style="flex:1">
            <div class="setting-label">${e.name}</div>
            <div class="metric-chips">
              ${SET_TYPES.map(m => `<button type="button" class="metric-chip${e.metrics.includes(m) ? ' active' : ''}" onclick="toggleExerciseMetric(${e.id}, '${m}')">${METRIC_LABELS[m]}</button>`).join('')}
            </div>
          </div>
          <button class="btn btn-ghost" style="color:var(--text-3);font-size:18px" onclick="deleteEx(${e.id})">✕</button>
        </div>`).join('')}
      <button class="btn btn-ghost" style="padding:4px 0;margin-top:6px" onclick="openAddExercise()">+ Add exercise</button>
    </div>

    <div class="card-label" style="margin-bottom:8px">Data</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Export backup</div><div class="setting-sub">Download all your data as JSON</div></div>
        <button class="btn" onclick="doExport()">Export</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Import backup</div><div class="setting-sub">Restore or merge from a JSON file</div></div>
        <button class="btn" onclick="doImport()">Import</button>
      </div>
    </div>

    <div style="text-align:center;padding:24px 0 4px;font-size:12px;color:var(--text-3)">
      Pulse v${VERSION} · ${BUILD_DATE}
    </div>
    <div style="text-align:center;padding:0 0 8px;font-size:12px">
      <a href="../privacy.html" style="color:var(--text-2);text-decoration:underline">Privacy Policy</a>
      <div style="margin-top:6px;color:var(--text-3);font-size:11px">A <a href="https://changelinglabs.com" style="color:var(--glow);text-decoration:none">Changeling Labs</a> app · <a href="https://changelinglabs.com" style="color:var(--text-2);text-decoration:none">changelinglabs.com</a></div>
    </div>`;

  renderPlateEditor();
}

window.doExport = async function() {
  try { await exportBackup(); } catch(e) { alert('Export failed: ' + e.message); }
};

window.doImport = function() {
  importBackup(async () => {
    state.exercises = await getExercises();
    state.equipment = await getEquipment();
    renderTab('settings');
  });
};

function renderPlateEditor() {
  const el = document.getElementById('plate-editor');
  if (!el) return;
  el.innerHTML = state.equipment.plates.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="number" value="${p.weight}" style="width:70px;text-align:right" onchange="updatePlate(${i},'weight',this.value)" /> lb
      <span style="color:var(--text-2);font-size:13px">×</span>
      <input type="number" value="${p.count}" min="0" max="20" style="width:50px;text-align:center" onchange="updatePlate(${i},'count',this.value)" />
      <button class="btn btn-ghost" style="color:var(--text-3)" onclick="removePlate(${i})">✕</button>
    </div>`).join('');
}

window.setUnit = async function(val) { state.unit = val; await setPref('unit', val); };
window.setBarWeight = async function(val) {
  const n = parseFloat(val); if (isNaN(n)) return;
  state.equipment.barWeight = n;
  const { saveEquipment } = await import('../db.js');
  await saveEquipment(state.equipment);
};
window.updatePlate = async function(i, field, val) {
  const n = parseFloat(val); if (isNaN(n)) return;
  state.equipment.plates[i][field] = n;
  const { saveEquipment } = await import('../db.js');
  await saveEquipment(state.equipment);
};
window.removePlate = async function(i) {
  state.equipment.plates.splice(i, 1);
  const { saveEquipment } = await import('../db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};
window.addPlateType = async function() {
  state.equipment.plates.push({ weight: 2.5, count: 2 });
  const { saveEquipment } = await import('../db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};
// Toggle one metric on/off for an exercise. At least one metric must stay
// declared — removing the last one gets a nudge, not a broken exercise.
window.toggleExerciseMetric = async function(id, metric) {
  const exercise = state.exercises.find(e => e.id === id);
  if (!exercise) return;
  const metrics = new Set(exercise.metrics || ['strength']);
  if (metrics.has(metric)) {
    if (metrics.size === 1) { alert('An exercise needs at least one metric.'); return; }
    metrics.delete(metric);
  } else {
    metrics.add(metric);
  }
  await updateExerciseMetrics(id, [...metrics]);
  state.exercises = await getExercises();
  renderTab('settings');
};

window.deleteEx = async function(id) {
  if (!confirm('Delete this exercise? Your logged sets will remain.')) return;
  const { deleteExercise } = await import('../db.js');
  await deleteExercise(id);
  state.exercises = await getExercises();
  renderTab('settings');
};
window.openAddExercise = function() {
  const name = prompt('Exercise name:');
  if (!name?.trim()) return;
  (async () => {
    await import('../db.js').then(m => m.addExercise(name.trim()));
    state.exercises = await getExercises();
    renderTab('settings');
  })();
};



async function updateSyncCard() {
  const card = document.getElementById('sync-card');
  if (!card) return null;
  try {
    card.innerHTML = syncCardHtml(await getSyncStatus());
    return document.getElementById('sync-status');
  } catch (e) {
    card.innerHTML = `<div class="setting-row"><div class="setting-sub">Sync unavailable: ${e.message}</div></div>`;
    return null;
  }
}

window.sendPulseSyncLink = async function() {
  const input = document.getElementById('sync-email');
  let status = document.getElementById('sync-status');
  const email = input?.value?.trim() ?? '';
  if (status) status.textContent = 'Sending…';
  try {
    await sendMagicLink(email);
    if (status) status.textContent = `Magic link sent to ${email} — it opens this device, signed in.`;
    input.value = '';
  } catch (e) {
    if (status) status.textContent = e.message;
  }
};

window.syncPulseNow = async function() {
  const card = document.getElementById('sync-card');
  if (!card) return;
  card.innerHTML = '<div class="setting-row"><div class="setting-sub">Talking to Supabase…</div></div>';
  try {
    const s = await syncNow();
    const status = await updateSyncCard();
    if (status) status.textContent = `Synced — pushed ${s.pushed}, applied ${s.applied}, deletes ${s.deletes}.`;
  } catch (e) {
    const status = await updateSyncCard();
    if (status) status.textContent = `Sync failed: ${e?.message ?? e}`;
  }
};

window.resetCloudPulse = async function() {
  const ok = confirm('Reset cloud sync to match this device?\n\nEvery row Pulse has stored for you in Supabase will be deleted, then re-uploaded from this device. This cannot be undone.');
  if (!ok) return;
  const card = document.getElementById('sync-card');
  if (card) card.innerHTML = '<div class="setting-row"><div class="setting-sub">Resetting…</div></div>';
  try {
    const reset = await resetCloudToLocal();
    const sync = await syncNow();
    const status = await updateSyncCard();
    if (status) status.textContent = `Cloud reset — deleted ${reset.deleted}, re-pushed ${sync.pushed}.`;
  } catch (e) {
    const status = await updateSyncCard();
    if (status) status.textContent = `Reset failed: ${e?.message ?? e}`;
  }
};

window.signOutPulseSync = async function() {
  try {
    await signOutSync();
  } catch (e) {
    console.warn('sign-out failed', e);
  }
  await updateSyncCard();
};

registerTab('settings', { title: 'Settings', render: renderSettings });
