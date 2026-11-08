// ── Storage and boot errors ────────────────────────────────
// Pure classification plus two small UI states. The goal is that a full or
// unavailable browser database never leaves the user with a silent failure or
// a "Loading…" screen and no route to a backup.

export function isQuotaError(err) {
  if (!err) return false;
  const name = String(err.name ?? '');
  const code = Number(err.code);
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || code === 22
    || code === 1014;
}

export function isStorageError(err) {
  if (!err) return false;
  if (isQuotaError(err)) return true;
  const name = String(err.name ?? '');
  if (['InvalidStateError', 'NotFoundError', 'UnknownError', 'VersionError'].includes(name)) return true;
  return /indexeddb|database|object store/i.test(String(err.message ?? ''));
}

export function describeStorageError(err) {
  if (isQuotaError(err)) {
    return {
      kind: 'quota',
      title: 'This device is out of storage',
      body: 'Pulse could not save the latest change because browser storage is full. Export a backup now, then free some space or remove old data.',
    };
  }
  if (isStorageError(err)) {
    return {
      kind: 'database',
      title: "Pulse couldn't reach its local database",
      body: 'Your data may still be on this device. Try reloading; if it keeps happening, export a backup before clearing site data.',
    };
  }
  return {
    kind: 'other',
    title: "Something couldn't be saved",
    body: 'Your existing data is safe. Try again, or export a backup before making more changes.',
  };
}

function errorStatus() {
  return document.getElementById('storage-banner-status')
    ?? document.getElementById('error-status');
}

export async function exportBackupFromError() {
  const status = errorStatus();
  if (status) status.textContent = 'Preparing backup…';
  try {
    const { exportBackup } = await import('../backup.js');
    await exportBackup();
    if (status) status.textContent = 'Backup downloaded. Keep it somewhere safe, then free space.';
  } catch (err) {
    if (status) status.textContent = `Backup failed: ${err?.message ?? String(err)}`;
  }
}

export function showStorageError(err) {
  if (typeof document === 'undefined') return;
  const info = describeStorageError(err);
  let banner = document.getElementById('storage-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'storage-banner';
    banner.className = 'storage-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.innerHTML = `
      <div class="storage-banner-copy">
        <b class="storage-banner-title"></b>
        <span class="storage-banner-body"></span>
      </div>
      <div class="storage-banner-actions">
        <button type="button" class="btn btn-primary" onclick="exportBackupFromError()">Export backup now</button>
        <button type="button" class="btn btn-ghost" onclick="dismissStorageError()">Dismiss</button>
      </div>
      <p class="storage-banner-status" id="storage-banner-status"></p>`;
    document.body.appendChild(banner);
  }
  banner.querySelector('.storage-banner-title').textContent = info.title;
  banner.querySelector('.storage-banner-body').textContent = info.body;
  const status = document.getElementById('storage-banner-status');
  if (status) status.textContent = '';
  banner.classList.add('show');
}

export function handleSaveError(err) {
  if (isStorageError(err)) showStorageError(err);
  else alert(err?.message ?? String(err));
}

export function renderBootError(err) {
  if (typeof document === 'undefined') return;
  const info = describeStorageError(err);
  const content = document.getElementById('content');
  if (!content) return;
  document.getElementById('nav')?.classList.add('hidden');
  document.getElementById('fab')?.classList.add('hidden');
  content.innerHTML = `
    <div class="card error-card" role="alert">
      <div class="card-label">Pulse couldn't start</div>
      <div class="error-title"></div>
      <p class="error-body"></p>
      <div class="error-actions">
        <button type="button" class="btn btn-primary" onclick="location.reload()">Reload</button>
        <button type="button" class="btn" onclick="exportBackupFromError()">Export backup now</button>
      </div>
      <p class="error-status" id="error-status"></p>
    </div>`;
  content.querySelector('.error-title').textContent = info.title;
  content.querySelector('.error-body').textContent = info.body;
}

export function installErrorHandlers() {
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', event => {
    if (!isStorageError(event.reason)) return;
    event.preventDefault();
    showStorageError(event.reason);
  });
  window.showStorageError = showStorageError;
  window.exportBackupFromError = exportBackupFromError;
  window.renderBootError = renderBootError;
  window.dismissStorageError = () => document.getElementById('storage-banner')?.remove();
}
