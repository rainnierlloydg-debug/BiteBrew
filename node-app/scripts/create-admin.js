import { createInterface, emitKeypressEvents } from 'node:readline';
import { db } from '../server/db.js';
import { hashPassword } from '../server/lib/password.js';
async function ask(prompt, secret = false) {
  if (!secret) return new Promise(resolve => { const reader = createInterface({ input: process.stdin, output: process.stdout }); reader.question(prompt, answer => { reader.close(); resolve(answer); }); });
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal, or set ADMIN_PASSWORD privately in the process environment.');
  process.stdout.write(prompt); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => { let value = ''; const listener = (text, key) => { if (key?.ctrl && key.name === 'c') { cleanup(); reject(new Error('Cancelled.')); } else if (key?.name === 'return') { cleanup(); process.stdout.write('\n'); resolve(value); } else if (key?.name === 'backspace') value = value.slice(0, -1); else if (text && !key?.ctrl) value += text; }; const cleanup = () => { process.stdin.removeListener('keypress', listener); process.stdin.setRawMode(false); process.stdin.pause(); }; process.stdin.on('keypress', listener); });
}
try {
  const email = (process.env.ADMIN_EMAIL || await ask('Owner email: ')).trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || await ask('Owner name: ')).trim();
  const password = process.env.ADMIN_PASSWORD || await ask('Password (12+ characters; hidden): ', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120 || password.length < 12 || password.length > 128) throw new Error('Provide a valid email, name and a 12–128 character password.');
  if (await db.user.findUnique({ where: { email } })) throw new Error('An account already exists for this email. This command never overwrites existing accounts.');
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password), role: 'OWNER', active: true, createdAt: new Date() } });
  await db.auditLog.create({ data: { actorId: user.id, action: 'account.initial_owner_created', recordType: 'users', recordId: user.id, after: { name, email, role: 'OWNER' }, createdAt: new Date() } });
  console.log('Owner account created. No default password is provided.');
} finally { await db.$disconnect(); }
