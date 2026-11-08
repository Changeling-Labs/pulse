// ── Starter programmes ─────────────────────────────────────
// Six embedded plans, expressed in the same shape the Planner already
// understands: a list of movement blocks, each with percentage-of-1RM sets.
// Pure data and date-free helpers only — the UI module owns persistence,
// navigation and the actual planner hand-off.
//
// The plans are intentionally small and conservative. A session tells you
// what to do; targets only appear once the matching PR exists, because the
// Planner is honest about not inventing a 1RM.

const SEEDED_LIFTS = new Set([
  'Back Squat',
  'Bench Press',
  'Deadlift',
  'Overhead Press',
  'Romanian Deadlift',
  'Barbell Row',
]);

function day(name, focus, blocks) {
  return { name, focus, blocks };
}

function block(exercise, rmType = 1) {
  return { exercise, rmType };
}

// ── Weekly templates ───────────────────────────────────────
const FULL_BODY_DAYS = [
  day('Full body A', 'Squat · Bench · Row', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
  day('Full body B', 'Deadlift · Press · RDL', [
    block('Deadlift'),
    block('Overhead Press'),
    block('Romanian Deadlift'),
  ]),
  day('Full body C', 'Squat · Bench · Row', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
];

const UPPER_LOWER_DAYS = [
  day('Upper A', 'Bench · Row · Press', [
    block('Bench Press'),
    block('Barbell Row'),
    block('Overhead Press'),
  ]),
  day('Lower A', 'Squat · RDL · Deadlift', [
    block('Back Squat'),
    block('Romanian Deadlift'),
    block('Deadlift'),
  ]),
  day('Upper B', 'Press · Bench · Row', [
    block('Overhead Press'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
  day('Lower B', 'Deadlift · Squat · RDL', [
    block('Deadlift'),
    block('Back Squat'),
    block('Romanian Deadlift'),
  ]),
];

const BEGINNER_DAYS = [
  day('Full body A', 'Squat · Push · Pull', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
  day('Full body B', 'Hinge · Press · Pull', [
    block('Romanian Deadlift'),
    block('Overhead Press'),
    block('Barbell Row'),
  ]),
  day('Full body C', 'Squat · Push · Hinge', [
    block('Back Squat'),
    block('Bench Press'),
    block('Romanian Deadlift'),
  ]),
];

const TWO_DAY_DAYS = [
  day('Full body A', 'Squat · Bench · Row', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
  day('Full body B', 'Deadlift · Press · RDL', [
    block('Deadlift'),
    block('Overhead Press'),
    block('Romanian Deadlift'),
  ]),
];

const PPL_DAYS = [
  day('Push', 'Bench · Press', [
    block('Bench Press'),
    block('Overhead Press'),
  ]),
  day('Pull', 'Row · RDL', [
    block('Barbell Row'),
    block('Romanian Deadlift'),
  ]),
  day('Legs', 'Squat · Deadlift · RDL', [
    block('Back Squat'),
    block('Deadlift'),
    block('Romanian Deadlift'),
  ]),
];

const FIVE_BY_FIVE_DAYS = [
  day('Day A', 'Squat · Bench · Row', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
  day('Day B', 'Squat · Press · Deadlift', [
    block('Back Squat'),
    block('Overhead Press'),
    block('Deadlift'),
  ]),
  day('Day A', 'Squat · Bench · Row', [
    block('Back Squat'),
    block('Bench Press'),
    block('Barbell Row'),
  ]),
];

// Four-week wave for the two returning/regular plans. Volume rises for a
// week, then the final week drops to triples at a little more load.
const STANDARD_WAVE = [
  { sets: [{ pct: 65, reps: 5 }, { pct: 70, reps: 5 }, { pct: 75, reps: 5 }] },
  { sets: [{ pct: 70, reps: 5 }, { pct: 75, reps: 5 }, { pct: 80, reps: 5 }] },
  { sets: [{ pct: 70, reps: 5 }, { pct: 75, reps: 5 }, { pct: 80, reps: 5 }, { pct: 80, reps: 5 }] },
  { sets: [{ pct: 75, reps: 3 }, { pct: 80, reps: 3 }, { pct: 85, reps: 3 }] },
];

// Six-week beginner ramp: two sets in week one, then a third set and a
// small percentage step. Reps fall to six in the final two weeks.
const BEGINNER_WAVE = [
  { sets: [{ pct: 50, reps: 8 }, { pct: 55, reps: 8 }] },
  { sets: [{ pct: 55, reps: 8 }, { pct: 60, reps: 8 }, { pct: 60, reps: 8 }] },
  { sets: [{ pct: 55, reps: 8 }, { pct: 60, reps: 8 }, { pct: 65, reps: 8 }] },
  { sets: [{ pct: 60, reps: 8 }, { pct: 65, reps: 8 }, { pct: 65, reps: 8 }] },
  { sets: [{ pct: 60, reps: 6 }, { pct: 65, reps: 6 }, { pct: 70, reps: 6 }] },
  { sets: [{ pct: 65, reps: 6 }, { pct: 70, reps: 6 }, { pct: 75, reps: 6 }] },
];

const fiveByFive = pct => ({ sets: Array.from({ length: 5 }, () => ({ pct, reps: 5 })) });
const FIVE_BY_FIVE_WAVE = [60, 62.5, 65, 60, 67.5, 70].map(fiveByFive);

export const PROGRAMMES = [
  {
    id: 'full-body-3',
    name: '3-day full body',
    daysPerWeek: 3,
    weeks: 4,
    level: 'returning',
    levelLabel: 'Getting back',
    description: 'Three balanced sessions a week. Squat, hinge, push and pull every time.',
    days: FULL_BODY_DAYS,
    wave: STANDARD_WAVE,
  },
  {
    id: 'upper-lower-4',
    name: '4-day upper / lower',
    daysPerWeek: 4,
    weeks: 4,
    level: 'regular',
    levelLabel: 'Regular',
    description: 'Two upper and two lower sessions a week, with a little more volume.',
    days: UPPER_LOWER_DAYS,
    wave: STANDARD_WAVE,
  },
  {
    id: 'beginner-6',
    name: '6-week beginner',
    daysPerWeek: 3,
    weeks: 6,
    level: 'new',
    levelLabel: 'New to this',
    description: 'A gentle six-week ramp: two sets in week one, then a little more each week.',
    days: BEGINNER_DAYS,
    wave: BEGINNER_WAVE,
  },
  {
    id: 'full-body-2',
    name: '2-day full body',
    daysPerWeek: 2,
    weeks: 4,
    level: 'returning',
    levelLabel: 'Getting back',
    description: 'Two balanced sessions a week for busy weeks. Same lifts, less time.',
    days: TWO_DAY_DAYS,
    wave: STANDARD_WAVE,
  },
  {
    id: 'push-pull-legs-3',
    name: 'Push / pull / legs',
    daysPerWeek: 3,
    weeks: 4,
    level: 'regular',
    levelLabel: 'Regular',
    description: 'A compact push, pull and leg day each week, built from the six seeded lifts.',
    days: PPL_DAYS,
    wave: STANDARD_WAVE,
  },
  {
    id: 'strength-base-5x5',
    name: '5×5 strength base',
    daysPerWeek: 3,
    weeks: 6,
    level: 'regular',
    levelLabel: 'Regular',
    description: 'Three days of five-by-five work, with a lighter middle week to keep the bar moving.',
    days: FIVE_BY_FIVE_DAYS,
    wave: FIVE_BY_FIVE_WAVE,
  },
];

export const PROGRAMME_BY_ID = Object.fromEntries(PROGRAMMES.map(p => [p.id, p]));

export function programmeById(id) {
  return PROGRAMME_BY_ID[id] ?? null;
}

export function sessionCount(programme) {
  if (!programme || !Array.isArray(programme.days)) return 0;
  return programme.days.length * programme.weeks;
}

// A flat sequence of sessions: week 1 day 1..n, week 2 day 1..n, and so on.
// `index` is zero-based so it can be stored as the programme's next position.
export function sessionAt(programme, index) {
  if (!programme || !Number.isInteger(index) || index < 0) return null;
  if (index >= sessionCount(programme)) return null;

  const perWeek = programme.days.length;
  const weekIndex = Math.floor(index / perWeek);
  const dayIndex = index % perWeek;
  const template = programme.days[dayIndex];
  const wave = programme.wave[weekIndex] ?? programme.wave[programme.wave.length - 1];
  if (!template || !wave) return null;

  return {
    index,
    week: weekIndex + 1,
    day: dayIndex + 1,
    totalWeeks: programme.weeks,
    name: template.name,
    focus: template.focus,
    blocks: template.blocks.map(templateBlock => ({
      exercise: templateBlock.exercise,
      rmType: templateBlock.rmType ?? 1,
      sets: wave.sets.map(set => ({ mode: 'pct', value: set.pct, reps: set.reps })),
    })),
  };
}

// The next unfinished session for a stored progress object. Null when the
// programme is complete (nextIndex has walked past the end).
export function nextSession(programme, progress) {
  if (!programme) return null;
  const raw = Number.isInteger(progress?.nextIndex) ? progress.nextIndex : 0;
  return sessionAt(programme, Math.max(0, raw));
}

// A compact "Week 2 · Day 1" label for cards and banners.
export function sessionLabel(session) {
  if (!session) return '';
  return `Week ${session.week} · Day ${session.day}`;
}

export function programmeExercises(session) {
  if (!session) return '';
  return session.blocks.map(block => block.exercise).join(' · ');
}

// Exposed for tests and for a future curated library: every programme must
// name an exercise the first-run seed actually creates.
export function usesSeededLifts(programme) {
  return programme.days.every(dayDef =>
    dayDef.blocks.every(blockDef => SEEDED_LIFTS.has(blockDef.exercise))
  );
}
