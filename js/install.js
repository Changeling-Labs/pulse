// ── Install hint (distribution, not tracking) ──────────────
// A small, dismissible prompt that only exists inside the Pulse app. The hub
// must not show install UI: the app is the thing people install. Chrome gets
// the native prompt via `beforeinstallprompt`; iOS Safari gets the one
// instruction Apple actually supports. Nothing is sent anywhere.

const DISMISS_KEY = 'pulseInstallDismissedAt';
const DISMISS_DAYS = 30;
const DAY_MS = 86400000;

let deferredPrompt = null;
let hintEl = null;

// Pure eligibility so the rules can be tested without a browser.
export function installHintEligible({
  standalone = false,
  touch = true,
  dismissedAt = null,
  now = Date.now(),
} = {}) {
  if (standalone || !touch) return false;
  if (Number.isFinite(dismissedAt) && now - dismissedAt < DISMISS_DAYS * DAY_MS) return false;
  return true;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone === true;
}

function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0;
}

function isIos() {
  const ua = navigator.userAgent || '';
  const iPadAsMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadAsMac;
}

function dismissedAt() {
  try {
    const value = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode / storage denied: dismiss for this page only */
  }
  hide();
}

function hide() {
  hintEl?.remove();
  hintEl = null;
}

function show() {
  if (hintEl) return;
  if (!installHintEligible({
    standalone: isStandalone(),
    touch: isTouchDevice(),
    dismissedAt: dismissedAt(),
  })) return;

  const ios = isIos();
  const hasPrompt = Boolean(deferredPrompt);
  if (!ios && !hasPrompt) return;

  hintEl = document.createElement('div');
  hintEl.className = 'install-hint';
  hintEl.setAttribute('role', 'region');
  hintEl.setAttribute('aria-label', 'Install Pulse');
  hintEl.innerHTML = `
    <div class="install-hint-copy">
      <b>Install Pulse</b>
      <span>${ios
        ? 'Tap Share, then Add to Home Screen. It works offline after the first load.'
        : 'One tap, offline access, no app store.'}</span>
    </div>
    <div class="install-hint-actions">
      ${hasPrompt ? '<button type="button" class="btn btn-primary install-hint-action">Install</button>' : ''}
      <button type="button" class="btn btn-ghost install-hint-dismiss" aria-label="Dismiss install hint">Not now</button>
    </div>`;
  document.body.appendChild(hintEl);

  hintEl.querySelector('.install-hint-dismiss')?.addEventListener('click', dismiss);
  hintEl.querySelector('.install-hint-action')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* the browser can reject a stale prompt */
    }
    deferredPrompt = null;
    hide();
  });
}

export function initInstallHint() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    show();
  });
  window.addEventListener('appinstalled', hide);

  // iOS never fires beforeinstallprompt; show the instruction after the first
  // paint rather than competing with the app's opening render.
  if (isIos() && !isStandalone()) setTimeout(show, 1500);
}
