import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(24).toString('hex');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (stored?.startsWith('$2')) { const { default: bcrypt } = await import('bcryptjs'); return bcrypt.compare(password, stored); }
  if (!stored?.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  const derived = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const bytes = Buffer.from(expected, 'hex');
  return bytes.length === derived.length && timingSafeEqual(bytes, derived);
}
