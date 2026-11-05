// Pulse — app entry. Modules register their tabs with the kernel; the
// kernel owns shared state, routing, and boot. See js/kernel/shell.js.
import { boot } from './kernel/shell.js';
import './modules/move/timer.js';
import './modules/move/shared.js';
import './modules/move/log.js';
import './modules/move/modal.js';
import './modules/move/prs.js';
import './modules/move/planner.js';
import './modules/fuel/fuel.js';
import './modules/settings.js';

boot();
