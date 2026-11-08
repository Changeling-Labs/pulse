// ── Movement patterns ──────────────────────────────────────
// A small, fixed taxonomy shared by exercises, the adaptive generator and
// the UI. Pure and dependency-free so it can be used by IndexedDB reads,
// backups and tests without pulling in the rest of the app.
//
// `inferPattern` is deliberately keyword-based: the app has no exercise
// catalogue and no server, so a name is the only signal older records carry.
// Quick-session exercises pass their known pattern explicitly; this is the
// fallback for hand-created and legacy exercises.

export const PATTERNS = ['push', 'pull', 'squat', 'hinge', 'carry', 'core', 'cardio', 'mobility'];

export const PATTERN_LABELS = {
  push: 'Push',
  pull: 'Pull',
  squat: 'Squat',
  hinge: 'Hinge',
  carry: 'Carry',
  core: 'Core',
  cardio: 'Cardio',
  mobility: 'Mobility',
};

// Most specific first. A hamstring stretch is mobility, not a hinge; a leg
// curl is a hinge, not a biceps curl. Anything unrecognised falls back to
// core, the app's general trunk/control bucket, rather than inventing a
// pattern outside the taxonomy.
const RULES = [
  { pattern: 'mobility', re: /(stretch|mobility|opener|thoracic|hip flexor|couch|cat.?cow|foam roll)/ },
  { pattern: 'carry', re: /(carry|farmer|suitcase|waiter)/ },
  { pattern: 'core', re: /(plank|hollow|dead bug|bird dog|sit.?up|crunch|\bab\b|pallof|rollout|core)/ },
  { pattern: 'hinge', re: /(leg curl|deadlift|\brdl\b|romanian|hip thrust|glute bridge|good morning|hamstring|swing|hinge)/ },
  { pattern: 'squat', re: /(squat|lunge|step.?up|leg press|leg extension)/ },
  { pattern: 'cardio', re: /(rowing|rower|run|jog|walk|march|jack|high knee|mountain climber|burpee|bike|cycle|ski|jump rope|cardio|interval)/ },
  { pattern: 'pull', re: /(row|pull|chin|lat pull|curl|face pull|pulldown)/ },
  { pattern: 'push', re: /(press|push|bench|dip|fly|raise|overhead|pec deck)/ },
];

export function inferPattern(name) {
  const text = String(name ?? '').toLowerCase();
  for (const rule of RULES) {
    if (rule.re.test(text)) return rule.pattern;
  }
  return 'core';
}

export function isPattern(value) {
  return PATTERNS.includes(value);
}

export function patternLabel(pattern) {
  return PATTERN_LABELS[pattern] ?? 'General';
}
