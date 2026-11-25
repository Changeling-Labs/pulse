// ── Pulse Settings tab ─────────────────────────────────────
import { state, renderTab, registerTab } from '../kernel/shell.js';
import {
  getExercises, getPref, setPref,
  getSets, getFuelLogs, getWaterLogs, getRecoveryLogs,
} from '../db.js';
import { exportBackup, importBackup } from '../backup.js';
import { SET_TYPES, METRIC_LABELS } from '../schema.js';
import { VERSION, BUILD_DATE } from '../version.js';
import { REST_OPTIONS } from './move/timer.js';
import { getSyncStatus, sendSignInCode, verifyEmailCode, signOutSync, syncNow, resetCloudToLocal } from '../sync.js';
import { normalizeEmail, isValidEmail } from '../sync-core.js';
import { setsCsv, fuelCsv, waterCsv, recoveryCsv, weeklyMarkdown, mondayOf } from '../exports.js';
import { downloadText } from '../download.js';
import { localDateStr } from '../dates.js';
import { primeAudio, cue, audioStatus } from '../cues.js';

// ── Cloud Sync card ────────────────────────────────────────
// Sign-in is an emailed code, not a magic link. An installed iOS web app has
// its own storage; a link always opens in Safari (or the default browser) and
// signs in a different copy of Pulse. A code typed here signs in the copy the
// user is actually holding, and `autocomplete="one-time-code"` lets the phone
// offer the code straight from the email.
const PENDING_EMAIL_KEY = 'pulse-sync-pending-email';
const PENDING_EMAIL_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
let pendingEmail = readPendingEmail();
let lastEmail = pendingEmail;
let resendAvailableAt = 0;
let verifyingCode = false;

// localStorage, not sessionStorage: switching to Mail can get the installed
// app suspended, and asking for a second email just to reach the code field
// runs into Supabase's send-rate limit. The 30-minute TTL keeps a stale email
// from reopening the code step forever.
function readPendingEmail() {
  try {
    const raw = localStorage.getItem(PENDING_EMAIL_KEY);
    if (!raw) return '';
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.email !== 'string' || !Number.isFinite(saved.at)) return '';
    if (Date.now() - saved.at > PENDING_EMAIL_TTL_MS) {
      localStorage.removeItem(PENDING_EMAIL_KEY);
      return '';
    }
    return saved.email;
  } catch {
    return '';
  }
}

function setPendingEmail(email) {
  pendingEmail = String(email ?? '');
  if (pendingEmail) lastEmail = pendingEmail;
  try {
    if (pendingEmail) {
      localStorage.setItem(PENDING_EMAIL_KEY, JSON.stringify({ email: pendingEmail, at: Date.now() }));
    } else {
      localStorage.removeItem(PENDING_EMAIL_KEY);
    }
  } catch {
    /* private mode: the in-memory value still carries this page */
  }
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function isInstalledApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone === true
  );
}

function syncCardHtml(status) {
  if (status.signedIn) {
    const last = status.lastSyncAt
      ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}`
      : 'Not synced yet';
    const queue = status.queueCount > 0 ? `${status.queueCount} pending` : 'up to date';
    return `
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">${escapeHtml(status.email || 'Signed in')}</div>
        <div class="setting-sub">${last} · ${queue}</div>
      </div>
      <button class="btn btn-primary" style="padding:8px 14px" onclick="syncPulseNow()">Sync now</button>
    </div>
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Sign out</div>
        <div class="setting-sub">Signs out this device only — other phones and browsers stay signed in. Your cloud rows stay until you delete the project from Supabase.</div>
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
    <div id="sync-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px" aria-live="polite"></div>`;
  }

  if (pendingEmail) {
    return `
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Enter your sign-in code</div>
        <div class="setting-sub">Use the code sent to <b>${escapeHtml(pendingEmail)}</b>. Enter it below to sign in ${isInstalledApp() ? 'this installed app' : 'this browser'}.</div>
      </div>
    </div>
    <div class="setting-row" style="gap:8px">
      <input type="text" id="sync-code" class="sync-code" inputmode="numeric" autocomplete="one-time-code"
        autocapitalize="off" spellcheck="false" maxlength="14" placeholder="123456"
        aria-label="Sign-in code from email"
        onkeydown="if(event.key==='Enter'){event.preventDefault();verifyPulseSyncCode();}" />
      <button class="btn btn-primary" id="sync-verify" style="padding:8px 14px;white-space:nowrap" onclick="verifyPulseSyncCode()">Sign in</button>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:2px 0 4px">
      <button class="btn btn-ghost" id="sync-resend" style="padding:4px 0" onclick="sendPulseSyncCode(true)">Resend code</button>
      <button class="btn btn-ghost" style="padding:4px 0" onclick="cancelPulseSyncCode()">Use a different email</button>
    </div>
    ${isInstalledApp()
      ? '<div class="setting-sub" style="padding:0 0 4px">Use the code, not the email link — a link opens Safari, which is a separate copy of Pulse.</div>'
      : ''}
    <div id="sync-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px" aria-live="polite"></div>`;
  }

  return `
    <div class="setting-row" style="gap:8px">
      <div style="flex:1">
        <div class="setting-label">Cloud sync</div>
        <div class="setting-sub">Optional. Sets, exercises, fuel, hydration, recovery check-ins and equipment roam across the devices you sign in on. Nothing leaves this device until you do. Use the same email on every device — we email a short code, with no password and no link to open.</div>
      </div>
    </div>
    <div class="setting-row" style="gap:8px">
      <input type="email" id="sync-email" value="${escapeHtml(lastEmail)}" placeholder="you@example.com" autocomplete="email" inputmode="email"
        autocapitalize="off" spellcheck="false" style="flex:1;min-width:0"
        onkeydown="if(event.key==='Enter'){event.preventDefault();sendPulseSyncCode();}" />
      <button class="btn btn-primary" id="sync-send" style="padding:8px 14px;white-space:nowrap" onclick="sendPulseSyncCode()">Email me a code</button>
    </div>
    <div class="setting-sub" style="padding:0 0 4px">
      ${isInstalledApp()
        ? 'The code signs in this installed app directly. An email link would open Safari, which is a separate copy of Pulse.'
        : 'The code signs in this browser. If you have Pulse on your home screen, sign in there separately — installed apps keep their own sign-in.'}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:2px 0 4px">
      <button class="btn btn-ghost" style="padding:4px 0" onclick="useExistingPulseCode()">I already have a code</button>
    </div>
    <div id="sync-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px" aria-live="polite"></div>`;
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

    <div class="card-label" style="margin-bottom:8px">Sound</div>
    <div class="card">
      <div class="setting-row" style="gap:8px">
        <div style="flex:1">
          <div class="setting-label">Test sound</div>
          <div class="setting-sub">Plays the finish cue and reports what the audio engine is doing. On iPhone, the ring/silent switch still wins until a sound has played — Pulse asks Safari for a playback session, which keeps timer cues audible.</div>
        </div>
        <button class="btn" onclick="testSound()">Play</button>
      </div>
      <div id="sound-status" style="font-size:12px;color:var(--text-2);padding:4px 0;min-height:16px"></div>
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
          <button class="btn btn-ghost" style="color:var(--text-3);font-size:18px" aria-label="Delete exercise" onclick="deleteEx(${e.id})">✕</button>
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
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:9px">
        <div>
          <div class="setting-label">Open exports</div>
          <div class="setting-sub">Read-only snapshots — CSV for spreadsheets, Markdown for your vault</div>
        </div>
        <div class="export-buttons">
          <button class="btn btn-ghost" onclick="exportCsv('sets')">Sets</button>
          <button class="btn btn-ghost" onclick="exportCsv('fuel')">Fuel</button>
          <button class="btn btn-ghost" onclick="exportCsv('water')">Water</button>
          <button class="btn btn-ghost" onclick="exportCsv('recovery')">Recover</button>
          <button class="btn btn-ghost" onclick="exportWeekNote()">This week (MD)</button>
        </div>
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

// ── Open exports ───────────────────────────────────────────
// Local-only: read the stores, build a string, hand it to the browser. The
// JSON backup remains the restore path; these are deliberately one-way.
const safe = fn => async (...args) => {
  try { await fn(...args); } catch (e) { alert('Export failed: ' + e.message); }
};

window.exportCsv = safe(async function(domain) {
  const today = localDateStr();

  if (domain === 'sets') {
    const [sets, exercises] = await Promise.all([getSets(), getExercises()]);
    downloadText(`pulse-sets-${today}.csv`, setsCsv(sets, exercises), 'text/csv');
  } else if (domain === 'fuel') {
    downloadText(`pulse-fuel-${today}.csv`, fuelCsv(await getFuelLogs()), 'text/csv');
  } else if (domain === 'water') {
    downloadText(`pulse-water-${today}.csv`, waterCsv(await getWaterLogs()), 'text/csv');
  } else if (domain === 'recovery') {
    downloadText(`pulse-recovery-${today}.csv`, recoveryCsv(await getRecoveryLogs()), 'text/csv');
  }
});

window.exportWeekNote = safe(async function() {
  const [sets, exercises, recoveryLogs, fuelLogs, waterLogs] = await Promise.all([
    getSets(), getExercises(), getRecoveryLogs(), getFuelLogs(), getWaterLogs(),
  ]);
  const weekStart = mondayOf(localDateStr());
  const md = weeklyMarkdown({ sets, exercises, recoveryLogs, fuelLogs, waterLogs, weekStart });
  downloadText(`pulse-week-${weekStart}.md`, md, 'text/markdown');
});

// ── Sound check ────────────────────────────────────────────
// A deliberate gesture both unlocks the context and tells the user whether
// sound is actually going to work on this device.
window.testSound = async function() {
  const status = document.getElementById('sound-status');
  if (status) status.textContent = 'Playing…';

  primeAudio();

  // resume() is asynchronous, mostly on iOS; give the context a moment to
  // reach 'running' so the cue is audible rather than scheduled into silence.
  const deadline = Date.now() + 700;
  while (!audioStatus().running && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 50));
  }

  cue('done');
  const s = audioStatus();
  if (!status) return;

  if (!s.supported) {
    status.textContent = 'This browser has no Web Audio, so Pulse can only use vibration here.';
  } else if (s.running) {
    status.textContent = `Audio running${s.sessionType ? ` · session “${s.sessionType}”` : ''} — you should hear three rising notes.`;
  } else {
    status.textContent = `Audio is “${s.state}” — the browser blocked it. Tap Play again, and check the ring/silent switch on the side of an iPhone.`;
  }
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
      <button class="btn btn-ghost" style="color:var(--text-3)" aria-label="Remove plate size" onclick="removePlate(${i})">✕</button>
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
    card.innerHTML = `<div class="setting-row"><div class="setting-sub">Sync unavailable: ${escapeHtml(e.message)}</div></div>`;
    return null;
  }
}

// The code is tied to the email, not to the copy that requested it. This lets
// someone who asked for a code in Safari (or on another phone) carry it into
// the installed app instead of burning another send.
window.useExistingPulseCode = async function() {
  const input = document.getElementById('sync-email');
  const status = document.getElementById('sync-status');
  const clean = normalizeEmail(input?.value ?? '');
  if (!isValidEmail(clean)) {
    if (status) status.textContent = 'Enter the email you used first.';
    input?.focus();
    return;
  }
  setPendingEmail(clean);
  await updateSyncCard();
  document.getElementById('sync-code')?.focus();
};

window.sendPulseSyncCode = async function(resend = false) {
  if (window.sendPulseSyncCode.busy) return;
  const input = document.getElementById('sync-email');
  const email = resend ? pendingEmail : (input?.value?.trim() ?? '');
  const status = document.getElementById('sync-status');
  if (!email) {
    if (status) status.textContent = 'Enter your email first.';
    input?.focus();
    return;
  }
  if (resend && Date.now() < resendAvailableAt) {
    const seconds = Math.ceil((resendAvailableAt - Date.now()) / 1000);
    if (status) status.textContent = `A code was just sent — try again in ${seconds}s.`;
    return;
  }

  window.sendPulseSyncCode.busy = true;
  const button = document.getElementById(resend ? 'sync-resend' : 'sync-send');
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Sending…'; }
  if (status) status.textContent = resend ? 'Sending a new code…' : 'Sending your code…';

  try {
    const clean = await sendSignInCode(email);
    setPendingEmail(clean);
    resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
    await updateSyncCard();
    const fresh = document.getElementById('sync-status');
    if (fresh) {
      fresh.textContent = resend
        ? `New code sent to ${clean}. Use only the newest email.`
        : `Code sent to ${clean}.`;
    }
    document.getElementById('sync-code')?.focus();
  } catch (e) {
    if (status) status.textContent = e.message;
    if (button) { button.disabled = false; button.textContent = label; }
  } finally {
    window.sendPulseSyncCode.busy = false;
  }
};

window.verifyPulseSyncCode = async function() {
  if (verifyingCode) return;
  const input = document.getElementById('sync-code');
  const status = document.getElementById('sync-status');
  const email = pendingEmail;

  if (!email) {
    if (status) status.textContent = 'Request a code first.';
    return;
  }
  if (!String(input?.value ?? '').trim()) {
    if (status) status.textContent = 'Enter the code from the email.';
    input?.focus();
    return;
  }

  verifyingCode = true;
  const button = document.getElementById('sync-verify');
  if (button) { button.disabled = true; button.textContent = 'Signing in…'; }
  if (status) status.textContent = 'Checking the code…';

  try {
    await verifyEmailCode(email, input?.value ?? '');
    setPendingEmail('');
    const fresh = await updateSyncCard();
    if (fresh) fresh.textContent = 'Signed in. Syncing this device…';
    try {
      const s = await syncNow();
      if (fresh) {
        fresh.textContent = `Signed in — pushed ${s.pushed}, applied ${s.applied}${s.deletes ? `, deletes ${s.deletes}` : ''}.`;
      }
    } catch (e) {
      if (fresh) fresh.textContent = `Signed in. First sync will retry: ${e?.message ?? e}`;
    }
  } catch (e) {
    if (status) status.textContent = e.message;
    if (button) { button.disabled = false; button.textContent = 'Sign in'; }
    input?.select?.();
  } finally {
    verifyingCode = false;
  }
};

window.cancelPulseSyncCode = async function() {
  setPendingEmail('');
  await updateSyncCard();
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

// Repaint when auth changes in another tab or through the email flow. Skip it
// while this card is mid-verification so a race cannot wipe the code or the
// result message out from under the user.
if (typeof document !== 'undefined') {
  document.addEventListener('pulse:sync-changed', () => {
    if (!verifyingCode) updateSyncCard();
  });
}

registerTab('settings', { title: 'Settings', render: renderSettings });
