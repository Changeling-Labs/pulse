import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsAllowed, eventPath, track } from '../js/analytics.js';

test('analytics only runs on the production custom domain', () => {
  assert.equal(analyticsAllowed('changelinglabs.com'), true);
  assert.equal(analyticsAllowed('www.changelinglabs.com'), true);
  assert.equal(analyticsAllowed('CHANGELINGLABS.COM'), true);
  assert.equal(analyticsAllowed('localhost'), false);
  assert.equal(analyticsAllowed('127.0.0.1'), false);
  assert.equal(analyticsAllowed('edmundashdown.github.io'), false);
  assert.equal(analyticsAllowed('evil-changelinglabs.com'), false);
  assert.equal(analyticsAllowed(null), false);
});

test('event paths are fixed, lowercase and namespaced', () => {
  assert.equal(eventPath('session-start', 'daily'), 'pulse/session-start/daily');
  assert.equal(eventPath('set-logged'), 'pulse/set-logged');
  assert.equal(eventPath('Session Start', 'Daily'), 'pulse/sessionstart/daily');
  assert.equal(eventPath('meal-logged', '<free text>'), 'pulse/meal-logged/freetext');
});

test('event paths reject empty names and bound their length', () => {
  assert.equal(eventPath(''), null);
  assert.equal(eventPath('   '), null);
  assert.ok(eventPath('x'.repeat(100)).length <= 'pulse/'.length + 60);
  assert.ok(eventPath('event', 'y'.repeat(100)).length <= 'pulse/'.length + 60 + 1 + 40);
});

test('track is a safe no-op outside a browser', () => {
  assert.equal(track('session-start', 'daily'), false);
});
