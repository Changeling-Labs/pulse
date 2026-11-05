// ── Pulse kernel: shared DOM & formatting helpers ──────
// Used by every module. No DOM outside helpers; no app state except units.

import { displayWeight } from '../calc.js';
import { localDateStr } from '../dates.js';
import { state } from './shell.js';

function dw(lbs) { return displayWeight(lbs, state.unit); }

function sinceDate() {
  if (!state.prWindow || state.prWindow === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(state.prWindow));
  return localDateStr(d);
}

function todayStr() { return localDateStr(); }

function fmtDate(isoStr) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}


// ── Set display helpers ────────────────────────────────────
// A set may carry fields for several metrics at once (schema v4), so
// rendering reads whatever is on the record instead of switching on type.
function fmtDuration(sec) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}


// Scoped field access for the log modal (see js/modules/move/modal.js).
function scopeEl(scope, key) {
  return document.getElementById(scope + key);
}

function fieldValue(scope, key) {
  const el = scopeEl(scope, key);
  if (!el) return null;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : null;
}


function showToast() {
  let toast = document.getElementById('nice-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nice-toast';
    toast.className = 'nice-toast';
    document.body.appendChild(toast);
  }
  const msgs = ['Nice work! 💪', 'Get some! 🔥', 'Beast mode.', "Let's go!", 'Crushed it!'];
  toast.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}


export { dw, sinceDate, todayStr, fmtDate, fmtDuration, scopeEl, fieldValue, showToast };
