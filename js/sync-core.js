// Pulse Sync — pure decision logic (no DOM, no IDB, no network).
// Unit-tested in test/sync_core.test.js. Everything here must run under node.
//
// Conflict model: last-writer-wins per record on `updated_at`. Ties are broken
// deterministically by a canonical (sorted-key) JSON serialisation of the two
// payloads, so two devices that received the same two candidate records always
// converge on the same winner. Deletes travel as tombstones (`deleted_at`).

import { normalizeSet, normalizeExercise, normalizeFuelLog, normalizeWaterLog, normalizeRecoveryLog } from './schema.js';

export const SYNC_DOMAINS = ['equipment', 'exercises', 'fuel_logs', 'water_logs', 'recovery_logs', 'sets'];
export const SYNC_TABLE = 'sync_rows';
export const TOMBSTONE_DELETED_AT = null;

export function isDomain(domain) {
  return SYNC_DOMAINS.includes(domain);
}

// ── Canonical serialization ────────────────────────────────
// Sorted-key JSON so both devices can compare two payloads identically.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

// ── updated_at normalization ───────────────────────────────
// Any record that was stamped at bootstrap/write carries an ISO `updatedAt`.
// Fall back to the record's natural timestamp for legacy rows so two untouched
// copies of the same legacy record compare equal on every device.
export function updatedAtMs(record) {
  const iso = typeof record?.updatedAt === 'string' ? record.updatedAt : null;
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isNaN(t)) return t;
  const ts = typeof record?.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
  if (!Number.isNaN(ts)) return ts;
  if (typeof record?.date === 'string') {
    const d = Date.parse(record.date + 'T00:00:00Z');
    if (!Number.isNaN(d)) return d;
  }
  return 0;                       // historical seeds: everywhere ties, settled by tiebreak
}

export function isoFromMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

// ── LWW decision ───────────────────────────────────────────
// remoteRec = { payload, updated_at, deleted_at } as read from sync_rows.
// Returns 'remote' | 'local' | 'equal' for what the LOCAL store should keep.
export function pickLWW(localRec, remoteRow) {
  if (!remoteRow || typeof remoteRow !== 'object') return 'local';
  const remoteMs = Date.parse(remoteRow.updated_at ?? NaN);
  const localMs = updatedAtMs(localRec);
  const remote = Number.isFinite(remoteMs) ? remoteMs : 0;
  if (remote > localMs) return 'remote';
  if (localMs > remote) return 'local';
  // Deterministic tiebreak: the lexicographically smaller canonical payload wins.
  const a = stableStringify(stripForCompare(localRec));
  const b = stableStringify(stripForCompare(remoteRow.payload ?? {}));
  if (a === b) return 'equal';
  return a < b ? 'local' : 'remote';
}

// Fields excluded from comparison: device-local ids and bookkeeping we don't
// want to let wobble between devices.
function stripForCompare(record) {
  const { id, syncId, updatedAt, createdAt, ...rest } = record ?? {};
  // equipment, exercises, sets: device-local numeric ids are meaningless remotely
  if (typeof id === 'number') delete rest.id;
  return rest;
}

// ── Payload construction ───────────────────────────────────
// Build the pushed payload for a domain record. `exerciseSync` maps a LOCAL
// exercise id → its sync id (needed to rebase sets onto another device).
// Sets also carry `exerciseName` so they can self-heal after a restore.
export function payloadFor(domain, record, exerciseSync = new Map()) {
  switch (domain) {
    case 'equipment': {
      const { id, ...rest } = record ?? {};
      return { ...rest };
    }
    case 'exercises': {
      const { id, syncId, ...rest } = normalizeExercise(record);
      return rest;                     // syncId lives in the row key, not the body
    }
    case 'sets': {
      const norm = normalizeSet(record);
      const meta = exerciseSync.get(record.exerciseId);
      const exSync = meta?.syncId ?? record.exerciseSyncId ?? null;
      const { id, exerciseId, exerciseName, ...rest } = norm;
      return { ...rest, exerciseSyncId: exSync, exerciseName: meta?.name ?? exerciseName ?? null };
    }
    case 'fuel_logs':
      return { ...normalizeFuelLog(record) };   // uuid id is portable — keep it
    case 'water_logs': {
      const { ...rest } = normalizeWaterLog(record);
      return { ...rest };
    }
    case 'recovery_logs':
      return { ...normalizeRecoveryLog(record) };   // keyed by date, like water
    default:
      throw new Error('Unknown sync domain: ' + domain);
  }
}

export function externalIdFor(domain, record) {
  switch (domain) {
    case 'exercises':
    case 'sets':
      if (!record?.syncId) throw new Error('syncId missing — run the bootstrap first');
      return record.syncId;
    case 'fuel_logs':
      return normalizeFuelLog(record).id;
    case 'water_logs':
      return normalizeWaterLog(record).date;
    case 'recovery_logs':
      return normalizeRecoveryLog(record).date;
    case 'equipment':
      return 'equipment';
    default:
      throw new Error('Unknown sync domain: ' + domain);
  }
}

export function rowFor(domain, record, exerciseSync) {
  return {
    domain,
    external_id: externalIdFor(domain, record),
    payload: payloadFor(domain, record, exerciseSync),
    // remote rows carry the record's own LWW clock — if we stamped push time,
    // whichever device synced last would always look newest.
    updated_at: isoFromMs(updatedAtMs(record)),
    deleted_at: null,
  };
}

export function tombstoneFor(domain, externalId, nowIso) {
  return { domain, external_id: String(externalId), payload: {}, updated_at: nowIso, deleted_at: nowIso };
}

// ── Remote row validation (server is ours, but never trust it blindly) ──
export function validateRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (!isDomain(row.domain)) return null;
  const externalId = typeof row.external_id === 'string' && row.external_id.trim() ? row.external_id : null;
  if (!externalId) return null;
  if (row.payload === null || typeof row.payload !== 'object') return null;
  const updated = Date.parse(row.updated_at ?? NaN);
  if (Number.isNaN(updated)) return null;
  const deleted = row.deleted_at ? Date.parse(row.deleted_at) : null;
  if (row.deleted_at && Number.isNaN(deleted ?? NaN)) return null;
  return {
    domain: row.domain,
    external_id: externalId,
    payload: row.payload,
    updated_at: new Date(updated).toISOString(),
    deleted_at: deleted === null ? null : new Date(deleted).toISOString(),
  };
}

// LWW sets decision AFTER the sync apply decides this user's newest push.
// Dirty entries tracked by the local queue carry the op; a remote row whose
// domain+external_id is dirty locally ALWAYS loses to the local write, no
// matter the clock — the local user's intent wins.
export function shouldApplyRemote(domain, externalId, dirtyKeys) {
  return !dirtyKeys.has(`${domain}:${externalId}`);
}

// Exercise self-heal — pure: pick the resolution for a remote exercise row
// against the local list. Returns { action: 'apply' | 'insert' | 'adopt', id? }.
export function resolveExerciseRow(row, localExercises) {
  const bySync = localExercises.find(e => e.syncId === row.external_id);
  if (bySync) return { action: 'apply', localId: bySync.id };
  const name = typeof row.payload?.name === 'string' ? row.payload.name : null;
  const byName = name ? localExercises.find(e => e.name === name) : null;
  if (byName) return { action: 'adopt', localId: byName.id };   // name is unique in the shared DB
  return { action: 'insert' };
}

// ── Bootstrap stamping ─────────────────────────────────────
// Fill in the fields older records lack. Returns { changed, records } — the
// caller persists `records` transactionally. Uses a fixed, deterministic
// updatedAt fallback so untouched copies compare equal on every device.
export function bootstrapStamp(records, domain, uuid = () => crypto.randomUUID()) {
  let changed = false;
  const stamped = records.map(r => {
    const out = { ...r };
    if ((domain === 'exercises' || domain === 'sets') && !out.syncId) { out.syncId = uuid(); changed = true; }
    if (!out.updatedAt) { out.updatedAt = isoFromMs(updatedAtMs(out)); changed = true; }
    return out;
  });
  return { changed, records: stamped };
}
