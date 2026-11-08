// Pulse — app entry. Modules register their tabs with the kernel; the
// kernel owns shared state, routing, and boot. See js/kernel/shell.js.
import { boot, registerInit } from './kernel/shell.js';
import { initA11y } from './kernel/a11y.js';
import { installErrorHandlers, renderBootError } from './kernel/errors.js';
import { initInstallHint } from './install.js';
import { initSync } from './sync.js';
import './modules/move/timer.js';
import './modules/move/shared.js';
import './modules/move/log.js';
import './modules/move/quick.js';
import './modules/move/modal.js';
import './modules/move/progress.js';
import './modules/move/planner.js';
import './modules/move/intervals.js';
import './modules/fuel/fuel.js';
import './modules/recover/recover.js';
import './modules/settings.js';

// Never let sync wiring break the app: a sync failure must degrade to local-only mode.
registerInit(() => initSync().catch(err => console.warn('sync unavailable, staying local-only:', err)));

initA11y();
installErrorHandlers();
initInstallHint();
boot().catch(err => {
  console.error('Pulse failed to start:', err);
  renderBootError(err);
});
