// ── Pulse Move: shared exercise helpers ─────────────────
import { state } from '../../kernel/shell.js';

function metricsForExercise(exerciseId) {
  const exercise = state.exercises.find(e => e.id === exerciseId);
  return exercise?.metrics || ['strength'];
}

// The Planner is built on percentage-of-1RM, so it only offers lifts.
function strengthExercises() {
  return state.exercises.filter(e => (e.metrics || ['strength']).includes('strength'));
}


export { metricsForExercise, strengthExercises };
