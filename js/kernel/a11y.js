// ── Accessibility helpers ──────────────────────────────────
// Small shared primitives for keyboard users and reduced-motion devices.
// Dialogs stay in the DOM for their CSS transitions, so they must be marked
// inert/aria-hidden while closed and trap Tab + Escape while open.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableIn(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE)]
    .filter(el => el.getClientRects().length > 0);
}

export function initA11y() {
  if (typeof document === 'undefined') return;
  for (const id of ['log-modal', 'fuel-modal']) {
    const overlay = document.getElementById(id);
    if (!overlay) continue;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
  }
}

export function openDialog(overlay, { initialFocus = null } = {}) {
  if (!overlay || typeof document === 'undefined') return;
  const wasOpen = overlay.classList.contains('open');
  if (!wasOpen) overlay._returnFocus = document.activeElement;

  overlay.classList.add('open');
  overlay.removeAttribute('aria-hidden');
  overlay.inert = false;
  if (wasOpen) return;

  const target = (typeof initialFocus === 'function' ? initialFocus() : initialFocus)
    ?? focusableIn(overlay)[0]
    ?? overlay;
  // Focus immediately, then again after paint. The second pass survives a
  // display:none → block transition and keeps the dialog usable in a
  // background/throttled tab.
  target.focus?.({ preventScroll: true });
  requestAnimationFrame(() => {
    if (document.activeElement !== target) target.focus?.({ preventScroll: true });
  });
}

export function closeDialog(overlay) {
  if (!overlay || typeof document === 'undefined') return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.inert = true;

  const target = overlay._returnFocus;
  overlay._returnFocus = null;
  if (target && typeof target.focus === 'function' && document.contains(target)) {
    target.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (document.activeElement !== target) target.focus({ preventScroll: true });
    });
  }
}

export function trapDialog(overlay, onEscape) {
  if (!overlay || overlay.dataset.a11yTrap === 'true') return;
  overlay.dataset.a11yTrap = 'true';

  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = focusableIn(overlay);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
