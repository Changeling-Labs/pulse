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

// ── iOS audio hardening ────────────────────────────────────
// A minimal stand-in for the Web Audio API. It records what the cue layer
// did, and — like Safari — can sit in 'interrupted' rather than 'suspended'.

let importCounter = 0;

function freshCues() {
  // Each test gets a new module instance so install-time state never leaks.
  return import(`../js/cues.js?fake=${importCounter++}`);
}

function makeContext(initialState = 'suspended') {
  const calls = { resumes: 0, buffers: 0, oscillators: 0 };

  const ctx = {
    state: initialState,
    sampleRate: 44100,
    currentTime: 0,
    destination: { name: 'destination' },

    createBuffer(channels, length, rate) {
      calls.buffers += 1;
      return { channels, length, rate };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect(node) { this.destination = node; return this; },
        start() { calls.bufferStarts = (calls.bufferStarts ?? 0) + 1; },
        stop() {},
      };
    },
    createOscillator() {
      calls.oscillators += 1;
      return {
        type: 'sine',
        frequency: { value: 0 },
        connect(node) { this.destination = node; return this; },
        start() {},
        stop() {},
      };
    },
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect(node) { this.destination = node; return this; },
      };
    },
    resume() {
      calls.resumes += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
  };

  return { ctx, calls };
}

async function withFakePlatform(run, { state = 'suspended' } = {}) {
  const { ctx, calls } = makeContext(state);
  const originalCtx = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const originalNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.AudioContext = function FakeAudioContext() { return ctx; };
  Object.defineProperty(globalThis, 'navigator', {
    value: { audioSession: { type: 'auto' } },
    configurable: true,
    writable: true,
  });

  try {
    return await run({ ctx, calls });
  } finally {
    if (originalCtx) Object.defineProperty(globalThis, 'AudioContext', originalCtx);
    else delete globalThis.AudioContext;
    if (originalNav) Object.defineProperty(globalThis, 'navigator', originalNav);
    else delete globalThis.navigator;
  }
}

test('primeAudio resumes a suspended context and unlocks with a silent buffer', async () => {
  await withFakePlatform(async ({ ctx, calls }) => {
    const cues = await freshCues();
    const running = cues.primeAudio();

    assert.equal(calls.resumes, 1);
    assert.equal(ctx.state, 'running');
    assert.equal(calls.bufferStarts, 1, 'silent buffer unlocks playback');
    assert.equal(running, true);
  });
});

test('primeAudio resumes an interrupted context (iOS lock-screen state)', async () => {
  await withFakePlatform(async ({ ctx, calls }) => {
    const cues = await freshCues();
    assert.equal(ctx.state, 'interrupted');

    cues.primeAudio();

    assert.equal(calls.resumes, 1, 'interrupted is not suspended but still needs resume');
    assert.equal(ctx.state, 'running');
  }, { state: 'interrupted' });
});

test('primeAudio declares an iOS playback audio session', async () => {
  await withFakePlatform(async () => {
    const cues = await freshCues();
    cues.primeAudio();
    assert.equal(navigator.audioSession.type, 'playback');
    assert.equal(cues.audioStatus().sessionType, 'playback');
  });
});

test('audio session setup is optional on platforms without navigator.audioSession', async () => {
  await withFakePlatform(async () => {
    // Remove the session object entirely; primeAudio must still succeed.
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    const cues = await freshCues();
    assert.doesNotThrow(() => cues.primeAudio());
    assert.equal(cues.audioStatus().sessionType, null);
  });
});

test('a cue wakes an interrupted context before scheduling tones', async () => {
  await withFakePlatform(async ({ ctx, calls }) => {
    const cues = await freshCues();
    cues.primeAudio();
    ctx.state = 'interrupted';          // phone locked mid-workout

    cues.beep({ freq: 880 });

    assert.equal(calls.resumes, 2, 'beep re-resumes rather than going silent');
    assert.equal(ctx.state, 'running');
  });
});

test('audioStatus reports platform reality, not intent', async () => {
  await withFakePlatform(async () => {
    const cues = await freshCues();

    const before = cues.audioStatus();
    assert.equal(before.supported, true);
    assert.equal(before.primed, false);
    assert.equal(before.state, 'uninitialised');
    assert.equal(before.running, false);

    cues.primeAudio();

    const after = cues.audioStatus();
    assert.equal(after.primed, true);
    assert.equal(after.state, 'running');
    assert.equal(after.running, true);
  });
});

test('audioStatus and primeAudio stay safe with no Web Audio at all', async () => {
  const cues = await freshCues();
  const status = cues.audioStatus();
  assert.equal(status.supported, false);
  assert.equal(status.running, false);
  assert.equal(cues.primeAudio(), false);
});
