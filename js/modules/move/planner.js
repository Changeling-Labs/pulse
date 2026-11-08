// ── Pulse Move: session planner ────────────────────────────
import { state, renderTab, registerInit } from '../../kernel/shell.js';
import { dw, sinceDate, showToast } from '../../kernel/helpers.js';
import { targetFromPct, buildSessionPlan } from '../../calc.js';
import { getAllPRs } from '../../db.js';
import { strengthExercises } from './shared.js';
import { programmeBannerHtml } from './programme.js';
import { burstFromEl } from '../../confetti.js';

// ── Session Planner ────────────────────────────────────────
// Rendered inside Move's Planner segment. Planner actions re-render the Move
// tab (`renderTab('log')`), which lands back on this segment because the
// user's moveView preference still says 'planner'.
export async function renderPlanner(el) {
  const since = sinceDate();
  const { barWeight, plates } = state.equipment;

  // Build HTML for each movement block
  const blocksHtml = await Promise.all(state.plannerWorkout.map(async (block, bi) => {
    const exOptions = strengthExercises().map(e =>
      `<option value="${e.id}" ${e.id === block.exerciseId ? 'selected' : ''}>${e.name}</option>`
    ).join('');

    const prs = block.exerciseId ? await getAllPRs(block.exerciseId, since) : { 1: null, 3: null, 5: null };
    const pr = prs[block.rmType];

    // Compute targets per set
    const targets = block.sets.map(s => {
      if (s.mode === 'pct') return pr ? targetFromPct(pr, s.value) : null;
      return s.value || null;
    });

    const validTargets = targets.map(t => t || 0);
    const plan = buildSessionPlan(validTargets, barWeight, plates);

    // ── Set rows ───────────────────────────────────────────
    const setsHtml = block.sets.map((set, si) => {
      const isDone = block.checked[si];
      const target = targets[si];
      const weightDisplay = plan[si] && target ? dw(plan[si].actual) : '—';
      const isPct = set.mode === 'pct';

      const valueInput = isPct
        ? `<input class="pct-input" type="number" min="1" max="200" value="${set.value}"
             onchange="updateSetVal(${bi},${si},this.value)" />`
        : `<input class="pct-input" type="number" min="0" step="2.5" value="${set.value}"
             style="width:68px !important" onchange="updateSetVal(${bi},${si},this.value)" />`;

      const modePill = `
        <button onclick="toggleSetMode(${bi},${si})"
          style="background:none;border:1px solid var(--border-md);border-radius:5px;
                 padding:3px 5px;font-size:10px;color:${isPct ? 'var(--glow)' : 'var(--text-2)'};
                 cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0;line-height:1">
          ${isPct ? '%' : 'lb'}
        </button>`;

      const repsInput = `
        <input type="number" min="1" max="99" value="${set.reps}"
          style="width:40px !important;padding:6px 4px !important;font-size:13px !important;text-align:center"
          onchange="updateSetReps(${bi},${si},this.value)" />
        <span style="font-size:11px;color:var(--text-3)">×</span>`;

      return `
        <div class="set-row${isDone ? ' done' : ''}" id="sr-${bi}-${si}">
          <div class="set-num">${si + 1}</div>
          <div class="pct-wrap" style="gap:4px">
            ${repsInput}
            ${valueInput}
            ${modePill}
          </div>
          <div class="set-spacer"></div>
          <div class="set-weight">${weightDisplay}</div>
          <div class="set-check${isDone ? ' checked' : ''}" id="sc-${bi}-${si}"
            onclick="toggleSetCheck(${bi},${si})" role="checkbox" aria-label="Mark set ${si+1} complete">
            ${isDone ? '✓' : ''}
          </div>
        </div>`;
    }).join('');

    // ── Plate transitions ──────────────────────────────────
    const incompletePlan = plan.filter((_, si) => !block.checked[si] && targets[si] && targets[si] > 0);
    const validPlan = plan.filter((_, si) => targets[si] && targets[si] > 0);
    const allDone = validPlan.length > 0 && incompletePlan.length === 0;

    let currentPlates = [];
    for (let si = plan.length - 1; si >= 0; si--) {
      if (block.checked[si]) { currentPlates = plan[si].plates; break; }
    }

    function plateMap(p) { return Object.fromEntries(p.map(x => [x.weight, x.count])); }
    function delta(from, to) {
      const fm = plateMap(from), tm = plateMap(to);
      const ws = new Set([...Object.keys(fm), ...Object.keys(tm)].map(Number));
      const add = [], remove = [];
      for (const w of [...ws].sort((a,b) => b-a)) {
        const bf = fm[w]||0, af = tm[w]||0;
        if (af > bf) add.push({weight:w, count:af-bf});
        if (bf > af) remove.push({weight:w, count:bf-af});
      }
      return { add, remove };
    }

    let platesHtml = '';
    if (allDone) {
      platesHtml = `<div style="text-align:center;padding:10px;font-size:14px;color:var(--glow)">🎉 Done!</div>`;
    } else if (incompletePlan.length > 0) {
      let prevPlates = currentPlates;
      platesHtml = incompletePlan.map((step, idx) => {
        const isNext = idx === 0;
        const setLabel = `Set ${step.setIndex + 1} · ${dw(step.actual)}`;
        let instructionHtml = '';

        if (idx === 0 && currentPlates.length === 0) {
          const chips = step.plates.length
            ? step.plates.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
            : '<span class="chip">bar only</span>';
          instructionHtml = `<div class="plate-chips">${chips}</div>`;
        } else {
          const { add, remove } = delta(prevPlates, step.plates);
          const addChips = add.map(p => `<span class="chip" style="border-color:var(--green)"><b style="color:var(--green)">+${p.count}×</b> ${p.weight} lb</span>`).join('');
          const remChips = remove.map(p => `<span class="chip" style="border-color:var(--red)"><b style="color:var(--red)">−${p.count}×</b> ${p.weight} lb</span>`).join('');
          instructionHtml = (!add.length && !remove.length)
            ? `<span class="chip-note">No change</span>`
            : `<div class="plate-chips">${addChips}${remChips}</div>`;
        }

        prevPlates = step.plates;
        const diff = Math.abs(step.actual - (targets[step.setIndex] || 0));
        const note = diff > 0.05 ? `<div class="chip-note">Actual: ${dw(step.actual)}</div>` : '';

        return `
          <div style="margin-bottom:10px${isNext ? '' : ';opacity:0.5'}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              ${isNext ? `<span style="font-size:9px;font-weight:700;font-family:var(--font-display);background:var(--glow);color:#00283A;padding:3px 8px;border-radius:4px;letter-spacing:0.08em;text-transform:uppercase">NEXT</span>` : ''}
              <div style="font-size:12px;color:var(--text-2)">${setLabel}</div>
            </div>
            ${instructionHtml}${note}
          </div>`;
      }).join('<div class="divider"></div>');
    }

    const prDisplay = pr
      ? `<div style="background:var(--brand-dim);border-radius:var(--radius);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
          <span style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em">${block.rmType}RM PR</span>
          <span style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--glow)">${dw(pr)}</span>
        </div>`
      : `<div style="font-size:12px;color:var(--text-3);padding:6px 0">No PR logged yet for this lift.</div>`;

    const blockCount = state.plannerWorkout.length;

    return `
      <div class="card" id="block-${bi}" style="border:1px solid var(--border);margin-bottom:12px">

        <!-- Block header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">
            Movement ${bi + 1}
          </div>
          ${blockCount > 1
            ? `<button onclick="removeBlock(${bi})" aria-label="Remove movement"
                style="background:none;border:none;color:var(--text-3);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>`
            : ''}
        </div>

        <!-- Exercise + RM selectors -->
        <div class="form-row" style="margin-bottom:8px">
          <label>Exercise</label>
          <select onchange="updateBlockEx(${bi},this.value)">${exOptions}</select>
        </div>
        <div class="form-row" style="margin-bottom:12px">
          <label>PR type</label>
          <select onchange="updateBlockRM(${bi},this.value)">
            <option value="1" ${block.rmType===1?'selected':''}>1RM${prs[1] ? ' · '+dw(prs[1]) : ''}</option>
            <option value="3" ${block.rmType===3?'selected':''}>3RM${prs[3] ? ' · '+dw(prs[3]) : ''}</option>
            <option value="5" ${block.rmType===5?'selected':''}>5RM${prs[5] ? ' · '+dw(prs[5]) : ''}</option>
          </select>
        </div>
        ${prDisplay}

        <!-- Set rows -->
        <div style="margin-top:14px">
          <div style="display:flex;padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:2px;font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;gap:4px">
            <div style="min-width:22px">#</div>
            <div style="flex:1">Reps · Load</div>
            <div style="min-width:72px;text-align:right">Target</div>
            <div style="width:32px"></div>
          </div>
          ${setsHtml}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="removeSet(${bi})">− Set</button>
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="addSet(${bi})">+ Set</button>
          </div>
        </div>

        <!-- Plate transitions -->
        ${platesHtml ? `
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="card-label" style="margin-bottom:10px">Plates · ${barWeight} lb bar</div>
            ${platesHtml}
          </div>` : ''}
      </div>`;
  }));

  el.innerHTML = `
    ${programmeBannerHtml()}
    ${blocksHtml.join('')}
    <button class="btn btn-full" style="margin-bottom:16px;padding:13px;font-size:14px" onclick="addBlock()">
      + Add Movement
    </button>`;
}

// ── Planner actions ────────────────────────────────────────
window.updateBlockEx = function(bi, val) {
  state.plannerWorkout[bi].exerciseId = parseInt(val);
  renderTab('log');
};

window.updateBlockRM = function(bi, val) {
  state.plannerWorkout[bi].rmType = parseInt(val);
  renderTab('log');
};

window.updateSetVal = function(bi, si, val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n >= 0) { state.plannerWorkout[bi].sets[si].value = n; renderTab('log'); }
};

window.updateSetReps = function(bi, si, val) {
  const n = parseInt(val);
  if (!isNaN(n) && n >= 1) { state.plannerWorkout[bi].sets[si].reps = n; renderTab('log'); }
};

window.toggleSetMode = function(bi, si) {
  const set = state.plannerWorkout[bi].sets[si];
  set.mode = set.mode === 'pct' ? 'lbs' : 'pct';
  set.value = set.mode === 'pct' ? 75 : 0;
  renderTab('log');
};

window.toggleSetCheck = function(bi, si) {
  const block = state.plannerWorkout[bi];
  const wasChecked = block.checked[si];
  block.checked[si] = !wasChecked;
  if (!wasChecked) {
    const el = document.getElementById(`sc-${bi}-${si}`);
    if (el) burstFromEl(el);
    showToast();
  }
  renderTab('log');
};

window.addSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length >= 12) return;
  const last = block.sets[block.sets.length - 1];
  block.sets.push({ mode: last.mode, value: last.value, reps: last.reps });
  block.checked.push(false);
  renderTab('log');
};

window.removeSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length <= 1) return;
  block.sets.pop();
  block.checked.pop();
  renderTab('log');
};

window.addBlock = function() {
  state.plannerWorkout.push({
    exerciseId: strengthExercises()[0]?.id ?? null,
    rmType: 1,
    sets: [
      { mode: 'pct', value: 50, reps: 5 },
      { mode: 'pct', value: 75, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
    ],
    checked: [false, false, false, false, false],
  });
  renderTab('log');
  // Scroll to new block
  setTimeout(() => {
    const el = document.getElementById(`block-${state.plannerWorkout.length - 1}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
};

window.removeBlock = function(bi) {
  if (state.plannerWorkout.length <= 1) return;
  if (!confirm('Remove this movement?')) return;
  state.plannerWorkout.splice(bi, 1);
  renderTab('log');
};



// Pre-assign the first lift to the first planner block.
registerInit(() => {
  const lifts = strengthExercises();
  if (lifts.length > 0) {
    state.plannerWorkout[0].exerciseId = lifts[0].id;
    state.plannerWorkout[0].checked = state.plannerWorkout[0].sets.map(() => false);
  }
});
