import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../server/lib/password.js';
import { authorize, authorizeOrderStatus, safeUser, permissions } from '../server/lib/permissions.js';
import { encodeBackup, decodeBackup } from '../server/lib/backup-codec.js';
test('passwords are salted, hashed and verified with no plaintext storage', async () => { const password = 'Private fixture password 2026'; const a = await hashPassword(password), b = await hashPassword(password); assert.notEqual(a, b); assert.equal(a.includes(password), false); assert.equal(await verifyPassword(password, a), true); assert.equal(await verifyPassword(password + 'x', a), false); assert.equal(await verifyPassword(password, 'invalid'), false); });
test('roles block finance and account administration for kitchen', () => { assert.throws(() => authorize({ role: 'KITCHEN' }, 'reports'), { status: 403 }); assert.throws(() => authorize({ role: 'CASHIER' }, 'staff'), { status: 403 }); assert.throws(() => authorize(null, 'orders'), { status: 403 }); for (const permission of permissions.OWNER) assert.doesNotThrow(() => authorize({ role: 'OWNER' }, permission)); });
test('public account data excludes passwords and authentication version', () => { const user = safeUser({ id: '1', name: 'Owner', email: 'owner@example.test', role: 'OWNER', passwordHash: 'secret', authVersion: 9 }); assert.equal(user.passwordHash, undefined); assert.equal(user.authVersion, undefined); });
test('kitchen role is limited to preparation, chat and notifications', () => {
  const kitchen = { role: 'KITCHEN' };
  for (const permission of ['kitchen', 'chat', 'notifications']) assert.doesNotThrow(() => authorize(kitchen, permission));
  for (const permission of ['dashboard', 'pos', 'orders', 'menu', 'customers', 'payments', 'reports', 'archives', 'staff', 'audit', 'settings']) assert.throws(() => authorize(kitchen, permission), { status: 403 });
  for (const status of ['PREPARING', 'READY']) assert.doesNotThrow(() => authorizeOrderStatus(kitchen, status));
  for (const status of ['CONFIRMED', 'COMPLETED', 'CANCELLED']) assert.throws(() => authorizeOrderStatus(kitchen, status), { status: 403 });
});
test('cashier operations exclude owner administration and unknown roles have no access', () => {
  const cashier = { role: 'CASHIER' };
  for (const permission of ['pos', 'orders', 'payments', 'reports', 'chat']) assert.doesNotThrow(() => authorize(cashier, permission));
  for (const permission of ['menu', 'archives', 'staff', 'audit', 'settings']) assert.throws(() => authorize(cashier, permission), { status: 403 });
  assert.throws(() => authorize({ role: 'staff' }, 'orders'), { status: 403 });
  assert.throws(() => authorizeOrderStatus(null, 'READY'), { status: 403 });
});
test('encrypted backup roundtrip preserves records and media', () => { const source = { tables: { orders: [{ total: '185.00' }] }, files: [{ data: 'aGVsbG8=' }] }; const bytes = encodeBackup(source, 'A separate backup passphrase 2026'); assert.deepEqual(decodeBackup(bytes, 'A separate backup passphrase 2026'), source); assert.equal(bytes.includes(Buffer.from('185.00')), false); });
test('backup integrity rejects wrong passphrases and tampering', () => { const bytes = encodeBackup({ sensitive: true }, 'A separate backup passphrase 2026'); assert.throws(() => decodeBackup(bytes, 'A different backup passphrase 2026')); bytes[bytes.length - 1] ^= 1; assert.throws(() => decodeBackup(bytes, 'A separate backup passphrase 2026')); assert.throws(() => encodeBackup({}, 'short')); });
