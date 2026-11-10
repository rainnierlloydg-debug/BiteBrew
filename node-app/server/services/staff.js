import { z } from 'zod';
import { db } from '../db.js';
import { atomic, audit } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { safeUser, authorize } from '../lib/permissions.js';
import { hashPassword } from '../lib/password.js';
import { pagination, pageResult } from '../lib/time.js';
const schema = z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(190), role: z.enum(['OWNER', 'CASHIER', 'KITCHEN']), active: z.boolean(), password: z.string().min(12).max(128).optional() }).strict();
export async function listStaff(query = {}) {
  const p = pagination(query), where = { archivedAt: query.archived === '1' ? { not: null } : null, ...(query.q ? { OR: [{ name: { contains: String(query.q).slice(0, 120) } }, { email: { contains: String(query.q).slice(0, 120) } }] } : {}) };
  if (query.archived !== '1') where.registrationPending = query.status === 'pending';
  const [rows, total] = await db.$transaction([db.user.findMany({ where, skip: p.skip, take: p.take, orderBy: { name: 'asc' } }), db.user.count({ where })]);
  return pageResult(rows.map(safeUser), total, p);
}
export async function saveStaff(actor, key, id, input) {
  authorize(actor, 'staff');
  const data = schema.parse(input);
  if (!id && !data.password) fail(422, 'PASSWORD', 'A password of at least 12 characters is required.');
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  // Password bytes never enter idempotency or audit records; only a one-way request hash is retained.
  return atomic(actor, key, 'staff.save.' + (id || 'new'), data, async (tx, current) => {
    const before = id ? await tx.user.findUnique({ where: { id } }) : null;
    if (id && (!before || before.archivedAt)) fail(404, 'NOT_FOUND', 'Account not found.');
    if (id === actor.id && (!data.active || data.role !== 'OWNER')) fail(422, 'SELF_ACCOUNT', 'You cannot deactivate or demote your own account.');
    if (before?.role === 'OWNER' && (!data.active || data.role !== 'OWNER') && await tx.user.count({ where: { role: 'OWNER', active: true, archivedAt: null } }) <= 1) fail(422, 'LAST_OWNER', 'Keep at least one active owner account.');
    const fields = { name: data.name, email: data.email.toLowerCase().trim(), role: data.role, active: data.active, registrationPending: false, ...(passwordHash ? { passwordHash } : {}) };
    const row = before ? await tx.user.update({ where: { id }, data: { ...fields, authVersion: { increment: 1 } } }) : await tx.user.create({ data: { ...fields, passwordHash, createdAt: new Date() } });
    if (before) await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, current, before ? 'account.updated' : 'account.created', 'users', row.id, before ? safeUser(before) : null, safeUser(row));
    return safeUser(row);
  });
}
export const archiveModels = { products: 'menuItem', categories: 'category', customers: 'customer', staff: 'user' };
export async function reviewRegistration(actor, key, id, input) {
  authorize(actor, 'staff');
  const data = z.object({ action: z.enum(['approve', 'reject']), role: z.enum(['CASHIER', 'KITCHEN']).optional() }).strict().parse(input);
  return atomic(actor, key, 'staff.registration.' + id, data, async (tx, current) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before?.registrationPending || before.archivedAt) fail(409, 'REGISTRATION_REVIEWED', 'This request has already been reviewed. Refresh the staff list.');
    const approved = data.action === 'approve';
    const row = await tx.user.update({ where: { id }, data: { registrationPending: false, active: approved, role: data.role || before.role, archivedAt: approved ? null : new Date(), archivedById: approved ? null : current.id, authVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, current, approved ? 'staff.registration_approved' : 'staff.registration_rejected', 'users', id, safeUser(before), safeUser(row));
    return safeUser(row);
  });
}
export async function archiveRecord(actor, key, module, id, restore = false) {
  authorize(actor, 'archives');
  const model = archiveModels[module]; if (!model) fail(404, 'NOT_FOUND', 'This record cannot be archived.');
  return atomic(actor, key, `${module}.${restore ? 'restore' : 'archive'}.${id}`, { id, restore }, async (tx, current) => {
    const row = await tx[model].findUnique({ where: { id } });
    if (!row) fail(404, 'NOT_FOUND', 'Record not found.');
    if (module === 'staff' && id === actor.id) fail(422, 'SELF_ACCOUNT', 'You cannot archive your own account.');
    if (!restore && module === 'staff' && row.role === 'OWNER' && row.active && await tx.user.count({ where: { role: 'OWNER', active: true, archivedAt: null } }) <= 1) fail(422, 'LAST_OWNER', 'Keep at least one active owner.');
    if (!restore && module === 'categories' && await tx.menuItem.count({ where: { categoryId: id, archivedAt: null } })) fail(409, 'CATEGORY_IN_USE', 'Move or archive this category’s products first.');
    if (restore) {
      const unique = module === 'staff' ? { email: row.email } : module === 'products' ? { code: row.code } : module === 'categories' ? { name: row.name } : null;
      if (unique && await tx[model].findFirst({ where: { ...unique, id: { not: id } } })) fail(409, 'RESTORE_CONFLICT', 'A record already uses this unique value.');
      if (module === 'products') { const category = await tx.category.findUnique({ where: { id: row.categoryId } }); if (!category || category.archivedAt || !category.active) fail(409, 'CATEGORY_ARCHIVED', 'Restore the product category first.'); }
    }
    const changed = await tx[model].update({ where: { id }, data: { archivedAt: restore ? null : new Date(), archivedById: restore ? null : actor.id, active: restore, ...(module === 'staff' ? { authVersion: { increment: 1 } } : {}) } });
    if (module === 'staff') await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, current, `${module}.${restore ? 'restored' : 'archived'}`, module, id, module === 'staff' ? safeUser(row) : row, module === 'staff' ? safeUser(changed) : changed);
    return module === 'staff' ? safeUser(changed) : changed;
  });
}
