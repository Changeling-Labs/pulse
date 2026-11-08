import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRAMMES, PROGRAMME_BY_ID, programmeById, sessionCount, sessionAt,
  nextSession, sessionLabel, programmeExercises, usesSeededLifts,
} from '../js/programmes.js';

const SEEDED_LIFTS = new Set([
  'Back Squat',
  'Bench Press',
  'Deadlift',
  'Overhead Press',
  'Romanian Deadlift',
  'Barbell Row',
]);

test('starter programmes are well-formed and uniquely identified', () => {
  assert.equal(PROGRAMMES.length, 3);
  const ids = new Set(PROGRAMMES.map(p => p.id));
  assert.equal(ids.size, PROGRAMMES.length);

  for (const programme of PROGRAMMES) {
    assert.ok(programme.name, `${programme.id} needs a name`);
    assert.ok(programme.description && programme.description.length > 20);
    assert.ok(programme.levelLabel);
    assert.equal(programme.daysPerWeek, programme.days.length);
    assert.ok(programme.weeks >= 1);
    assert.equal(programme.wave.length, programme.weeks);
    assert.equal(PROGRAMME_BY_ID[programme.id], programme);
    assert.equal(programmeById(programme.id), programme);
    assert.equal(usesSeededLifts(programme), true);
  }

  assert.equal(programmeById('nope'), null);
});

test('programme lengths match their weekly structure', () => {
  assert.equal(sessionCount(programmeById('full-body-3')), 12);
  assert.equal(sessionCount(programmeById('upper-lower-4')), 16);
  assert.equal(sessionCount(programmeById('beginner-6')), 18);
  assert.equal(sessionCount(null), 0);
});

test('sessions walk week by week and day by day', () => {
  const programme = programmeById('full-body-3');

  const first = sessionAt(programme, 0);
  assert.equal(first.week, 1);
  assert.equal(first.day, 1);
  assert.equal(first.name, 'Full body A');
  assert.equal(first.blocks.length, 3);

  const third = sessionAt(programme, 2);
  assert.equal(third.week, 1);
  assert.equal(third.day, 3);
  assert.equal(third.name, 'Full body C');

  const weekTwo = sessionAt(programme, 3);
  assert.equal(weekTwo.week, 2);
  assert.equal(weekTwo.day, 1);

  const last = sessionAt(programme, 11);
  assert.equal(last.week, 4);
  assert.equal(last.day, 3);

  assert.equal(sessionAt(programme, -1), null);
  assert.equal(sessionAt(programme, 1.5), null);
  assert.equal(sessionAt(programme, 12), null);
  assert.equal(sessionAt(null, 0), null);
});

test('every session block names a seeded lift and carries valid sets', () => {
  for (const programme of PROGRAMMES) {
    for (let index = 0; index < sessionCount(programme); index++) {
      const session = sessionAt(programme, index);
      assert.equal(session.index, index);
      assert.ok(session.name);
      assert.ok(session.focus);

      for (const block of session.blocks) {
        assert.ok(SEEDED_LIFTS.has(block.exercise), `${programme.id} names ${block.exercise}`);
        assert.ok([1, 3, 5].includes(block.rmType));
        assert.ok(block.sets.length >= 2);
        for (const set of block.sets) {
          assert.equal(set.mode, 'pct');
          assert.ok(set.value >= 40 && set.value <= 95, `${block.exercise} has ${set.value}%`);
          assert.ok(set.reps >= 1 && set.reps <= 12);
        }
      }
    }
  }
});

test('the standard wave builds volume then a heavier triple week', () => {
  const programme = programmeById('full-body-3');
  const week1 = sessionAt(programme, 0);
  const week3 = sessionAt(programme, 6);
  const week4 = sessionAt(programme, 9);

  const maxPct = session => Math.max(...session.blocks[0].sets.map(s => s.value));
  assert.equal(maxPct(week1), 75);
  assert.equal(week3.blocks[0].sets.length, 4);
  assert.ok(maxPct(week3) >= maxPct(week1));
  assert.ok(maxPct(week4) >= maxPct(week1));
  assert.equal(week4.blocks[0].sets[0].reps, 3);
});

test('the beginner programme starts with two sets and ramps gently', () => {
  const programme = programmeById('beginner-6');
  const week1 = sessionAt(programme, 0);
  const week2 = sessionAt(programme, 3);
  const week6 = sessionAt(programme, 15);

  assert.equal(week1.blocks[0].sets.length, 2);
  assert.equal(week2.blocks[0].sets.length, 3);
  assert.equal(week6.blocks[0].sets.length, 3);
  assert.ok(Math.max(...week1.blocks[0].sets.map(s => s.value)) <= 60);
  assert.ok(Math.max(...week6.blocks[0].sets.map(s => s.value)) <= 80);
  assert.equal(week6.blocks[0].sets[0].reps, 6);
});

test('nextSession follows nextIndex and stops at the end', () => {
  const programme = programmeById('beginner-6');

  assert.equal(nextSession(programme, null).index, 0);
  assert.equal(nextSession(programme, { nextIndex: 5 }).index, 5);
  assert.equal(nextSession(programme, { nextIndex: -3 }).index, 0);
  assert.equal(nextSession(programme, { nextIndex: 18 }), null);
  assert.equal(nextSession(programme, { nextIndex: 99 }), null);
  assert.equal(nextSession(null, { nextIndex: 0 }), null);
});

test('labels read as useful card text', () => {
  const session = sessionAt(programmeById('upper-lower-4'), 5);
  assert.equal(sessionLabel(session), 'Week 2 · Day 2');
  assert.match(programmeExercises(session), /^Back Squat · Romanian Deadlift · Deadlift$/);
  assert.equal(sessionLabel(null), '');
  assert.equal(programmeExercises(null), '');
});

test('session generation is deterministic and date-free', () => {
  const programme = programmeById('upper-lower-4');
  const a = sessionAt(programme, 7);
  const b = sessionAt(programme, 7);
  assert.deepEqual(a, b);
  assert.equal(sessionLabel(a), sessionLabel(b));
});
