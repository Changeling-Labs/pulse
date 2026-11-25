// ── Pulse Fuel: tab + portion modal ────────────────────────
// Low-friction nutrition: one-tap hand portions, whole-food quality,
// hydration, daily myth-buster cards. All local-first.

import { state, renderTab, registerTab } from '../../kernel/shell.js';
import { todayStr } from '../../kernel/helpers.js';
import {
  getFuelLogs, addFuelLog, deleteFuelLog, getWaterLog, setWaterGlasses, getPref,
} from '../../db.js';
import {
  getDailyMythCard, getRandomMythCard,
  MEAL_TEMPLATES, PORTION_KEYS, PORTION_SIZES, PORTION_EXAMPLES,
  SIZE_META, COMPONENT_KEYS,
  normalizeMealComponents, calcMealComponents, componentsFromHandPortions,
  describeComponents, describePortions, weeklyHandPortions,
} from '../../fuel.js';
import { openDialog, closeDialog, trapDialog } from '../../kernel/a11y.js';
import { handleSaveError } from '../../kernel/errors.js';
import { track } from '../../analytics.js';

// ── Fuel Tab (Pulse Fuel) ─────────────────────────────────
// Low-friction nutrition: one-tap hand portions, whole-food quality,
// hydration, daily micronutrient-education cards. All local-first.
const WATER_TARGET = 8;
const PROTEIN_TARGET_OPTIONS = [80, 120, 140, 160, 180, 200];
const SHOPPING_META = {
  palms: { label: 'Protein', unit: 'palm-equivalents' },
  fists: { label: 'Vegetables', unit: 'fist-equivalents' },
  cupped: { label: 'Carbs', unit: 'cupped-equivalents' },
  thumbs: { label: 'Fat', unit: 'thumb-equivalents' },
};
let waterGlasses = 0;
let waterWrite = Promise.resolve();

// The protein ring is decorative; the text beside it carries the same
// information for screen readers and for anyone who cannot see the arc.
function proteinRingHtml(percent) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const offset = circumference * (1 - pct / 100);
  return `
    <div class="protein-ring" aria-hidden="true">
      <svg viewBox="0 0 84 84" focusable="false">
        <defs>
          <linearGradient id="protein-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0056D2"></stop>
            <stop offset="100%" stop-color="#00F5FF"></stop>
          </linearGradient>
        </defs>
        <circle class="protein-ring-track" cx="42" cy="42" r="${radius}"></circle>
        <circle class="protein-ring-value" cx="42" cy="42" r="${radius}"
          stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"></circle>
      </svg>
      <span class="protein-ring-label"><b>${pct}</b><small>%</small></span>
    </div>`;
}

function portionLegendHtml() {
  return `
    <div class="portion-legend" role="list" aria-label="Hand portion sizes">
      ${PORTION_SIZES.map(size => {
        const meta = SIZE_META[size];
        return `<span class="portion-legend-item" role="listitem">
          <span class="portion-legend-emoji" aria-hidden="true">${meta.hand}</span>${meta.label}
        </span>`;
      }).join('')}
    </div>`;
}

function waterGlassesHtml(count) {
  return Array.from({ length: WATER_TARGET }, (_, i) => {
    const glasses = i + 1;
    const filled = i < count;
    return `<button type="button" class="water-glass${filled ? ' filled' : ''}"
      data-glasses="${glasses}" aria-pressed="${filled}"
      aria-label="Set hydration to ${glasses} glass${glasses === 1 ? '' : 'es'}"
      onclick="tapWaterGlass(${glasses})"><span class="water-glass-fill" aria-hidden="true"></span></button>`;
  }).join('');
}

// Update hydration in place so tapping a glass does not repaint (and jump
// to the top of) the whole Fuel tab.
function updateWaterUI(count) {
  waterGlasses = Math.max(0, Number(count) || 0);
  const pct = Math.min(100, Math.round((waterGlasses / WATER_TARGET) * 100));
  const countEl = document.getElementById('water-count');
  if (countEl) countEl.innerHTML = `<b>${waterGlasses}</b> / ${WATER_TARGET} glasses`;
  const fill = document.getElementById('water-fill');
  if (fill) fill.style.width = `${pct}%`;
  document.querySelectorAll('.water-glass').forEach((btn, index) => {
    const filled = index < waterGlasses;
    btn.classList.toggle('filled', filled);
    btn.setAttribute('aria-pressed', String(filled));
  });
}

// Serialize water writes so two fast taps cannot both read the same starting
// count and lose one. The target is computed when the queued write runs.
function queueWaterWrite(targetFor) {
  waterWrite = waterWrite
    .catch(() => {})
    .then(async () => {
      const target = Math.max(0, Number(targetFor(waterGlasses)) || 0);
      await setWaterGlasses(todayStr(), target);
      updateWaterUI(target);
    })
    .catch(err => { handleSaveError(err); });
  return waterWrite;
}

function templatesCardHtml() {
  return `
    <div class="card meal-templates-card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Meal templates</div>
        <button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onclick="openFuelModal()">Custom</button>
      </div>
      <p class="meal-templates-blurb">Tap a template to prefill the hand portions, then adjust and save.</p>
      <div class="meal-template-grid">
        ${MEAL_TEMPLATES.map(template => `
          <button type="button" class="meal-template" onclick="openFuelTemplate('${template.id}')">
            <span class="meal-template-emoji" aria-hidden="true">${template.emoji}</span>
            <span class="meal-template-copy">
              <span class="meal-template-name">${template.name}</span>
              <span class="meal-template-portions">${describePortions(template.portions)}</span>
            </span>
          </button>`).join('')}
      </div>
      ${portionLegendHtml()}
    </div>`;
}

function shoppingCardHtml(allLogs, today) {
  const week = weeklyHandPortions(allLogs, today, 7);
  if (!week) return '';
  if (!week.loggedDays) {
    return `
      <div class="card shopping-card">
        <div class="card-label">Next week's hand portions</div>
        <p class="shopping-blurb">Log a few meals and Pulse will turn your last seven days into a rough shopping guide.</p>
        <div class="shopping-empty">No meals logged in the last 7 days.</div>
      </div>`;
  }
  return `
    <div class="card shopping-card">
      <div class="card-head">
        <div class="card-label" style="margin-bottom:0">Next week's hand portions</div>
        <span class="shopping-tag">${week.loggedDays} day${week.loggedDays === 1 ? '' : 's'} logged</span>
      </div>
      <p class="shopping-blurb">A rough guide from your last 7 days. Not a target.</p>
      <div class="shopping-grid">
        ${PORTION_KEYS.map(key => {
          const meta = SHOPPING_META[key];
          return `<div class="shopping-item">
            <div class="shopping-count">${week.projected[key]}</div>
            <div class="shopping-label">${meta.label}</div>
            <div class="shopping-example">${meta.unit} · ${PORTION_EXAMPLES[key]}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="shopping-foot">${week.logs} meal${week.logs === 1 ? '' : 's'} logged${week.wholeShare !== null ? ` · ${week.wholeShare}% whole food` : ''}.</div>
    </div>`;
}

async function renderFuel(el) {
  const today = todayStr();
  const [allLogs, water, proteinTarget] = await Promise.all([
    getFuelLogs(),
    getWaterLog(today),
    getPref('proteinTarget', 140),
  ]);
  const logs = allLogs.filter(log => log.date === today);
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));   // newest first

  const protein = logs.reduce((sum, l) => sum + l.proteinGrams, 0);
  const calories = logs.reduce((sum, l) => sum + l.calories, 0);
  const whole = logs.filter(l => l.isWholeFood).length;
  const qualityPct = logs.length ? Math.round((whole / logs.length) * 100) : null;
  const proteinPct = Math.min(100, Math.round((protein / proteinTarget) * 100));
  const proteinRemaining = Math.max(0, Math.round(proteinTarget) - Math.round(protein));
  const waterPct = Math.min(100, Math.round((water.glasses / WATER_TARGET) * 100));
  waterGlasses = water.glasses;

  const myth = state.fuelMyth || getDailyMythCard(today);

  const portionText = l => {
    const hasComponents = COMPONENT_KEYS.some(key => l.components?.[key]?.count > 0);
    return hasComponents ? describeComponents(l.components) : 'note only';
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head fuel-today-head">
        <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</div>
        <select class="fuel-target-select" onchange="setProteinTarget(this.value)" aria-label="Protein target">
          ${PROTEIN_TARGET_OPTIONS.map(t => `<option value="${t}" ${Number(proteinTarget) === t ? 'selected' : ''}>${t} g protein</option>`).join('')}
        </select>
      </div>

      <div class="protein-summary">
        ${proteinRingHtml(proteinPct)}
        <div class="protein-copy">
          <div class="protein-title">Protein</div>
          <div class="protein-numbers"><b>${Math.round(protein)}</b> / ${proteinTarget} g</div>
          <div class="protein-hint">${proteinPct >= 100 ? 'Target reached' : `${proteinRemaining} g to go`}</div>
        </div>
      </div>

      <div class="meter-block quality-block">
        <div class="meter-head">
          <span><span class="meter-icon" aria-hidden="true">🌿</span>Whole-food share</span>
          <span><b>${qualityPct === null ? '—' : qualityPct + '%'}</b>${logs.length ? ` whole · ${whole}/${logs.length} logged` : ' · nothing logged yet'}</span>
        </div>
        <div class="meter"><div class="meter-fill quality" style="width:${qualityPct ?? 0}%"></div></div>
      </div>

      <div class="meter-block water-block" style="margin-bottom:0">
        <div class="meter-head water-row">
          <span>Hydration</span>
          <span class="water-btns">
            <button type="button" class="water-btn" onclick="adjustWaterBy(-1)" aria-label="Less water">−</button>
            <span id="water-count" aria-live="polite" aria-atomic="true"><b>${water.glasses}</b> / ${WATER_TARGET} glasses</span>
            <button type="button" class="water-btn" onclick="adjustWaterBy(1)" aria-label="More water">+</button>
          </span>
        </div>
        <div class="water-glasses" role="group" aria-label="Hydration glasses">
          ${waterGlassesHtml(water.glasses)}
        </div>
        <div class="meter water-meter"><div class="meter-fill water" id="water-fill" style="width:${waterPct}%"></div></div>
      </div>
    </div>

    ${templatesCardHtml()}

    <div class="myth-card">
      <div class="myth-badge">Myth Buster</div>
      <div class="myth-text">“${myth.myth}”</div>
      <div class="myth-truth"><b>Truth:</b> ${myth.truth}</div>
      <div class="myth-action"><b>Do this:</b> ${myth.action}</div>
      <button type="button" class="btn btn-ghost" onclick="newMythCard()">Show me another →</button>
      <div class="myth-disclaimer">Educational only — not medical advice.</div>
    </div>

    <div class="card">
      <div class="card-label">Today's fuel${logs.length ? ` · ${Math.round(calories)} kcal` : ''}</div>
      ${logs.length === 0
        ? '<div class="empty"><div class="icon">🥗</div><p>Nothing logged yet. Tap “Log fuel” to estimate your first meal.</p></div>'
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
    </div>

    ${shoppingCardHtml(allLogs, today)}`;
}

// ── Fuel modal: category × size estimator ──────────────────
let fuelComponents = normalizeMealComponents();
let fuelWholeFood = true;
let guideTrapReady = false;

function componentDetail(key, entry) {
  const size = SIZE_META[entry.size];
  const count = entry.count || 1;               // show the unit at zero
  const est = calcMealComponents({ [key]: { size: entry.size, count } });
  const prefix = entry.count
    ? `${entry.count} ${entry.count === 1 ? size.label.toLowerCase() : size.plural} ≈ `
    : `${size.label} ≈ `;

  if (key === 'protein') return `${prefix}${est.proteinGrams} g protein`;
  if (key === 'carbs') return `${prefix}${est.carbsGrams} g carbs`;
  if (key === 'fat') return `${prefix}${est.fatGrams} g fat`;
  const portions = est.vegPortions;
  return `${prefix}${portions} veg portion${portions === 1 ? '' : 's'}`;
}

function renderFuelEstimate() {
  const est = calcMealComponents(fuelComponents);

  for (const key of COMPONENT_KEYS) {
    const countEl = document.getElementById(`portion-${key}`);
    if (countEl) countEl.textContent = fuelComponents[key].count;

    const row = document.querySelector(`.component-row[data-component="${key}"]`);
    if (row) {
      row.querySelectorAll('.size-chip').forEach(btn => {
        const selected = btn.dataset.size === fuelComponents[key].size;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-pressed', String(selected));
      });
      const detail = document.getElementById(`portion-detail-${key}`);
      if (detail) detail.textContent = componentDetail(key, fuelComponents[key]);
    }
  }

  const parts = [];
  if (est.proteinGrams) parts.push(`<b>~${est.proteinGrams} g</b> protein`);
  if (est.carbsGrams) parts.push(`~${est.carbsGrams} g carbs`);
  if (est.fatGrams) parts.push(`~${est.fatGrams} g fat`);
  if (est.vegPortions) parts.push(`~${est.vegPortions} veg portion${est.vegPortions === 1 ? '' : 's'}`);
  if (parts.length) parts.push(`<b>~${est.calories}</b> kcal`);

  const estEl = document.getElementById('fuel-estimate');
  if (estEl) {
    estEl.innerHTML = parts.length
      ? `${parts.join(' · ')} <span class="estimate-word">estimate</span>`
      : 'Tap + on the foods that were on the plate.';
  }

  document.getElementById('whole-yes').classList.toggle('active', fuelWholeFood);
  document.getElementById('whole-no').classList.toggle('active', !fuelWholeFood);
  document.getElementById('fuel-whole-hint').textContent = fuelWholeFood ? 'Minimally processed' : 'Ultra-processed / packaged';
}

function openFuelModalWith(components, wholeFood, note = '') {
  fuelComponents = normalizeMealComponents(components);
  fuelWholeFood = Boolean(wholeFood);
  document.getElementById('fuel-notes').value = note;
  renderFuelEstimate();
  const modal = document.getElementById('fuel-modal');
  trapDialog(modal, () => window.closeFuelModal());
  openDialog(modal, {
    initialFocus: () => document.querySelector('#fuel-modal .component-stepper button:last-child'),
  });
}

window.openFuelModal = function() {
  openFuelModalWith(null, true, '');
};

window.openFuelTemplate = function(id) {
  const template = MEAL_TEMPLATES.find(item => item.id === id);
  if (!template) return;
  openFuelModalWith(componentsFromHandPortions(template.portions), template.wholeFood, template.name);
};

window.closeFuelModal = function() {
  closeDialog(document.getElementById('fuel-modal'));
};

window.adjustPortion = function(component, delta) {
  const entry = fuelComponents[component];
  if (!entry) return;
  entry.count = Math.max(0, Math.min(50, entry.count + (Number(delta) || 0)));
  renderFuelEstimate();
};

window.setPortionSize = function(component, size) {
  if (!fuelComponents[component] || !PORTION_SIZES.includes(size)) return;
  fuelComponents[component].size = size;
  renderFuelEstimate();
};

window.setFuelWholeFood = function(yes) {
  fuelWholeFood = Boolean(yes);
  renderFuelEstimate();
};

window.openPortionGuide = function() {
  const modal = document.getElementById('portion-guide-modal');
  if (!modal) return;
  if (!guideTrapReady) {
    trapDialog(modal, () => window.closePortionGuide());
    guideTrapReady = true;
  }
  openDialog(modal);
};

window.closePortionGuide = function() {
  closeDialog(document.getElementById('portion-guide-modal'));
};

window.submitFuelLog = async function() {
  const anyPortion = COMPONENT_KEYS.some(key => fuelComponents[key].count > 0);
  const notes = document.getElementById('fuel-notes').value.trim();
  if (!anyPortion && !notes) { alert('Tap + on a food or add a note.'); return; }

  try {
    await addFuelLog({
      timestamp: new Date().toISOString(),
      date: todayStr(),
      components: Object.fromEntries(COMPONENT_KEYS.map(key => [key, { ...fuelComponents[key] }])),
      isWholeFood: fuelWholeFood,
      notes,
    });
    track('meal-logged');
  } catch (err) {
    handleSaveError(err);
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

window.adjustWaterBy = function(delta) {
  const step = Number(delta) || 0;
  return queueWaterWrite(current => current + step);
};

window.tapWaterGlass = function(glasses) {
  const target = Math.max(0, Math.min(WATER_TARGET, Number(glasses) || 0));
  return queueWaterWrite(() => target);
};

window.setProteinTarget = async function(val) {
  await setPref('proteinTarget', parseInt(val, 10) || 140);
  await renderTab('fuel');
};

window.newMythCard = async function() {
  state.fuelMyth = getRandomMythCard();
  await renderTab('fuel');
};



registerTab('fuel', {
  title: 'Fuel',
  fabLabel: 'Log fuel',
  fabText: 'Log fuel',
  fabAction: () => window.openFuelModal(),
  render: renderFuel,
});
