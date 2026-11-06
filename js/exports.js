// ── Pulse open exports ─────────────────────────────────────
// Read-only snapshots: CSV per domain and a weekly Markdown note. The JSON
// backup stays the canonical restore path; nothing here imports or mutates.
//
// Pure string builders — no DOM, no Blob, no network — so they run under
// node's test runner. Callers (Settings) wrap the strings in a download.

import { localDateStr } from './dates.js';
import { mondayOf } from './insights.js';

export { mondayOf };

const MS_DAY = 86400000;

function parse(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

function format(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(dateStr, days) {
  return format(new Date(parse(dateStr).getTime() + days * MS_DAY));
}

// ── CSV ────────────────────────────────────────────────────
// RFC 4180-ish: quote only when needed, double embedded quotes, CRLF rows.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header, rows) {
  return [header.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))]
    .join('\r\n') + '\r\n';
}

const round1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : '');
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const numOr = (v, fallback = '') => (finite(v) ? Number(v) : fallback);

// Weights are stored in pounds. Both units are exported so the file is
// unambiguous whichever way the user reads it.
export function setsCsv(sets = [], exercises = []) {
  const names = new Map(exercises.map(e => [e.id, e.name]));
  const rows = [...sets]
    .filter(s => s && s.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
    .map(s => [
      s.date,
      names.get(s.exerciseId) ?? `#${s.exerciseId ?? '?'}`,
      s.type ?? 'strength',
      numOr(s.weight),
      finite(s.weight) ? round1(Number(s.weight) * 0.45359237) : '',
      numOr(s.reps),
      numOr(s.duration),
      numOr(s.distance),
      numOr(s.output),
      numOr(s.restSec),
      numOr(s.round),
      s.groupId ?? '',
      s.notes ?? '',
    ]);

  return toCsv(
    ['date', 'exercise', 'type', 'weight_lb', 'weight_kg', 'reps', 'duration_s', 'distance_m', 'output', 'rest_s', 'round', 'group', 'notes'],
    rows
  );
}

export function fuelCsv(logs = []) {
  const rows = [...logs]
    .filter(l => l && l.date)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')))
    .map(l => [
      l.date,
      typeof l.timestamp === 'string' ? l.timestamp : '',
      numOr(l.proteinGrams),
      numOr(l.calories),
      l.isWholeFood === false ? 'no' : (l.isWholeFood ? 'yes' : ''),
      numOr(l.handPortions?.palms),
      numOr(l.handPortions?.fists),
      numOr(l.handPortions?.cupped),
      numOr(l.handPortions?.thumbs),
      l.notes ?? '',
    ]);

  return toCsv(
    ['date', 'timestamp', 'protein_g', 'calories', 'whole_food', 'palms', 'fists', 'cupped', 'thumbs', 'notes'],
    rows
  );
}

export function waterCsv(logs = []) {
  const rows = [...logs]
    .filter(l => l && l.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => [l.date, numOr(l.glasses)]);

  return toCsv(['date', 'glasses'], rows);
}

export function recoveryCsv(logs = []) {
  const rows = [...logs]
    .filter(l => l && l.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => [l.date, numOr(l.sleepHours), numOr(l.soreness), numOr(l.restingHr), l.note ?? '']);

  return toCsv(['date', 'sleep_h', 'soreness', 'resting_hr', 'note'], rows);
}

// ── Weekly Markdown ────────────────────────────────────────
// A note shaped for Obsidian: one table per domain, no embeds, no HTML.
// Weights stay in lb (the storage unit) and the note says so.

const mean = values => {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

const fmt1 = v => (Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '—');

// Pipes and newlines would break a Markdown table row.
function mdCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function mdTable(header, rows) {
  const head = `| ${header.join(' | ')} |`;
  const rule = `| ${header.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.map(mdCell).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

export function weeklyMarkdown({
  sets = [], exercises = [], recoveryLogs = [], fuelLogs = [], waterLogs = [],
  weekStart = mondayOf(localDateStr()),
} = {}) {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = date => typeof date === 'string' && date >= weekStart && date <= weekEnd;

  const weekSets = sets.filter(s => inWeek(s?.date));
  const weekRecovery = recoveryLogs.filter(l => inWeek(l?.date));
  const weekFuel = fuelLogs.filter(l => inWeek(l?.date));
  const weekWater = waterLogs.filter(l => inWeek(l?.date));

  const names = new Map(exercises.map(e => [e.id, e.name]));
  const trainingDays = new Set(weekSets.map(s => s.date)).size;

  const byExercise = new Map();
  for (const s of weekSets) {
    const key = s.exerciseId ?? '?';
    if (!byExercise.has(key)) byExercise.set(key, []);
    byExercise.get(key).push(s);
  }

  const trainingRows = [...byExercise.entries()]
    .map(([id, group]) => {
      const strength = group.filter(s => finite(s.weight) && finite(s.reps) && Number(s.reps) > 0);
      const reps = strength.reduce((sum, s) => sum + Number(s.reps), 0);
      const tonnage = strength.reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0);
      const best = strength.sort((a, b) => Number(b.weight) - Number(a.weight) || Number(b.reps) - Number(a.reps))[0];
      return [
        names.get(id) ?? `#${id}`,
        group.length,
        strength.length ? reps : '—',
        strength.length ? `${Math.round(tonnage).toLocaleString('en-US')} lb` : '—',
        best ? `${Number(best.weight)} lb × ${Number(best.reps)}` : '—',
      ];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const tonnage = weekSets.reduce((sum, s) => {
    if (!finite(s.weight) || !finite(s.reps)) return sum;
    const w = Number(s.weight), r = Number(s.reps);
    return r > 0 ? sum + w * r : sum;
  }, 0);

  const lines = [];
  lines.push(`# Pulse — week of ${weekStart}`, '');
  lines.push(`_${weekStart} → ${weekEnd} · weights in lb_`, '');

  lines.push('## Training', '');
  if (weekSets.length === 0) {
    lines.push('_No sets logged this week._', '');
  } else {
    lines.push(`**${weekSets.length} set${weekSets.length === 1 ? '' : 's'}** across **${trainingDays} day${trainingDays === 1 ? '' : 's'}** · ${Math.round(tonnage).toLocaleString('en-US')} lb total tonnage.`, '');
    lines.push(mdTable(['Exercise', 'Sets', 'Reps', 'Tonnage', 'Top set'], trainingRows), '');
  }

  lines.push('## Recovery', '');
  if (weekRecovery.length === 0) {
    lines.push('_No check-ins this week._', '');
  } else {
    const marker = key => weekRecovery.map(l => l[key]).filter(Number.isFinite);
    const sleep = mean(marker('sleepHours'));
    const soreness = mean(marker('soreness'));
    const rhr = mean(marker('restingHr'));
    lines.push(`${weekRecovery.length} of 7 days logged.`, '');
    lines.push(mdTable(
      ['Sleep', 'Soreness', 'Resting HR'],
      [[
        Number.isFinite(sleep) ? `${fmt1(sleep)}h` : '—',
        Number.isFinite(soreness) ? `${fmt1(soreness)}/10` : '—',
        Number.isFinite(rhr) ? `${Math.round(rhr)} bpm` : '—',
      ]]
    ), '');
  }

  lines.push('## Fuel', '');
  if (weekFuel.length === 0 && weekWater.length === 0) {
    lines.push('_Nothing logged this week._', '');
  } else {
    const protein = weekFuel.reduce((sum, l) => sum + (Number(l.proteinGrams) || 0), 0);
    const calories = weekFuel.reduce((sum, l) => sum + (Number(l.calories) || 0), 0);
    const whole = weekFuel.filter(l => l.isWholeFood).length;
    const water = weekWater.reduce((sum, l) => sum + (Number(l.glasses) || 0), 0);
    lines.push(mdTable(
      ['Protein', 'Calories', 'Whole-food', 'Water'],
      [[
        `${Math.round(protein)} g`,
        `${Math.round(calories)} kcal`,
        weekFuel.length ? `${Math.round((whole / weekFuel.length) * 100)}%` : '—',
        water ? `${water} glasses` : '—',
      ]]
    ), '');
  }

  return lines.join('\n').trimEnd() + '\n';
}
