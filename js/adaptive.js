// ── Adaptive daily generation ──────────────────────────────
// Pure selection logic for "today's move". It reads local history (sets and
// exercises), the chosen goal and the latest recovery check-in, then returns
// the same plan envelope as js/movements.js with one extra plain-language
// reason. No DOM, no IndexedDB, no network and no clock.
//
// Guardrails: this is a suggestion engine, not a readiness score. It never
// diagnoses, predicts injury or prescribes rehab; every generated session is
// editable and skippable, and a recovery-lighter day always offers the usual
// session as an override.

import { FOCUS, dailyPlan } from './movements.js';
import { PATTERNS, inferPattern } from './patterns.js';

export const GOALS = [
  {
    id: 'move',
    label: 'Get moving',
    hint: 'Short, low-impact sessions that are easy to repeat.',
    weights: { full: 2, upper: 1, lower: 1, core: 2, cardio: 3, mobility: 1, rest: 1 },
  },
  {
    id: 'strength',
    label: 'Build strength',
    hint: 'Strength first, with a little more volume and longer rests.',
    weights: { full: 4, upper: 2, lower: 3, core: 1, cardio: 1, mobility: 1, rest: 1 },
  },
  {
    id: 'recomp',
    label: 'Lose fat, keep muscle',
    hint: 'Strength plus cardio. Keep protein high in Fuel.',
    weights: { full: 2, upper: 1, lower: 2, core: 2, cardio: 3, mobility: 1, rest: 1 },
  },
  {
    id: 'return',
    label: 'Return to activity',
    hint: 'Mobility, low impact and a conservative ramp.',
    weights: { full: 1, upper: 1, lower: 1, core: 2, cardio: 1, mobility: 4, rest: 2 },
  },
  {
    id: 'heart',
    label: 'Heart health',
    hint: 'More zone-2 and interval cardio.',
    weights: { full: 1, upper: 1, lower: 1, core: 1, cardio: 4, mobility: 1, rest: 1 },
  },
  {
    id: 'preserve',
    label: 'Preserve muscle',
    hint: 'Strength priority while losing weight; protein is surfaced in Fuel.',
    weights: { full: 3, upper: 2, lower: 3, core: 1, cardio: 1, mobility: 1, rest: 1 },
  },
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map(goal => [goal.id, goal]));
export const DEFAULT_GOAL = 'move';

const FOCUS_META = Object.fromEntries(FOCUS.map(focus => [
  focus.id,
  { label: focus.label, patterns: focus.patterns },
]));
FOCUS_META.mobility = { label: 'Mobility', patterns: ['mobility'] };
FOCUS_META.rest = { label: 'Rest day', patterns: [] };

const FOCUS_ORDER = ['full', 'upper', 'lower', 'core', 'cardio', 'mobility', 'rest'];

export function goalById(id) {
  return GOAL_BY_ID[id] ?? GOAL_BY_ID[DEFAULT_GOAL];
}

// ── Dates ──────────────────────────────────────────────────
// Local calendar strings only. Date.UTC keeps the difference stable across
// DST and timezones; nothing here reads the wall clock.
function dayNumber(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

export function dayDiff(from, to) {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null || b === null) return null;
  return Math.round(b - a);
}

function shiftDateStr(dateStr, delta) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// ── History ────────────────────────────────────────────────
// Days since the most recent set for each pattern, looking only at days
// before `date`. Excluding today keeps the suggestion stable while the user
// logs sets during the day.
export function patternGaps(sets, exercises, date) {
  const gaps = Object.fromEntries(PATTERNS.map(pattern => [pattern, null]));
  const byId = new Map((exercises || []).map(exercise => [exercise.id, exercise]));
  const latest = {};

  for (const set of sets || []) {
    if (!set?.date || set.date >= date) continue;
    const exercise = byId.get(set.exerciseId);
    if (!exercise) continue;
    const pattern = exercise.pattern || inferPattern(exercise.name);
    if (!PATTERNS.includes(pattern)) continue;
    if (!latest[pattern] || set.date > latest[pattern]) latest[pattern] = set.date;
  }

  for (const pattern of PATTERNS) {
    if (latest[pattern]) gaps[pattern] = dayDiff(latest[pattern], date);
  }
  return gaps;
}

function hasThreeDaysInARow(sets, date) {
  const dates = new Set((sets || [])
    .filter(set => set?.date && set.date < date)
    .map(set => set.date));
  return [1, 2, 3].every(delta => dates.has(shiftDateStr(date, -delta)));
}

// ── Recovery ───────────────────────────────────────────────
function formatHours(hours) {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

// A gentle cue, not a score. Only the latest check-in from the last two days
// can move the suggestion; older data is ignored rather than treated as a
// standing verdict.
export function recoverySignal(recovery, date) {
  if (!recovery?.date) return null;
  const age = dayDiff(recovery.date, date);
  if (age === null || age < 0 || age > 2) return null;

  const soreness = Number(recovery.soreness);
  const sleep = Number(recovery.sleepHours);
  const sore = Number.isFinite(soreness) && soreness >= 7;
  const short = Number.isFinite(sleep) && sleep < 6;
  if (!sore && !short) return null;

  let detail;
  if (sore && short) detail = `soreness ${Math.round(soreness)}/10 and ${formatHours(sleep)} sleep`;
  else if (sore) detail = `soreness ${Math.round(soreness)}/10`;
  else detail = `${formatHours(sleep)} sleep`;

  return { reason: `Your last check-in had ${detail}, so today is mobility.` };
}

// ── Choice ─────────────────────────────────────────────────
function reasonFor(focus, gaps, goal) {
  const meta = FOCUS_META[focus];
  const ranked = meta.patterns
    .map(pattern => ({ pattern, days: gaps[pattern] }))
    .filter(item => Number.isFinite(item.days))
    .sort((a, b) => b.days - a.days);
  const top = ranked[0];

  if (top && top.days >= 4) {
    return `${meta.label} today — you haven't ${patternVerb(top.pattern)} in ${top.days} days.`;
  }
  if (focus === 'full') {
    return `Full body today — a balanced choice for your ${goal.label.toLowerCase()} goal.`;
  }
  return `${meta.label} today — it fits your ${goal.label.toLowerCase()} goal.`;
}

function patternVerb(pattern) {
  switch (pattern) {
    case 'push': return 'pressed';
    case 'pull': return 'pulled';
    case 'squat': return 'squatted';
    case 'hinge': return 'hinged';
    case 'carry': return 'carried';
    case 'core': return 'trained your core';
    case 'cardio': return 'done cardio';
    case 'mobility': return 'done mobility';
    default: return 'trained that pattern';
  }
}

export function chooseFocus({ goal, gaps, sets, date }) {
  if (hasThreeDaysInARow(sets, date)) {
    return {
      focus: 'rest',
      reason: "You've trained three days in a row — today is a rest day.",
    };
  }

  const ranked = FOCUS_ORDER
    .filter(focus => focus !== 'rest')
    .map(focus => {
      const meta = FOCUS_META[focus];
      const needs = meta.patterns.map(pattern => gaps[pattern] ?? 7);
      const need = needs.length
        ? needs.reduce((sum, value) => sum + value, 0) / needs.length
        : 0;
      const weight = goal.weights[focus] ?? 1;
      return { focus, score: weight * (need + 1) };
    })
    .sort((a, b) => b.score - a.score || FOCUS_ORDER.indexOf(a.focus) - FOCUS_ORDER.indexOf(b.focus));

  const best = ranked[0];
  return { focus: best.focus, reason: reasonFor(best.focus, gaps, goal) };
}

// ── Plan ───────────────────────────────────────────────────
export function adaptiveDailyPlan({
  date,
  level = 'returning',
  goal = DEFAULT_GOAL,
  exercises = [],
  sets = [],
  recovery = null,
  override = false,
} = {}) {
  const base = dailyPlan(date, { level });
  if (!base) return null;
  const goalDef = goalById(goal);
  const history = (sets || []).filter(set => set?.date && set.date < date);

  if (history.length === 0) {
    return {
      ...base,
      goal: goalDef,
      reason: 'A balanced start while Pulse learns your history.',
      lighter: false,
      usualKind: null,
      gaps: null,
    };
  }

  const gaps = patternGaps(sets, exercises, date);
  const choice = chooseFocus({ goal: goalDef, gaps, sets, date });
  let kind = choice.focus;
  let reason = choice.reason;
  let usualKind = null;
  let lighter = false;

  const cue = override ? null : recoverySignal(recovery, date);
  if (cue) {
    if (kind === 'mobility') {
      reason = cue.reason;
    } else if (kind !== 'rest') {
      usualKind = kind;
      kind = 'mobility';
      reason = cue.reason;
      lighter = true;
    }
  }

  const plan = dailyPlan(date, { level, kind });
  return { ...plan, goal: goalDef, reason, lighter, usualKind, gaps };
}
