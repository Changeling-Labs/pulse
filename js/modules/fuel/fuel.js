// ── Pulse Fuel: tab + portion modal ────────────────────────
// Low-friction nutrition: one-tap hand portions, whole-food quality,
// hydration, daily myth-buster cards. All local-first.

import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { todayStr } from '../../kernel/helpers.js';
import { getFuelLogsForDate, addFuelLog, deleteFuelLog, getWaterLog, adjustWater, getPref } from '../../db.js';
import { calcHandPortions, getDailyMythCard, getRandomMythCard } from '../../fuel.js';

// ── Fuel Tab (Pulse Fuel) ─────────────────────────────────
// Low-friction nutrition: one-tap hand portions, whole-food quality,
// hydration, daily micronutrient-education cards. All local-first.
const WATER_TARGET = 8;
const PROTEIN_TARGET_OPTIONS = [80, 120, 140, 160, 180, 200];
const FUEL_PORTIONS = ['palms', 'fists', 'cupped', 'thumbs'];

async function renderFuel(el) {
  const today = todayStr();
  const [logs, water, proteinTarget] = await Promise.all([
    getFuelLogsForDate(today),
    getWaterLog(today),
    getPref('proteinTarget', 140),
  ]);
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));   // newest first

  const protein = logs.reduce((sum, l) => sum + l.proteinGrams, 0);
  const calories = logs.reduce((sum, l) => sum + l.calories, 0);
  const whole = logs.filter(l => l.isWholeFood).length;
  const qualityPct = logs.length ? Math.round((whole / logs.length) * 100) : null;
  const proteinPct = Math.min(100, Math.round((protein / proteinTarget) * 100));
  const waterPct = Math.min(100, Math.round((water.glasses / WATER_TARGET) * 100));

  const myth = state.fuelMyth || getDailyMythCard(today);

  const portionText = l => {
    const parts = [];
    if (l.handPortions.palms) parts.push(`${l.handPortions.palms}× palm`);
    if (l.handPortions.fists) parts.push(`${l.handPortions.fists}× fist`);
    if (l.handPortions.cupped) parts.push(`${l.handPortions.cupped}× cupped`);
    if (l.handPortions.thumbs) parts.push(`${l.handPortions.thumbs}× thumb`);
    return parts.join(' · ') || 'note only';
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head">
        <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
        <select style="width:122px" onchange="setProteinTarget(this.value)" aria-label="Protein target">
          ${PROTEIN_TARGET_OPTIONS.map(t => `<option value="${t}" ${Number(proteinTarget) === t ? 'selected' : ''}>${t} g protein</option>`).join('')}
        </select>
      </div>

      <div class="meter-block">
        <div class="meter-head"><span>Protein</span><span><b>${Math.round(protein)}</b> / ${proteinTarget} g</span></div>
        <div class="meter"><div class="meter-fill" style="width:${proteinPct}%"></div></div>
      </div>

      <div class="meter-block">
        <div class="meter-head"><span>Food quality</span><span><b>${qualityPct === null ? '—' : qualityPct + '%'}</b>${logs.length ? ` whole · ${whole}/${logs.length} logged` : ' · nothing logged yet'}</span></div>
        <div class="meter"><div class="meter-fill${qualityPct === null || qualityPct >= 75 ? ' green' : ''}" style="width:${qualityPct ?? 0}%"></div></div>
      </div>

      <div class="meter-block" style="margin-bottom:0">
        <div class="meter-head water-row">
          <span>Hydration</span>
          <span class="water-btns">
            <button type="button" class="water-btn" onclick="adjustWaterBy(-1)" aria-label="Less water">−</button>
            <b>${water.glasses} / ${WATER_TARGET} glasses</b>
            <button type="button" class="water-btn" onclick="adjustWaterBy(1)" aria-label="More water">+</button>
          </span>
        </div>
        <div class="meter"><div class="meter-fill" style="width:${waterPct}%"></div></div>
      </div>
    </div>

    <div class="myth-card">
      <div class="myth-badge">Myth Buster</div>
      <div class="myth-text">“${myth.myth}”</div>
      <div class="myth-truth"><b>Truth:</b> ${myth.truth}</div>
      <div class="myth-action"><b>Do this:</b> ${myth.action}</div>
      <button type="button" class="btn btn-ghost" onclick="newMythCard()">Show me another →</button>
    </div>

    <div class="card">
      <div class="card-label">Today's fuel${logs.length ? ` · ${Math.round(calories)} kcal` : ''}</div>
      ${logs.length === 0
        ? '<div class="empty"><div class="icon">🥗</div><p>Nothing logged yet. Tap + to log your first hand portion.</p></div>'
        : logs.map(l => `
            <div class="fuel-row" data-id="${l.id}">
              <div>
                <div class="fuel-name">${new Date(l.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${l.isWholeFood ? '<span class="fuel-check">✓ whole</span>' : ''}</div>
                <div class="fuel-detail">${portionText(l)}${l.notes ? ` · ${l.notes}` : ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="text-align:right">
                  <div class="log-weight">${Math.round(l.proteinGrams)} g</div>
                  <div class="fuel-detail">${Math.round(l.calories)} kcal</div>
                </div>
                <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteFuelEntry('${l.id}')" aria-label="Delete entry">✕</button>
              </div>
            </div>`).join('')}
    </div>`;
}

// ── Fuel modal: hand-portion estimator ──────────────────────
let fuelPortions = { palms: 0, fists: 0, cupped: 0, thumbs: 0 };
let fuelWholeFood = true;

function renderFuelEstimate() {
  const est = calcHandPortions(fuelPortions);
  for (const key of FUEL_PORTIONS) {
    const el = document.getElementById(`portion-${key}`);
    if (el) el.textContent = fuelPortions[key];
  }
  const estEl = document.getElementById('fuel-estimate');
  if (estEl) estEl.innerHTML = `<b>${est.proteinGrams} g</b> protein · <b>${est.calories}</b> kcal`;
  document.getElementById('whole-yes').classList.toggle('active', fuelWholeFood);
  document.getElementById('whole-no').classList.toggle('active', !fuelWholeFood);
  document.getElementById('fuel-whole-hint').textContent = fuelWholeFood ? 'Minimally processed' : 'Ultra-processed / packaged';
}

window.openFuelModal = function() {
  fuelPortions = { palms: 0, fists: 0, cupped: 0, thumbs: 0 };
  fuelWholeFood = true;
  document.getElementById('fuel-notes').value = '';
  renderFuelEstimate();
  document.getElementById('fuel-modal').classList.add('open');
};

window.closeFuelModal = function() {
  document.getElementById('fuel-modal').classList.remove('open');
};

window.adjustPortion = function(kind, delta) {
  fuelPortions[kind] = Math.max(0, Math.min(50, (fuelPortions[kind] || 0) + delta));
  renderFuelEstimate();
};

window.setFuelWholeFood = function(yes) {
  fuelWholeFood = Boolean(yes);
  renderFuelEstimate();
};

window.submitFuelLog = async function() {
  const anyPortion = FUEL_PORTIONS.some(k => fuelPortions[k] > 0);
  const notes = document.getElementById('fuel-notes').value.trim();
  if (!anyPortion && !notes) { alert('Tap a portion or add a note.'); return; }

  const est = calcHandPortions(fuelPortions);
  try {
    await addFuelLog({
      timestamp: new Date().toISOString(),
      date: todayStr(),
      proteinGrams: est.proteinGrams,
      calories: est.calories,
      isWholeFood: fuelWholeFood,
      handPortions: { ...fuelPortions },
      notes,
    });
  } catch (err) {
    alert(err.message);
    return;
  }
  window.closeFuelModal();
  await renderTab('fuel');
};

window.deleteFuelEntry = async function(id) {
  if (!confirm('Delete this fuel entry?')) return;
  await deleteFuelLog(id);
  await renderTab('fuel');
};

window.adjustWaterBy = async function(delta) {
  await adjustWater(todayStr(), Number(delta) || 0);
  await renderTab('fuel');
};

window.setProteinTarget = async function(val) {
  await setPref('proteinTarget', parseInt(val, 10) || 140);
  await renderTab('fuel');
};

window.newMythCard = async function() {
  state.fuelMyth = getRandomMythCard();
  await renderTab('fuel');
};



registerTab('fuel', { title: 'Fuel', fabLabel: 'Log fuel', fabAction: () => window.openFuelModal(), render: renderFuel });
