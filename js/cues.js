// ── Cues: audio + haptics ──────────────────────────────────
// One place for the short beeps and vibration patterns used by the rest
// timer and interval runner. Browsers only allow audio after a gesture, so
// callers must call primeAudio() from the click that starts a countdown.

let audioCtx = null;

export function primeAudio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function beep({ freq = 880, duration = 0.18, type = 'sine', gain = 0.12, delay = 0 } = {}) {
  if (!audioCtx) return;
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
