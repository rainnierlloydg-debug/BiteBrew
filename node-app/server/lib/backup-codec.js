import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const magic = Buffer.from('ELLASPIZZA2\0');
function key(password, salt) {
  if (typeof password !== 'string' || password.length < 20) throw new Error('Set BACKUP_PASSPHRASE to at least 20 characters. Store it separately from backups.');
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export function encodeBackup(value, password) {
  const salt = randomBytes(24), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(password, salt), iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(value)))), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted]);
}
export function decodeBackup(bytes, password) {
  if (!bytes.subarray(0, magic.length).equals(magic) || bytes.length < magic.length + 53) throw new Error('Invalid application backup.');
  const offset = magic.length, salt = bytes.subarray(offset, offset + 24), iv = bytes.subarray(offset + 24, offset + 36);
  const decipher = createDecipheriv('aes-256-gcm', key(password, salt), iv); decipher.setAAD(magic); decipher.setAuthTag(bytes.subarray(offset + 36, offset + 52));
  const plaintext = Buffer.concat([decipher.update(bytes.subarray(offset + 52)), decipher.final()]);
  return JSON.parse(gunzipSync(plaintext, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8'));
}
