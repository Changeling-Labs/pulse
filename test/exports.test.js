import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, mondayOf, csvCell, toCsv, setsCsv, fuelCsv, waterCsv, recoveryCsv,
  weeklyMarkdown,
} from '../js/exports.js';

// ── Dates ──────────────────────────────────────────────────
test('week helpers stay on calendar days', () => {
  assert.equal(mondayOf('2026-11-06'), '2026-11-02');
  assert.equal(addDays('2026-11-02', 6), '2026-11-08');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

// ── CSV basics ─────────────────────────────────────────────
test('csvCell quotes only when needed and doubles embedded quotes', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
});

test('toCsv emits CRLF rows and a trailing newline', () => {
  const out = toCsv(['a', 'b'], [[1, 2], [3, 4]]);
  assert.equal(out, 'a,b\r\n1,2\r\n3,4\r\n');
});

// ── Sets ───────────────────────────────────────────────────
test('setsCsv names exercises, converts kg and sorts by date', () => {
  const sets = [
    { id: 2, date: '2026-11-03', exerciseId: 2, type: 'timed', duration: 60, notes: '' },
    { id: 1, date: '2026-11-02', exerciseId: 1, type: 'strength', weight: 100, reps: 5, notes: 'felt heavy' },
  ];
  const exercises = [{ id: 1, name: 'Back Squat' }, { id: 2, name: 'Plank' }];
  const lines = setsCsv(sets, exercises).trim().split('\r\n');

  assert.equal(lines[0], 'date,exercise,type,weight_lb,weight_kg,reps,duration_s,distance_m,output,rest_s,round,group,notes');
  assert.equal(lines[1], '2026-11-02,Back Squat,strength,100,45.4,5,,,,,,,felt heavy');
  assert.equal(lines[2], '2026-11-03,Plank,timed,,,,60,,,,,,');
});

test('setsCsv falls back to the id when the exercise is gone', () => {
  const out = setsCsv([{ date: '2026-11-02', exerciseId: 99, type: 'strength', weight: 0, reps: 10 }], []);
  assert.match(out, /2026-11-02,#99,strength,0,0,10/);
});

test('setsCsv tolerates an empty history', () => {
  const out = setsCsv([], []);
  assert.equal(out, 'date,exercise,type,weight_lb,weight_kg,reps,duration_s,distance_m,output,rest_s,round,group,notes\r\n');
});

// ── Fuel, water, recovery ──────────────────────────────────
test('fuelCsv exports portions, macros and quality', () => {
  const out = fuelCsv([{
    date: '2026-11-02', timestamp: '2026-11-02T12:00:00.000Z', proteinGrams: 50,
    calories: 400, isWholeFood: true, handPortions: { palms: 2, fists: 1, cupped: 1, thumbs: 1 }, notes: '',
  }]);
  const line = out.trim().split('\r\n')[1];
  assert.equal(line, '2026-11-02,2026-11-02T12:00:00.000Z,50,400,yes,2,1,1,1,');
});

test('fuelCsv marks processed food as no', () => {
  const out = fuelCsv([{ date: '2026-11-02', isWholeFood: false, handPortions: {} }]);
  assert.match(out, /,no,,,,,/);
});

test('waterCsv and recoveryCsv sort and keep empty metrics blank', () => {
  const water = waterCsv([{ date: '2026-11-03', glasses: 8 }, { date: '2026-11-02', glasses: 6 }]);
  assert.equal(water, 'date,glasses\r\n2026-11-02,6\r\n2026-11-03,8\r\n');

  const recovery = recoveryCsv([
    { date: '2026-11-03', sleepHours: 7.5, soreness: 4, restingHr: null, note: 'slept well' },
    { date: '2026-11-02', sleepHours: null, soreness: null, restingHr: 58, note: '' },
  ]);
  const lines = recovery.trim().split('\r\n');
  assert.equal(lines[1], '2026-11-02,,,58,');
  assert.equal(lines[2], '2026-11-03,7.5,4,,slept well');
});

// ── Weekly Markdown ────────────────────────────────────────
const exercises = [{ id: 1, name: 'Back Squat' }, { id: 2, name: 'Rowing' }];
const sets = [
  { date: '2026-11-02', exerciseId: 1, type: 'strength', weight: 100, reps: 5 },
  { date: '2026-11-02', exerciseId: 1, type: 'strength', weight: 120, reps: 3 },
  { date: '2026-11-04', exerciseId: 2, type: 'distance', distance: 2000, duration: 420 },
  { date: '2026-11-10', exerciseId: 1, type: 'strength', weight: 200, reps: 5 },   // next week
];

test('weeklyMarkdown summarises training for the Monday–Sunday window', () => {
  const md = weeklyMarkdown({ sets, exercises, weekStart: '2026-11-02' });
  assert.match(md, /^# Pulse — week of 2026-11-02/);
  assert.match(md, /2026-11-02 → 2026-11-08/);
  assert.match(md, /\*\*3 sets\*\* across \*\*2 days\*\*/);
  assert.match(md, /\| Back Squat \| 2 \| 8 \| 860 lb \| 120 lb × 3 \|/);
  assert.match(md, /\| Rowing \| 1 \| — \| — \| — \|/);
  assert.doesNotMatch(md, /200 lb/);            // next week is excluded
});

test('weeklyMarkdown includes recovery averages and ignores missing markers', () => {
  const recoveryLogs = [
    { date: '2026-11-03', sleepHours: 7, soreness: 4, restingHr: 60 },
    { date: '2026-11-04', sleepHours: 8, soreness: null, restingHr: 58 },
  ];
  const md = weeklyMarkdown({ recoveryLogs, weekStart: '2026-11-02' });
  assert.match(md, /2 of 7 days logged/);
  assert.match(md, /\| 7\.5h \| 4\/10 \| 59 bpm \|/);
});

test('weeklyMarkdown totals fuel and water', () => {
  const fuelLogs = [
    { date: '2026-11-02', proteinGrams: 50, calories: 400, isWholeFood: true },
    { date: '2026-11-03', proteinGrams: 30, calories: 300, isWholeFood: false },
  ];
  const waterLogs = [{ date: '2026-11-02', glasses: 8 }];
  const md = weeklyMarkdown({ fuelLogs, waterLogs, weekStart: '2026-11-02' });
  assert.match(md, /\| 80 g \| 700 kcal \| 50% \| 8 glasses \|/);
});

test('weeklyMarkdown writes friendly empty sections', () => {
  const md = weeklyMarkdown({ weekStart: '2026-11-02' });
  assert.match(md, /_No sets logged this week\._/);
  assert.match(md, /_No check-ins this week\._/);
  assert.match(md, /_Nothing logged this week\._/);
});

test('weeklyMarkdown escapes pipes and newlines in notes', () => {
  const md = weeklyMarkdown({
    sets: [{ date: '2026-11-02', exerciseId: 1, type: 'strength', weight: 100, reps: 5 }],
    exercises: [{ id: 1, name: 'Back | Squat' }],
    weekStart: '2026-11-02',
  });
  assert.match(md, /Back \\\| Squat/);
  assert.match(md, /\| 1 \| 5 \| 500 lb \| 100 lb × 5 \|/);
});
