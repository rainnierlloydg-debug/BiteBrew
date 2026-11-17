import { createInterface } from 'node:readline';
import { db } from '../server/db.js';
import { hashPassword } from '../server/lib/password.js';
import { DEFAULT_STAFF_PASSWORD } from '../server/lib/default-password.js';
function ask(prompt) {
  return new Promise(resolve => { const reader = createInterface({ input: process.stdin, output: process.stdout }); reader.question(prompt, answer => { reader.close(); resolve(answer); }); });
}
try {
  const email = (process.env.ADMIN_EMAIL || await ask('Owner email: ')).trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || await ask('Owner name: ')).trim();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_STAFF_PASSWORD;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120 || password.length < 12 || password.length > 128) throw new Error('Provide a valid email, name and a 12–128 character password.');
  if (await db.user.findUnique({ where: { email } })) throw new Error('An account already exists for this email. This command never overwrites existing accounts.');
  if (await db.customerAccount.findUnique({ where: { email }, select: { id: true } })) throw new Error('This email already belongs to a customer account. Use a different owner email.');
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password), role: 'OWNER', active: true, createdAt: new Date() } });
  await db.auditLog.create({ data: { actorId: user.id, action: 'account.initial_owner_created', recordType: 'users', recordId: user.id, after: { name, email, role: 'OWNER' }, createdAt: new Date() } });
  console.log('Owner account created. Sign in using the configured initial password and change it in Settings.');
} finally { await db.$disconnect(); }
