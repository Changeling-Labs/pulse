import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, HOLD_ROUTINES, getPreset, getHoldRoutine, holdRoutinesFor,
  blocksForIntervals, blocksForHolds, totalSeconds, workSeconds,
  newRun, tickRun, pauseRun, resumeRun, skipBlock,
  runProgress, completedEfforts, runSummary, describeBlock,
} from '../js/intervals.js';

const types = blocks => blocks.map(b => b.type);

test('presets are well-formed and uniquely identified', () => {
  const ids = new Set(PRESETS.map(p => p.id));
  assert.equal(ids.size, PRESETS.length);
  for (const p of PRESETS) {
    assert.ok(p.name && p.hint);
    assert.ok(p.workSec > 0 && p.rounds > 0 && p.restSec >= 0);
  }
});

test('Tabata builds prep, 8 work blocks and 7 rests (no trailing rest)', () => {
  const blocks = blocksForIntervals(getPreset('tabata'));
  assert.equal(blocks.length, 1 + 8 + 7);
  assert.equal(blocks[0].type, 'prep');
  assert.equal(blocks.filter(b => b.type === 'work').length, 8);
  assert.equal(blocks.filter(b => b.type === 'rest').length, 7);
  assert.equal(blocks.at(-1).type, 'work');
  assert.equal(totalSeconds(blocks), 10 + 8 * 20 + 7 * 10);
});

test('EMOM marks every work block with its minute number', () => {
  const blocks = blocksForIntervals(getPreset('emom'));
  const work = blocks.filter(b => b.type === 'work');
  assert.equal(work.length, 10);
  assert.deepEqual(work.map(b => b.round), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(work.every(b => b.of === 10));
  assert.ok(work.every(b => b.seconds === 40));
});

test('zero rest produces back-to-back work blocks', () => {
  const blocks = blocksForIntervals({ workSec: 60, restSec: 0, rounds: 5, prepSec: 0 });
  assert.deepEqual(types(blocks), ['work', 'work', 'work', 'work', 'work']);
});

test('custom plans sanitise bad input instead of emitting zero blocks', () => {
  const blocks = blocksForIntervals({ workSec: 0, restSec: -10, rounds: 0, prepSec: -5 });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'work');
  assert.equal(blocks[0].seconds, 1);
});

test('hold routines become named holds with transitions between them', () => {
  const routine = getHoldRoutine('lower');
  const blocks = blocksForHolds(routine);
  const holds = blocks.filter(b => b.type === 'hold');
  assert.equal(holds.length, routine.holds.length);
  assert.equal(holds[0].label, 'Couch stretch — left');
  assert.equal(blocks.filter(b => b.type === 'rest').length, routine.holds.length - 1);
  assert.ok(blocks.filter(b => b.type === 'rest').every(b => b.label === 'Transition'));
  assert.equal(workSeconds(blocks), routine.holds.reduce((s, h) => s + h.seconds, 0));
});

test('hold routines are well-formed and split by surface', () => {
  const ids = new Set(HOLD_ROUTINES.map(r => r.id));
  assert.equal(ids.size, HOLD_ROUTINES.length);

  for (const routine of HOLD_ROUTINES) {
    assert.ok(routine.name && routine.hint);
    assert.ok(['move', 'recover'].includes(routine.context));
    assert.ok(routine.holds.length > 0);
    assert.ok(routine.holds.every(hold => hold.label && hold.seconds > 0));
  }

  assert.deepEqual(holdRoutinesFor('move').map(r => r.id), ['lower', 'upper']);
  const recover = holdRoutinesFor('recover').map(r => r.id);
  assert.deepEqual(recover, ['wind-down', 'desk-reset']);
  assert.equal(getHoldRoutine('wind-down').name, 'Evening wind-down');
});

test('an empty or malformed routine yields no blocks', () => {
  assert.deepEqual(blocksForHolds(null), []);
  assert.deepEqual(blocksForHolds({ holds: [] }), []);
});

test('newRun starts on the first block, full and running', () => {
  const run = newRun(blocksForIntervals(getPreset('tabata')), { name: 'Tabata' });
  assert.equal(run.block.type, 'prep');
  assert.equal(run.remainingMs, 10000);
  assert.equal(run.elapsedMs, 0);
  assert.equal(run.running, true);
  assert.equal(run.done, false);
  assert.equal(run.totalMs, 240000);
});

test('a partial tick reduces remaining and accrues elapsed', () => {
  const start = newRun(blocksForIntervals(getPreset('tabata')));
  const { run, entered } = tickRun(start, 4000);
  assert.equal(run.remainingMs, 6000);
  assert.equal(run.elapsedMs, 4000);
  assert.deepEqual(entered, []);
  assert.equal(run.index, 0);
});

test('crossing a boundary enters the next block and cues it', () => {
  const start = newRun(blocksForIntervals(getPreset('tabata')));
  const { run, entered } = tickRun(start, 10000);
  assert.equal(entered.length, 1);
  assert.equal(entered[0].type, 'work');
  assert.equal(run.block.type, 'work');
  assert.equal(run.remainingMs, 20000);
  assert.equal(run.elapsedMs, 10000);
  assert.equal(run.running, true);
});

test('one large delta can cross several boundaries (throttled tab)', () => {
  const start = newRun(blocksForIntervals(getPreset('tabata')));
  // prep 10s + work 20s + rest 10s + work 20s = 60s lands 5s into the
  // second rest? No: 10+20+10 = 40s completes rest; 60s is 20s into the
  // second work, which ends exactly there, so we enter the second rest.
  const { run, entered } = tickRun(start, 60000);
  assert.deepEqual(entered.map(b => b.type), ['work', 'rest', 'work', 'rest']);
  assert.equal(run.block.type, 'rest');
  assert.equal(run.remainingMs, 10000);
});

test('ticking past the end finishes exactly at the last effort', () => {
  const blocks = blocksForIntervals(getPreset('tabata'));
  const start = newRun(blocks, { name: 'Tabata' });
  const { run, entered } = tickRun(start, totalSeconds(blocks) * 1000 + 5000);
  assert.equal(run.done, true);
  assert.equal(run.running, false);
  assert.equal(run.remainingMs, 0);
  assert.equal(run.elapsedMs, totalSeconds(blocks) * 1000);
  assert.equal(entered.at(-1).type, 'done');
});

test('a paused run ignores ticks and resumes where it stopped', () => {
  const start = newRun(blocksForIntervals(getPreset('tabata')));
  const paused = pauseRun(tickRun(start, 3000).run);
  const { run, entered } = tickRun(paused, 5000);
  assert.equal(run.remainingMs, 7000);
  assert.equal(run.elapsedMs, 3000);
  assert.deepEqual(entered, []);
  assert.equal(resumeRun(run).running, true);
});

test('skipping advances and keeps a paused run paused', () => {
  const start = pauseRun(newRun(blocksForIntervals(getPreset('tabata'))));
  const { run, entered } = skipBlock(start);
  assert.equal(entered[0].type, 'work');
  assert.equal(run.block.type, 'work');
  assert.equal(run.running, false);
});

test('progress and completed efforts track the run', () => {
  const blocks = blocksForIntervals(getPreset('tabata'));
  const start = newRun(blocks);
  assert.equal(runProgress(start), 0);
  assert.equal(completedEfforts(start), 0);

  // prep + work 1 + rest 1
  const { run } = tickRun(start, 10000 + 20000 + 10000);
  assert.equal(completedEfforts(run), 1);
  assert.ok(runProgress(run) > 0.16 && runProgress(run) < 0.19);
});

test('summary counts only fully completed efforts', () => {
  const blocks = blocksForIntervals(getPreset('tabata'));
  const start = newRun(blocks, { name: 'Tabata', kind: 'tabata' });
  const partial = tickRun(start, 10000 + 20000).run;   // prep + work 1
  const summary = runSummary(partial);
  assert.equal(summary.name, 'Tabata');
  assert.equal(summary.kind, 'tabata');
  assert.equal(summary.rounds, 1);
  assert.equal(summary.finished, false);
  assert.equal(summary.workSec, 160);
  assert.equal(summary.totalSec, 240);
});

test('describeBlock gives the next-up text for each block type', () => {
  assert.equal(describeBlock({ type: 'prep', seconds: 10 }), 'Get ready · 10s');
  assert.equal(describeBlock({ type: 'rest', label: 'Rest', seconds: 10 }), 'Rest · 10s');
  assert.equal(describeBlock({ type: 'work', label: 'Work', seconds: 20 }), 'Work · 20s');
  assert.equal(describeBlock({ type: 'hold', label: 'Deep squat hold', seconds: 45 }), 'Deep squat hold · 45s');
  assert.equal(describeBlock(null), 'Done');
});
