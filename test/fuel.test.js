import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHandPortions,
  PORTION_MACROS,
  PORTION_KEYS,
  PORTION_LABELS,
  PORTION_EXAMPLES,
  MEAL_TEMPLATES,
  describePortions,
  weeklyHandPortions,
  MYTH_CARDS,
  getDailyMythCard,
  getRandomMythCard,
} from '../js/fuel.js';

test('calcHandPortions converts portions to macros and calories', () => {
  const out = calcHandPortions({ palms: 2, fists: 1, cupped: 1, thumbs: 1 });
  assert.equal(out.proteinGrams, 50);            // 2 × 25g
  assert.equal(out.carbsGrams, 15);              // 1 × 15g
  assert.equal(out.fatGrams, 10);                // 1 × 10g
  assert.equal(out.calories, 50 * 4 + 15 * 4 + 10 * 9);  // 390
  assert.equal(out.vegFists, 1);
});

test('calcHandPortions zeroes fists of macros (vegetable anchor only)', () => {
  const out = calcHandPortions({ fists: 4 });
  assert.equal(out.calories, 0);
  assert.equal(out.proteinGrams, 0);
  assert.equal(out.vegFists, 4);
});

test('calcHandPortions clamps garbage input to zero', () => {
  assert.deepEqual(calcHandPortions({ palms: -2 }).proteinGrams, 0);
  assert.deepEqual(calcHandPortions({ palms: 'abc' }).proteinGrams, 0);
  assert.deepEqual(calcHandPortions({}).proteinGrams, 0);
  assert.equal(calcHandPortions({ palms: 2.9 }).palms, 2);
});

test('calcHandPortions keys match the PORTION_MACROS contract', () => {
  assert.equal(PORTION_MACROS.proteinPerPalm, 25);
  assert.equal(PORTION_MACROS.carbsPerCupped, 15);
  assert.equal(PORTION_MACROS.fatPerThumb, 10);
  assert.equal(PORTION_MACROS.caloriesPerProtein, 4);
  assert.equal(PORTION_MACROS.caloriesPerCarb, 4);
  assert.equal(PORTION_MACROS.caloriesPerFat, 9);
});

test('portion metadata covers every category', () => {
  assert.deepEqual(PORTION_KEYS, ['palms', 'fists', 'cupped', 'thumbs']);
  for (const key of PORTION_KEYS) {
    assert.ok(PORTION_LABELS[key][0] && PORTION_LABELS[key][1]);
    assert.ok(PORTION_EXAMPLES[key]);
  }
});

test('meal templates are well-formed and usable', () => {
  assert.ok(MEAL_TEMPLATES.length >= 6);
  assert.equal(new Set(MEAL_TEMPLATES.map(t => t.id)).size, MEAL_TEMPLATES.length);
  for (const template of MEAL_TEMPLATES) {
    assert.ok(template.name);
    assert.equal(typeof template.wholeFood, 'boolean');
    assert.ok(template.note);
    assert.notEqual(describePortions(template.portions), 'No portions');
    for (const key of PORTION_KEYS) {
      assert.ok(Number.isInteger(template.portions[key]), `${template.id}.${key} is an integer`);
      assert.ok(template.portions[key] >= 0);
    }
  }
});

test('describePortions reads as a compact portion line', () => {
  assert.equal(describePortions({ palms: 2, fists: 1, cupped: 0, thumbs: 1 }), '2 palms · 1 fist · 1 thumb');
  assert.equal(describePortions({ palms: 0, fists: 0, cupped: 0, thumbs: 0 }), 'No portions');
  assert.equal(describePortions({ palms: 1, fists: 2, cupped: 3, thumbs: 4 }), '1 palm · 2 fists · 3 cupped · 4 thumbs');
});

test('weeklyHandPortions averages logged days and projects the next week', () => {
  const logs = [
    { date: '2026-11-07', handPortions: { palms: 2, fists: 1, cupped: 1, thumbs: 1 }, isWholeFood: true },
    { date: '2026-11-06', handPortions: { palms: 2, fists: 1, cupped: 2, thumbs: 0 }, isWholeFood: false },
    { date: '2026-10-30', handPortions: { palms: 9, fists: 9, cupped: 9, thumbs: 9 }, isWholeFood: true },
  ];
  const week = weeklyHandPortions(logs, '2026-11-07', 7);

  assert.equal(week.start, '2026-11-01');
  assert.equal(week.end, '2026-11-07');
  assert.equal(week.days, 7);
  assert.equal(week.logs, 2);
  assert.equal(week.loggedDays, 2);
  assert.deepEqual(week.totals, { palms: 4, fists: 2, cupped: 3, thumbs: 1 });
  assert.deepEqual(week.projected, { palms: 14, fists: 7, cupped: 11, thumbs: 4 });
  assert.equal(week.wholeShare, 50);
});

test('weeklyHandPortions handles empty, invalid and sparse history', () => {
  const empty = weeklyHandPortions([], '2026-11-07', 7);
  assert.equal(empty.loggedDays, 0);
  assert.deepEqual(empty.projected, { palms: 0, fists: 0, cupped: 0, thumbs: 0 });
  assert.equal(empty.wholeShare, null);

  assert.equal(weeklyHandPortions([], 'not-a-date', 7), null);
  assert.equal(weeklyHandPortions([], null, 7), null);

  const sparse = weeklyHandPortions([
    { date: '2026-11-07', handPortions: { palms: 3 }, isWholeFood: true },
    { date: 'bad-date', handPortions: { palms: 99 }, isWholeFood: true },
  ], '2026-11-07', 7);
  assert.equal(sparse.loggedDays, 1);
  assert.equal(sparse.projected.palms, 21);
  assert.equal(sparse.projected.fists, 0);
});

test('myth cards are well-formed and unique', () => {
  const ids = new Set(MYTH_CARDS.map(c => c.id));
  assert.equal(ids.size, MYTH_CARDS.length);      // unique ids
  for (const card of MYTH_CARDS) {
    assert.ok(card.id && card.myth && card.truth && card.action, `card ${card.id} has all fields`);
    assert.ok(card.myth.length <= 120, `myth for ${card.id} fits a card`);
  }
});

test('myth copy keeps the v2.11.0 medical-advice guardrails', () => {
  const copy = MYTH_CARDS.map(c => `${c.truth} ${c.action}`).join(' ');

  // Claims deliberately removed in the conservative pass.
  assert.doesNotMatch(copy, /rivals? medications/i);
  assert.doesNotMatch(copy, /\binevitabl[ey]\b/i);
  assert.doesNotMatch(copy, /\bcardioprotective\b/i);

  // The protein card must keep its kidney-disease caveat and ISSN range.
  const protein = MYTH_CARDS.find(c => c.id === 'myth-protein-damage');
  assert.match(protein.action, /1\.4–2\.0 g\/kg/);
  assert.match(protein.action, /kidney disease/i);

  // No card may tell someone to stop a prescribed treatment.
  assert.doesNotMatch(copy, /stop (taking|your) (medication|statin)/i);
});

test('getDailyMythCard is deterministic for a given date', () => {
  const a = getDailyMythCard('2026-11-05');
  const b = getDailyMythCard('2026-11-05');
  assert.deepEqual(a, b);
  assert.ok(MYTH_CARDS.some(c => c.id === a.id));
});

test('getDailyMythCard rotates across days', () => {
  const seen = new Set();
  for (let day = 1; day <= 28; day++) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    seen.add(getDailyMythCard(date).id);
  }
  assert.ok(seen.size > 1, 'different days produce different cards');
});

test('getRandomMythCard returns a member of MYTH_CARDS', () => {
  const card = getRandomMythCard(() => 0.999999);
  assert.ok(MYTH_CARDS.some(c => c.id === card.id));
  const first = getRandomMythCard(() => 0);
  assert.equal(first.id, MYTH_CARDS[0].id);
});
