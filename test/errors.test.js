import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuotaError, isStorageError, describeStorageError } from '../js/kernel/errors.js';

test('quota errors are recognised by name and legacy code', () => {
  assert.equal(isQuotaError({ name: 'QuotaExceededError' }), true);
  assert.equal(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError({ code: 1014 }), true);
  assert.equal(isQuotaError({ name: 'InvalidStateError' }), false);
  assert.equal(isQuotaError(null), false);
});

test('storage errors include database failures but not ordinary validation errors', () => {
  assert.equal(isStorageError({ name: 'QuotaExceededError' }), true);
  assert.equal(isStorageError({ name: 'InvalidStateError' }), true);
  assert.equal(isStorageError({ message: 'IndexedDB is unavailable' }), true);
  assert.equal(isStorageError({ message: 'database connection lost' }), true);
  assert.equal(isStorageError({ name: 'ValidationError', message: 'Weight is required' }), false);
  assert.equal(isStorageError(null), false);
});

test('storage errors explain the cause and the export escape hatch', () => {
  const quota = describeStorageError({ name: 'QuotaExceededError' });
  assert.equal(quota.kind, 'quota');
  assert.match(quota.title, /out of storage/i);
  assert.match(quota.body, /Export a backup/i);

  const db = describeStorageError({ name: 'InvalidStateError' });
  assert.equal(db.kind, 'database');
  assert.match(db.body, /reloading/i);
  assert.match(db.body, /export a backup/i);

  const other = describeStorageError({ message: 'Something odd' });
  assert.equal(other.kind, 'other');
  assert.match(other.body, /existing data is safe/i);
});

test('error copy avoids destructive or medical language', () => {
  for (const err of [
    { name: 'QuotaExceededError' },
    { name: 'InvalidStateError' },
    { message: 'Something odd' },
  ]) {
    const info = describeStorageError(err);
    assert.doesNotMatch(`${info.title} ${info.body}`, /injur|diagnos|medical|readiness/i);
  }
});
