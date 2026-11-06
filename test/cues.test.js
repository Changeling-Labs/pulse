import test from 'node:test';
import assert from 'node:assert/strict';
import { primeAudio, beep, vibrate, cue } from '../js/cues.js';

// The cue layer must be a no-op, never a crash, on platforms that lack audio
// or haptics (node has no AudioContext; iOS has no navigator.vibrate).

test('primeAudio and beep are silent no-ops without an AudioContext', () => {
  assert.equal(globalThis.AudioContext, undefined);
  assert.doesNotThrow(() => primeAudio());
  assert.doesNotThrow(() => beep());
  assert.doesNotThrow(() => beep({ freq: 440, duration: 0.2, delay: 0.1 }));
});

test('vibrate tolerates a missing navigator.vibrate', () => {
  assert.doesNotThrow(() => vibrate(120));
  assert.doesNotThrow(() => vibrate([100, 60, 100]));
});

test('every cue kind is safe on a silent device', () => {
  for (const kind of ['work', 'rest', 'hold', 'done', 'prep', 'anything']) {
    assert.doesNotThrow(() => cue(kind), kind);
  }
});
