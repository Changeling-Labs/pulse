import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, PATTERN_LABELS, inferPattern, isPattern, patternLabel } from '../js/patterns.js';

test('the pattern taxonomy is fixed and labelled', () => {
  assert.deepEqual(PATTERNS, ['push', 'pull', 'squat', 'hinge', 'carry', 'core', 'cardio', 'mobility']);
  assert.equal(new Set(PATTERNS).size, PATTERNS.length);
  for (const pattern of PATTERNS) {
    assert.ok(PATTERN_LABELS[pattern], `${pattern} needs a label`);
    assert.equal(isPattern(pattern), true);
    assert.equal(patternLabel(pattern), PATTERN_LABELS[pattern]);
  }
  assert.equal(isPattern('bogus'), false);
  assert.equal(patternLabel('bogus'), 'General');
});

test('the seeded lifts infer the expected patterns', () => {
  assert.equal(inferPattern('Back Squat'), 'squat');
  assert.equal(inferPattern('Bench Press'), 'push');
  assert.equal(inferPattern('Deadlift'), 'hinge');
  assert.equal(inferPattern('Overhead Press'), 'push');
  assert.equal(inferPattern('Romanian Deadlift'), 'hinge');
  assert.equal(inferPattern('Barbell Row'), 'pull');
});

test('quick-session movements infer the expected patterns', () => {
  assert.equal(inferPattern('Incline push-up'), 'push');
  assert.equal(inferPattern('Dumbbell shoulder press'), 'push');
  assert.equal(inferPattern('Towel row'), 'pull');
  assert.equal(inferPattern('Band row'), 'pull');
  assert.equal(inferPattern('Glute bridge'), 'hinge');
  assert.equal(inferPattern('Step-up'), 'squat');
  assert.equal(inferPattern('Plank'), 'core');
  assert.equal(inferPattern('Hollow hold'), 'core');
  assert.equal(inferPattern('March in place'), 'cardio');
  assert.equal(inferPattern('Jumping jacks'), 'cardio');
  assert.equal(inferPattern('Mountain climbers'), 'cardio');
});

test('mobility and carry names beat broader keywords', () => {
  assert.equal(inferPattern('Couch stretch — left'), 'mobility');
  assert.equal(inferPattern('Hamstring stretch — right'), 'mobility');
  assert.equal(inferPattern('Doorway pec stretch'), 'mobility');
  assert.equal(inferPattern('Farmer carry'), 'carry');
  assert.equal(inferPattern('Suitcase carry'), 'carry');
});

test('ambiguous names resolve sensibly and unknown names fall back to core', () => {
  assert.equal(inferPattern('Bicep curl'), 'pull');
  assert.equal(inferPattern('Leg curl'), 'hinge');
  assert.equal(inferPattern('Lat pulldown'), 'pull');
  assert.equal(inferPattern('Pec deck'), 'push');
  assert.equal(inferPattern('Rowing'), 'cardio');
  assert.equal(inferPattern('Something unusual'), 'core');
  assert.equal(inferPattern(''), 'core');
  assert.equal(inferPattern(null), 'core');
});
