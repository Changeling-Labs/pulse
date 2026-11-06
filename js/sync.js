// Pulse Cloud Sync — push/pull engine.
//
// Arrives in every browser via index.html's plain <script src> (the UMD
// bundle registers window.supabase); engine code runs from this module.
// Pure decision logic lives in sync-core.js (node-tested). This file owns
// IndexedDB + the network.
//
// Storage model
//   'pulse-sync' DB (v1) — Pulse-owned, may change freely:
//     kv    { k, v }                  deviceId, enabled, lastPushAt/lastSyncAt, bootstrap flag
//     dirty { domain, externalId, op, updatedAt }   push queue (op 'put' | 'delete')
//   The shared 'iron-log' DB is only ever written with ADDITIVE fields
//   (syncId / updatedAt on exercise & set records; never a version bump).
//   Missing syncIds on legacy records are stamped lazily by the bootstrap
//   (same trick as migrateExerciseMetrics).
//
// Conflict resolution: last-writer-wins on `updated_at`, payload-byte
// tie-break on exact equality (pickLWW). Remote rows whose
// domain:externalId is in the local dirty queue always lose to local intent.
// Deletes travel as tombstones (deleted_at). No echo: rows applied from a
// pull are never re-marked dirty.
//
// v2.4.0 scope: manual "Sync now" in Settings; opt-in, off by default.

import {
  SYNC_DOMAINS, rowFor, tombstoneFor, validateRow, pickLWW, resolveExerciseRow,
  updatedAtMs, isoFromMs, shouldApplyRemote,
} from './sync-core.js';
import {
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
} from './sync-config.js';
import {
  openDB,
  syncRawAll, syncRawPut, syncRawDel,
  syncFuelRawAll, syncFuelRawPut, syncFuelRawDel,
} from './db.js';
import { normalizeExercise, normalizeSet, normalizeFuelLog, normalizeWaterLog } from './schema.js';

const SYNC_DB = 'pulse-sync';
const SYNC_DB_VERSION = 1;
const TABLE = 'sync_rows';
const nowMs = () => Date.now();
const nowIso = () => new Date().toISOString();

// ── pulse-sync database ────────────────────────────────────
let syncDBHandle;

export function openSyncDB() {
  return new Promise((resolve, reject) => {
    if (syncDBHandle) return resolve(syncDBHandle);
    const req = indexedDB.open(SYNC_DB, SYNC_DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('dirty')) {
        d.createObjectStore('dirty', { keyPath: ['domain', 'externalId'] });
      }
      if (!d.objectStoreNames.contains('kv')) {
        d.createObjectStore('kv', { keyPath: 'k' });
      }
    };
    req.onsuccess = e => { syncDBHandle = e.target.result; resolve(syncDBHandle); };
    req.onerror = e => reject(e.target.error);
  });
}

function syncTx(storeName, mode = 'readonly') {
  return syncDBHandle.transaction(storeName, mode).objectStore(storeName);
}

function kvGet(k, fallback = null) {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const req = syncTx('kv').get(k);
    req.onsuccess = e => res(e.target.result ? e.target.result.v : fallback);
    req.onerror = e => rej(e.target.error);
  }));
}

function kvSet(k, v) {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const req = syncTx('kv', 'readwrite').put({ k, v });
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  }));
}

function dirtyAdd(domain, externalId, op = 'put') {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const req = syncTx('dirty', 'readwrite').put({ domain, externalId, op, updatedAt: nowIso() });
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  }));
}

function dirtyDelete(domain, externalId) {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const req = syncTx('dirty', 'readwrite').delete([domain, externalId]);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  }));
}

function dirtyClear(entries) {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const store = syncTx('dirty', 'readwrite');
    for (const e of entries) store.delete([e.domain, e.externalId]);
    const t = store.transaction;
    t.oncomplete = () => res();
    t.onerror = e => rej(e.target.error);
    t.onabort = e => rej(e.target.error);
  }));
}

function dirtyAll() {
  return openSyncDB().then(() => new Promise((res, rej) => {
    const req = syncTx('dirty').getAll();
    req.onsuccess = e => res(e.target.result ?? []);
    req.onerror = e => rej(e.target.error);
  }));
}

// ── supabase client ────────────────────────────────────────
let clientHandle = null;

export function supabaseClient() {
  if (clientHandle) return clientHandle;
  const factory = window.supabase?.createClient;
  if (typeof factory !== 'function') throw new Error('supabase-js is not loaded — reload the page');
  clientHandle = factory(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,      // magic-link redirects land with #access_token=...
      storageKey: 'pulse-sync-auth',
    },
  });
  return clientHandle;
}

// ── Public API (settings UI) ───────────────────────────────

// Called once at boot. Opens the sync DB and subscribes to local writes.
// The dirty listener is what makes offline edits collect in the queue.
export async function initSync() {
  await openSyncDB();
  await openDB();            // ensure handle for raw readers
  if (typeof document !== 'undefined') {
    document.addEventListener('pulse:dirty', e => {
      const { domain, externalId, op } = e.detail ?? {};
      if (!domain || !externalId) return;
      dirtyAdd(domain, externalId, op).catch(err => console.warn('pulse:dirty queue failed', err));
    });
  }
}

export async function getSyncStatus() {
  const [enabled, lastSyncAt, lastError, session, dirty] = await Promise.all([
    kvGet('enabled', false),
    kvGet('lastSyncAt', null),
    kvGet('lastError', null),
    supabaseClient().auth.getSession().then(({ data }) => data?.session ?? null).catch(() => null),
    dirtyAll(),
  ]);
  return {
    enabled: Boolean(enabled),
    signedIn: Boolean(session),
    email: session?.user?.email ?? null,
    lastSyncAt,
    lastError,
    queueCount: dirty.length,
  };
}

export async function setSyncEnabled(v) {
  await kvSet('enabled', Boolean(v));
  return Boolean(v);
}

export async function sendMagicLink(email) {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('That email does not look valid.');
  const { error } = await supabaseClient().auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error(error.message);
  return clean;
}

export async function signOutSync() {
  const { error } = await supabaseClient().auth.signOut();
  if (error) throw new Error(error.message);
}

// ── Bootstrap ──────────────────────────────────────────────
// One-time per device: stamp syncId/updatedAt everywhere they are missing.
// Progress is recorded so we never redo a half-finished stamp.
export async function bootstrap() {
  if (await kvGet('bootstrap-done', false)) return { stamped: 0 };
  let stamped = 0;
  const uuid = () => crypto.randomUUID();

  const exercises = await syncRawAll('exercises');
  for (const r of exercises) {
    const out = { ...r };
    if (!out.syncId) { out.syncId = uuid(); stamped++; }
    if (!out.updatedAt) { out.updatedAt = isoFromMs(updatedAtMs(out)); stamped++; }
    if (out !== r) await syncRawPut('exercises', out);
  }

  const sets = await syncRawAll('sets');
  for (const r of sets) {
    const out = { ...r };
    if (!out.syncId) { out.syncId = uuid(); stamped++; }
    if (!out.updatedAt) { out.updatedAt = isoFromMs(updatedAtMs(out)); stamped++; }
    if (out !== r) {
      if (!out.id) delete out.id;      // keep autoincrement key untouched
      await syncRawPut('sets', out);
    }
  }

  const fuelLogs = await syncFuelRawAll('fuel_logs');
  for (const r of fuelLogs) {
    if (!r.updatedAt) {
      r.updatedAt = isoFromMs(updatedAtMs(r));
      stamped++;
      await syncFuelRawPut('fuel_logs', r);
    }
  }

  const waterLogs = await syncFuelRawAll('water_logs');
  for (const r of waterLogs) {
    if (!r.updatedAt) {
      r.updatedAt = isoFromMs(updatedAtMs(r));
      stamped++;
      await syncFuelRawPut('water_logs', r);
    }
  }

  const equipment = await syncRawAll('equipment');
  for (const r of equipment) {
    if (!r.updatedAt) {
      r.updatedAt = nowIso();
      stamped++;
      await syncRawPut('equipment', r);
    }
  }

  await kvSet('bootstrap-done', true);
  return { stamped };
}

// ── Helpers ────────────────────────────────────────────────
function buildExerciseMeta(rawExercises) {
  const map = new Map();
  for (const e of rawExercises) {
    if (!e.syncId || e.id === undefined || e.id === null) continue;
    map.set(e.id, { syncId: e.syncId, name: e.name });
  }
  return map;
}

function localKeyFor(domain, record) {
  switch (domain) {
    case 'exercises':
    case 'sets':
      return record.syncId ? String(record.syncId) : null;
    case 'fuel_logs':
      return record.id ? String(record.id) : null;
    case 'water_logs':
      return record.date ? String(record.date) : null;
    case 'equipment':
      return 'equipment';
    default:
      return null;
  }
}

async function findLocal(domain, externalId) {
  switch (domain) {
    case 'exercises': {
      const all = await syncRawAll('exercises');
      return all.find(r => r.syncId === externalId) ?? null;
    }
    case 'sets': {
      const all = await syncRawAll('sets');
      return all.find(r => r.syncId === externalId) ?? null;
    }
    case 'fuel_logs': {
      const all = await syncFuelRawAll('fuel_logs');
      return all.find(r => r.id === externalId) ?? null;
    }
    case 'water_logs': {
      const all = await syncFuelRawAll('water_logs');
      return all.find(r => r.date === externalId) ?? null;
    }
    case 'equipment':
      return '__singleton__';
    default:
      return null;
  }
}

async function deleteLocal(domain, externalId) {
  switch (domain) {
    case 'exercises': {
      const all = await syncRawAll('exercises');
      for (const r of all) if (r.syncId === externalId) { await syncRawDel('exercises', r.id); return true; }
      return false;
    }
    case 'sets': {
      const all = await syncRawAll('sets');
      for (const r of all) if (r.syncId === externalId) { await syncRawDel('sets', r.id); return true; }
      return false;
    }
    case 'fuel_logs':
      await syncFuelRawDel('fuel_logs', externalId);
      return true;
    case 'water_logs': {
      await syncFuelRawDel('water_logs', externalId);
      return true;
    }
    case 'equipment':
      return false;             // equipment is never deleted remotely; LWW decides what lives locally
    default:
      return false;
  }
}

// ── Push pass ─────────────────────────────────────────────
async function pushAll(lastPushAtIso, userId) {
  const summary = { pushed: 0, tombstones: 0, rows: [] };
  const dirty = await dirtyAll();
  const processedDirty = [];

  // 1) tombstones first — an offline delete must beat any remote row
  for (const entry of dirty) {
    if (entry.op !== 'delete') continue;
    summary.rows.push({ ...tombstoneFor(entry.domain, entry.externalId, nowIso()), user_id: userId });
    processedDirty.push(entry);
  }

  const [rawExercises, rawSets, rawFuel, rawWater, rawEquipment] = await Promise.all([
    syncRawAll('exercises'),
    syncRawAll('sets'),
    syncFuelRawAll('fuel_logs'),
    syncFuelRawAll('water_logs'),
    syncRawAll('equipment'),
  ]);

  const lastPush = lastPushAtIso ? Date.parse(lastPushAtIso) : 0;
  const dirtyPutKeys = new Set(dirty.filter(d => d.op === 'put').map(d => `${d.domain}:${d.externalId}`));
  const exerciseMeta = buildExerciseMeta(rawExercises);

  // equipment → single row
  const bar = rawEquipment.find(r => r.id === 'barWeight');
  const plates = rawEquipment.find(r => r.id === 'plates');
  const equipmentUpdated = Math.max(updatedAtMs(bar ?? {}), updatedAtMs(plates ?? {}));
  if (bar || plates) {
    if (!lastPush || equipmentUpdated > lastPush || dirtyPutKeys.has('equipment:equipment')) {
      summary.rows.push({
        domain: 'equipment',
        external_id: 'equipment',
        user_id: userId,
        payload: {
          barWeight: bar?.value ?? 45,
          plates: plates?.value ?? null,
        },
        updated_at: isoFromMs(equipmentUpdated),
        deleted_at: null,
      });
    }
  }

  for (const r of rawExercises) {
    if (!r.syncId) continue;
    const localKey = `exercises:${r.syncId}`;
    if (lastPush && updatedAtMs(r) <= lastPush && !dirtyPutKeys.has(localKey)) continue;
    summary.rows.push(rowFor('exercises', r, exerciseMeta));
  }

  for (const r of rawSets) {
    if (!r.syncId) continue;
    const localKey = `sets:${r.syncId}`;
    if (lastPush && updatedAtMs(r) <= lastPush && !dirtyPutKeys.has(localKey)) continue;
    summary.rows.push(rowFor('sets', r, exerciseMeta));
  }

  for (const r of rawFuel) {
    if (!r.id) continue;
    const localKey = `fuel_logs:${r.id}`;
    if (lastPush && updatedAtMs(r) <= lastPush && !dirtyPutKeys.has(localKey)) continue;
    summary.rows.push(rowFor('fuel_logs', r, exerciseMeta));
  }

  for (const r of rawWater) {
    if (!r.date) continue;
    const localKey = `water_logs:${r.date}`;
    if (lastPush && updatedAtMs(r) <= lastPush && !dirtyPutKeys.has(localKey)) continue;
    summary.rows.push(rowFor('water_logs', r, exerciseMeta));
  }

  if (summary.rows.length === 0) return { pushed: 0, tombstones: 0, processedDirty };

  // batched upsert; proven by the 200-row batch size limit used in practice
  const CHUNK = 200;
  for (let i = 0; i < summary.rows.length; i += CHUNK) {
    const chunk = summary.rows.slice(i, i + CHUNK).map(r => ({ ...r, user_id: r.user_id ?? userId }));
    const { error } = await supabaseClient()
      .from(TABLE)
      .upsert(chunk, { onConflict: 'user_id,domain,external_id' });
    if (error) throw new Error(`sync push failed: ${error.message}`);
  }

  summary.pushed = summary.rows.filter(r => !r.deleted_at).length;
  summary.tombstones = summary.rows.filter(r => r.deleted_at).length;

  // clear the dirty entries we consumed (all of them — puts and deletes alike)
  await dirtyClear(dirty);
  return { pushed: summary.pushed, tombstones: summary.tombstones, processedDirty: dirty };
}

// ── Pull pass ─────────────────────────────────────────────
async function pullAll() {
  const res = await supabaseClient().from(TABLE).select('*');
  if (res.error) throw new Error(`sync pull failed: ${res.error.message}`);
  const rows = (res.data ?? []).map(validateRow).filter(Boolean);

  const ordered = [...SYNC_DOMAINS].reverse();   // sets last — exercises first
  const byDomain = new Map();
  for (const row of rows) {
    if (!byDomain.has(row.domain)) byDomain.set(row.domain, []);
    byDomain.get(row.domain).push(row);
  }

  const dirty = await dirtyAll();
  const dirtyKeys = new Set(dirty.map(d => `${d.domain}:${d.externalId}`));
  const result = { applied: 0, skippedLocalWins: 0, deletes: 0 };

  let exerciseMeta = buildExerciseMeta(await syncRawAll('exercises'));

  for (const domain of ordered) {
    const list = byDomain.get(domain);
    if (!list) continue;
    for (const row of list) {
      if (row.domain === 'exercises') {
        const local = await findLocal('exercises', row.external_id);
        if (row.deleted_at) {
          if (local) { await syncRawDel('exercises', local.id); result.deletes++; }
          dirtyDelete('exercises', row.external_id).catch(() => {});
          continue;
        }
        if (!shouldApplyRemote('exercises', row.external_id, dirtyKeys)) { result.skippedLocalWins++; continue; }
        if (local) {
          const winner = pickLWW(local, row);
          if (winner === 'remote') {
            await syncRawPut('exercises', { ...normalizeExercise({ ...row.payload, syncId: row.external_id, updatedAt: row.updated_at }), id: local.id });
            result.applied++;
          }
          continue;
        }
        // not local yet: adopt by name, or insert fresh
        const adopt = resolveExerciseRow(row, await syncRawAll('exercises'));
        const body = normalizeExercise({ ...row.payload, syncId: row.external_id, updatedAt: row.updated_at });
        delete body.id;
        if (adopt.action === 'adopt') {
          const tgt = (await syncRawAll('exercises')).find(e => e.id === adopt.localId);
          await syncRawPut('exercises', { ...body, id: tgt.id });
        } else {
          await syncRawPut('exercises', body);
        }
        exerciseMeta = buildExerciseMeta(await syncRawAll('exercises'));
        result.applied++;
        continue;
      }

      if (row.domain === 'sets') {
        const local = await findLocal('sets', row.external_id);
        if (row.deleted_at) {
          if (local) { await syncRawDel('sets', local.id); result.deletes++; }
          dirtyDelete('sets', row.external_id).catch(() => {});
          continue;
        }
        if (!shouldApplyRemote('sets', row.external_id, dirtyKeys)) { result.skippedLocalWins++; continue; }
        const exerciseName = row.payload?.exerciseName ?? 'Imported exercise';
        const exMeta = resolveExerciseBySync(exerciseMeta, await syncRawAll('exercises'), row.payload?.exerciseSyncId, exerciseName);
        const setBody = normalizeSet({ ...row.payload, syncId: row.external_id, updatedAt: row.updated_at, exerciseId: exMeta.localId });
        delete setBody.id;
        if (local) {
          if (pickLWW(local, row) === 'remote') {
            await syncRawPut('sets', { ...setBody, id: local.id });
            result.applied++;
          }
        } else {
          await syncRawPut('sets', setBody);
          result.applied++;
        }
        continue;
      }

      if (row.domain === 'fuel_logs') {
        const local = await findLocal('fuel_logs', row.external_id);
        if (row.deleted_at) {
          if (local) { await syncFuelRawDel('fuel_logs', row.external_id); result.deletes++; }
          dirtyDelete('fuel_logs', row.external_id).catch(() => {});
          continue;
        }
        if (!shouldApplyRemote('fuel_logs', row.external_id, dirtyKeys)) { result.skippedLocalWins++; continue; }
        const body = { ...normalizeFuelLog({ ...row.payload, id: row.external_id }), updatedAt: row.updated_at };
        if (local) {
          if (pickLWW({ ...local, updatedAt: local.updatedAt }, row) === 'remote') {
            await syncFuelRawPut('fuel_logs', { ...body, id: local.id });
            result.applied++;
          }
        } else {
          await syncFuelRawPut('fuel_logs', body);
          result.applied++;
        }
        continue;
      }

      if (row.domain === 'water_logs') {
        const local = await findLocal('water_logs', row.external_id);
        if (row.deleted_at) {
          if (local) { await syncFuelRawDel('water_logs', row.external_id); result.deletes++; }
          dirtyDelete('water_logs', row.external_id).catch(() => {});
          continue;
        }
        if (!shouldApplyRemote('water_logs', row.external_id, dirtyKeys)) { result.skippedLocalWins++; continue; }
        const body = { ...normalizeWaterLog({ date: row.external_id, glasses: row.payload?.glasses ?? 0 }), updatedAt: row.updated_at };
        if (local) {
          if (pickLWW({ ...local }, row) === 'remote') {
            await syncFuelRawPut('water_logs', body);
            result.applied++;
          }
        } else {
          await syncFuelRawPut('water_logs', body);
          result.applied++;
        }
        continue;
      }

      if (row.domain === 'equipment') {
        if (row.deleted_at) continue;
        if (!shouldApplyRemote('equipment', 'equipment', dirtyKeys)) { result.skippedLocalWins++; continue; }
        const cur = await syncRawAll('equipment');
        const bar = cur.find(r => r.id === 'barWeight');
        const plates = cur.find(r => r.id === 'plates');
        const localUpdated = Math.max(updatedAtMs(bar ?? {}), updatedAtMs(plates ?? {}));
        const remoteMs = Date.parse(row.updated_at) || 0;
        const keepRemote = (!bar && !plates) || remoteMs >= localUpdated;
        if (keepRemote) {
          const payload = row.payload ?? {};
          await syncRawPut('equipment', {
            id: 'barWeight',
            value: Number(payload.barWeight) || 45,
            updatedAt: row.updated_at,
          });
          if (Array.isArray(payload.plates)) {
            await syncRawPut('equipment', { id: 'plates', value: payload.plates, updatedAt: row.updated_at });
          }
          result.applied++;
        } else {
          result.skippedLocalWins++;
        }
        continue;
      }
    }
  }
  return result;
}

async function resolveExerciseBySync(exerciseMeta, rawExercises, syncId, name) {
  if (!syncId) {
    // unattached set payload — find or create by name
    const found = rawExercises.find(e => e.name === name);
    if (found) return { localId: found.id, syncId: found.syncId ?? syncId ?? null, adopted: true };
    const body = normalizeExercise({ name: name || 'Imported exercise', metrics: ['strength'] });
    body.syncId = crypto.randomUUID();
    body.updatedAt = nowIso();
    const id = await syncRawPut('exercises', body);
    return { localId: id, syncId: body.syncId, created: true };
  }
  const hit = rawExercises.find(e => e.syncId === syncId);
  if (hit) return { localId: hit.id, syncId, adopted: false };
  // unknown syncId — create a stub exercise carrying it
  const body = normalizeExercise({ name: name || 'Imported exercise', metrics: ['strength'] });
  body.syncId = syncId;
  body.updatedAt = nowIso();
  const id = await syncRawPut('exercises', body);
  return { localId: id, syncId, created: true };
}

// ── sync now ───────────────────────────────────────────────
export async function syncNow() {
  const { data: { session } } = await supabaseClient().auth.getSession();
  if (!session) throw new Error('Sign in with the magic link first.');

  const progress = { phase: 'bootstrap', pushed: 0, applied: 0, deletes: 0 };
  try {
    await setSyncEnabled(true);
    await bootstrap();

    const lastPushAt = await kvGet('lastPushAt', null);
    progress.phase = 'push';
    const push = await pushAll(lastPushAt, session.user.id);
    await kvSet('lastPushAt', nowIso());

    progress.phase = 'pull';
    const pull = await pullAll();

    const lastSyncAt = nowIso();
    await kvSet('lastSyncAt', lastSyncAt);
    await kvSet('lastError', null);
    return { ok: true, ...push, ...pull, lastSyncAt };
  } catch (err) {
    const message = err?.message ?? String(err);
    await kvSet('lastError', message);
    throw err;
  }
}
