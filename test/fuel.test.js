import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHandPortions,
  PORTION_MACROS,
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

test('myth cards are well-formed and unique', () => {
  const ids = new Set(MYTH_CARDS.map(c => c.id));
  assert.equal(ids.size, MYTH_CARDS.length);      // unique ids
  for (const card of MYTH_CARDS) {
    assert.ok(card.id && card.myth && card.truth && card.action, `card ${card.id} has all fields`);
    assert.ok(card.myth.length <= 120, `myth for ${card.id} fits a card`);
  }
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
