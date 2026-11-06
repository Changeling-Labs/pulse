// ── Cues: audio + haptics ──────────────────────────────────
// One place for the short beeps and vibration patterns used by the rest
// timer and interval runner. Browsers only allow audio after a gesture, so
// callers must call primeAudio() from the click that starts a countdown.
//
// iOS specifics (why this file is more defensive than it looks):
//   • Web Audio obeys the ring/silent switch unless the page declares a
//     'playback' audio session. navigator.audioSession does that (iOS 17+).
//   • Safari parks the context in 'interrupted' — not just 'suspended' —
//     after a lock screen, a call, or a long background stint. resume() on
//     anything that is not already 'running' is the only reliable wake-up.
//   • A silent buffer source unlocks more reliably than an oscillator alone,
//     and a later gesture re-prime keeps the context alive across sessions.

let audioCtx = null;
let primed = false;         // primeAudio() has run at least once
let hooksInstalled = false;

function AudioCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext;
}

// iOS 17+: declaring a playback session keeps Web Audio audible even when the
// ring/silent switch is on. Older iOS ignores the property, hence the try.
function setSessionType() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
      navigator.audioSession.type = 'playback';
    }
  } catch { /* unsupported — nothing to do */ }
}

function resumeContext(ctx) {
  // 'interrupted' is a Safari-only state; treating anything non-running as
  // resumable covers suspended, interrupted and any future variant.
  if (!ctx || ctx.state === 'running') return;
  try { ctx.resume().catch(() => {}); } catch { /* closed */ }
}

// A single silent sample through a buffer source. This is the unlock that
// actually holds on iOS after the context has been interrupted.
function unlockBuffer(ctx) {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    amp.gain.value = 0;
    src.buffer = buffer;
    src.connect(amp).connect(ctx.destination);
    src.start(0);
  } catch { /* context closed or buffer unsupported */ }
}

function silentBlip(ctx) {
  try {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    amp.gain.value = 0;
    osc.connect(amp).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch { /* context closed — beep() will no-op anyway */ }
}

// Re-prime on the next gesture after backgrounding. Guarded on an existing
// context so a page that never uses a timer never creates one.
function installUnlockHooks() {
  if (hooksInstalled || typeof document === 'undefined') return;
  hooksInstalled = true;

  const onGesture = () => { if (audioCtx) primeAudio(); };
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioCtx) primeAudio();
  });
}

export function primeAudio() {
  installUnlockHooks();
  setSessionType();

  const Ctx = AudioCtor();
  if (!Ctx) return false;
  if (!audioCtx) {
    try { audioCtx = new Ctx(); } catch { return false; }
  }

  resumeContext(audioCtx);
  unlockBuffer(audioCtx);
  silentBlip(audioCtx);
  primed = true;
  return audioCtx.state === 'running';
}

export function beep({ freq = 880, duration = 0.18, type = 'sine', gain = 0.12, delay = 0 } = {}) {
  if (!audioCtx) return;
  // A cue can land while iOS is parked in 'interrupted' — nudge it awake.
  resumeContext(audioCtx);
  try {
    const start = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration);
  } catch { /* audio context unavailable or closed */ }
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

// Diagnostics for the Settings sound check. Reports what the platform is
// actually doing rather than what we hope it is doing.
export function audioStatus() {
  let sessionType = null;
  try { sessionType = navigator.audioSession?.type ?? null; } catch { /* unsupported */ }
  return {
    supported: Boolean(AudioCtor()),
    primed,
    state: audioCtx?.state ?? 'uninitialised',
    running: audioCtx?.state === 'running',
    sessionType,
  };
}

// Distinct signatures so you can tell the phase without looking at the
// screen: rising pair for work, low blip for rest, mid tone for a hold,
// three rising notes to finish.
export function cue(kind) {
  if (kind === 'work') {
    beep({ freq: 880, duration: 0.12 });
    beep({ freq: 1175, duration: 0.16, delay: 0.16 });
    vibrate([100, 60, 100]);
  } else if (kind === 'rest') {
    beep({ freq: 440, duration: 0.25, gain: 0.09 });
    vibrate(120);
  } else if (kind === 'hold') {
    beep({ freq: 660, duration: 0.2 });
    vibrate(140);
  } else if (kind === 'done') {
    [660, 880, 1320].forEach((freq, i) => beep({ freq, duration: 0.18, delay: i * 0.16 }));
    vibrate([120, 70, 120, 70, 220]);
  } else {
    beep({ freq: 520, duration: 0.15, gain: 0.08 });
  }
}
