import test from 'node:test';
import assert from 'node:assert/strict';
import { installHintEligible } from '../js/install.js';

const DAY = 86400000;

test('install hint only shows on a touch device that is not already installed', () => {
  assert.equal(installHintEligible({ standalone: false, touch: true }), true);
  assert.equal(installHintEligible({ standalone: true, touch: true }), false);
  assert.equal(installHintEligible({ standalone: false, touch: false }), false);
});

test('install hint respects the 30-day dismissal window', () => {
  const now = Date.UTC(2026, 10, 7, 12);
  assert.equal(installHintEligible({ dismissedAt: null, now }), true);
  assert.equal(installHintEligible({ dismissedAt: now - DAY, now }), false);
  assert.equal(installHintEligible({ dismissedAt: now - 29.9 * DAY, now }), false);
  assert.equal(installHintEligible({ dismissedAt: now - 30 * DAY, now }), true);
  assert.equal(installHintEligible({ dismissedAt: now - 60 * DAY, now }), true);
});

test('invalid or zero dismissal values do not hide the hint', () => {
  assert.equal(installHintEligible({ dismissedAt: 0 }), true);
  assert.equal(installHintEligible({ dismissedAt: NaN }), true);
  assert.equal(installHintEligible({ dismissedAt: null }), true);
});
