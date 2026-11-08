// ── Cookieless event counts ────────────────────────────────
// A deliberately tiny layer over GoatCounter. Events are fixed names and
// fixed detail values (no free text, no user IDs, no cookies). They only fire
// on the production host, and they never include sets, meals or check-in data.
//
// The pageview script is loaded by index.html; this module only asks it to
// count a named event once it is ready. Events that happen before the script
// loads are queued and flushed shortly after.

const PROD_HOSTS = new Set(['changelinglabs.com', 'www.changelinglabs.com']);
const MAX_EVENT = 60;
const MAX_DETAIL = 40;

let queue = [];
let flushScheduled = false;

export function analyticsAllowed(host) {
  return PROD_HOSTS.has(String(host ?? '').toLowerCase());
}

function clean(value, max) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, '')
    .slice(0, max);
}

export function eventPath(event, detail = '') {
  const name = clean(event, MAX_EVENT);
  if (!name) return null;
  const suffix = clean(detail, MAX_DETAIL);
  return `pulse/${name}${suffix ? `/${suffix}` : ''}`;
}

function flush() {
  if (typeof window === 'undefined') return;
  const counter = window.goatcounter;
  if (!counter || typeof counter.count !== 'function') return;
  for (const path of queue.splice(0)) {
    try {
      counter.count({ path, event: true });
    } catch {
      /* a missing counter must never break an action */
    }
  }
}

export function track(event, detail = '') {
  if (typeof window === 'undefined') return false;
  if (!analyticsAllowed(window.location.hostname)) return false;

  const path = eventPath(event, detail);
  if (!path) return false;

  const counter = window.goatcounter;
  if (counter && typeof counter.count === 'function') {
    try {
      counter.count({ path, event: true });
      return true;
    } catch {
      return false;
    }
  }

  queue.push(path);
  if (!flushScheduled) {
    flushScheduled = true;
    window.addEventListener('load', flush, { once: true });
    setTimeout(flush, 2500);
  }
  return true;
}
