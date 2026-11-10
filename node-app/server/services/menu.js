import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { atomic, audit } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { authorize } from '../lib/permissions.js';
import { pagination, pageResult } from '../lib/time.js';
import { cents } from '../../public/shared/calculation.js';

export const uuid = z.uuid();
export const amount = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');
const text = (max, required = false) => required ? z.string().trim().min(1).max(max) : z.string().trim().max(max).nullish();
const productSchema = z.object({
  code: text(40), name: text(120, true), categoryId: uuid, description: text(1000),
  image: z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/).nullish(), active: z.boolean(), demo: z.boolean().default(false),
  variants: z.array(z.object({ id: uuid.optional(), name: text(80, true), price: amount, active: z.boolean() }).strict()).min(1).max(20),
}).strict();
export async function catalog(actor, query = {}, management = false) {
  const p = pagination(query), owner = actor.role === 'OWNER';
  if (query.archived === '1' && !owner) fail(403, 'FORBIDDEN', 'Only the owner can view archived records.');
  const where = { archivedAt: owner && query.archived === '1' ? { not: null } : null, ...(!management ? { active: true, category: { archivedAt: null, active: true } } : {}), ...(query.categoryId ? { categoryId: uuid.parse(query.categoryId) } : {}), ...(query.q ? { OR: [{ name: { contains: String(query.q).slice(0, 120) } }, { code: { contains: String(query.q).slice(0, 120) } }] } : {}) };
  const [rows, total] = await db.$transaction([db.menuItem.findMany({ where, include: { category: true, variants: { include: { addons: { include: { addon: true } } }, orderBy: { createdAt: 'asc' } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: p.skip, take: p.take }), db.menuItem.count({ where })]);
  return pageResult(rows.map(row => ({ ...row, variants: row.variants.map(variant => ({ ...variant, addons: variant.addons.map(link => link.addon) })) })), total, p);
}
export async function saveProduct(actor, key, id, input) {
  authorize(actor, 'menu');
  const data = productSchema.parse(input);
  const names = data.variants.map(v => v.name.toLowerCase());
  if (new Set(names).size !== names.length) fail(422, 'VARIANTS', 'Variant names must be unique within the product.');
  if (data.image) {
    try { await fs.access(path.join(config.uploads, path.basename(data.image))); } catch { fail(422, 'IMAGE_MISSING', 'Upload the selected picture again.'); }
  }
  return atomic(actor, key, 'product.save.' + (id || 'new'), data, async (tx, current) => {
    const before = id ? await tx.menuItem.findUnique({ where: { id }, include: { variants: true } }) : null;
    if (id && (!before || before.archivedAt)) fail(404, 'NOT_FOUND', 'The active product was not found.');
    const category = await tx.category.findUnique({ where: { id: data.categoryId } });
    if (!category || category.archivedAt || !category.active) fail(422, 'CATEGORY', 'Choose an active category.');
    for (const variant of data.variants) if (variant.id && !before?.variants.some(v => v.id === variant.id)) fail(422, 'VARIANT', 'The variant does not belong to this product.');
    const fields = { code: data.code || before?.code || 'EP-' + randomUUID().slice(0, 8).toUpperCase(), name: data.name, categoryId: data.categoryId, description: data.description || null, image: data.image || null, active: data.active, demo: data.demo, ...(!before || before.image !== data.image ? { imageFrame: null } : {}) };
    // JSON null is supplied through Prisma's explicit sentinel below when replacing a framed image.
    if ('imageFrame' in fields) delete fields.imageFrame;
    const product = id ? await tx.menuItem.update({ where: { id }, data: fields }) : await tx.menuItem.create({ data: { ...fields, createdAt: new Date() } });
    if (before?.imageFrame && before.image !== (data.image || null)) await tx.$executeRaw`UPDATE menu_items SET imageFrame = NULL WHERE id = ${product.id}`;
    const kept = [];
    for (const variant of data.variants) {
      const values = { name: variant.name, price: variant.price, active: variant.active };
      const saved = variant.id ? await tx.variant.update({ where: { id: variant.id }, data: values }) : await tx.variant.create({ data: { ...values, menuItemId: product.id, createdAt: new Date() } });
      kept.push(saved.id);
    }
    await tx.variant.updateMany({ where: { menuItemId: product.id, id: { notIn: kept } }, data: { active: false } });
    const after = await tx.menuItem.findUnique({ where: { id: product.id }, include: { variants: true } });
    await audit(tx, current, before ? 'menu.updated' : 'menu.created', 'menu_items', product.id, before, after);
    return after;
  });
}
export const recordModels = { categories: 'category', addons: 'addon', discounts: 'discount', customers: 'customer' };
const schemas = {
  categories: z.object({ name: text(100, true), active: z.boolean().default(true) }).strict(),
  addons: z.object({ code: text(40), name: text(100, true), price: amount, active: z.boolean(), variantIds: z.array(uuid).max(1000) }).strict(),
  discounts: z.object({ name: text(100, true), kind: z.enum(['FIXED', 'PERCENT']), value: amount, active: z.boolean(), startsAt: z.iso.datetime().nullish(), endsAt: z.iso.datetime().nullish() }).strict(),
  customers: z.object({ name: text(120, true), contact: text(40), active: z.boolean().default(true) }).strict(),
};
export async function listRecords(actor, module, query = {}) {
  const model = recordModels[module]; if (!model) fail(404, 'NOT_FOUND', 'Unknown record type.');
  const p = pagination(query), hasArchive = ['categories', 'customers'].includes(module);
  if (query.archived === '1' && actor.role !== 'OWNER') fail(403, 'FORBIDDEN', 'Only the owner can view archived records.');
  const q = String(query.q || '').slice(0, 120);
  const where = { ...(hasArchive ? { archivedAt: query.archived === '1' ? { not: null } : null } : {}), ...(actor.role !== 'OWNER' ? { active: true } : {}), ...(q ? { OR: [{ name: { contains: q } }, ...(module === 'customers' ? [{ contact: { contains: q } }] : [])] } : {}) };
  const [data, total] = await db.$transaction([db[model].findMany({ where, skip: p.skip, take: p.take, orderBy: { name: 'asc' }, ...(module === 'addons' ? { include: { variants: true } } : {}) }), db[model].count({ where })]);
  return pageResult(data, total, p);
}
export async function saveRecord(actor, key, module, id, input) {
  authorize(actor, module === 'customers' ? 'customers' : 'menu');
  const data = schemas[module]?.parse(input); if (!data) fail(404, 'NOT_FOUND', 'Unknown record type.');
  return atomic(actor, key, `${module}.save.${id || 'new'}`, data, async (tx, current) => {
    const model = recordModels[module], before = id ? await tx[model].findUnique({ where: { id } }) : null;
    if (id && (!before || before.archivedAt)) fail(404, 'NOT_FOUND', 'The active record was not found.');
    const { variantIds, ...fields } = data;
    if (module === 'addons') fields.code ||= before?.code || 'ADD-' + randomUUID().slice(0, 8).toUpperCase();
    if (module === 'discounts') {
      if (data.kind === 'PERCENT' && cents(data.value) > 10000) fail(422, 'DISCOUNT', 'Percentage discounts cannot exceed 100%.');
      fields.startsAt = data.startsAt ? new Date(data.startsAt) : null; fields.endsAt = data.endsAt ? new Date(data.endsAt) : null;
      if (fields.startsAt && fields.endsAt && fields.endsAt <= fields.startsAt) fail(422, 'DISCOUNT', 'Expiry must be after activation.');
    }
    const row = id ? await tx[model].update({ where: { id }, data: fields }) : await tx[model].create({ data: { ...fields, createdAt: new Date() } });
    if (module === 'addons') {
      const uniqueIds = [...new Set(variantIds)];
      if (await tx.variant.count({ where: { id: { in: uniqueIds }, product: { archivedAt: null } } }) !== uniqueIds.length) fail(422, 'VARIANTS', 'Select valid product variants.');
      await tx.addonVariant.deleteMany({ where: { addonId: row.id } });
      if (uniqueIds.length) await tx.addonVariant.createMany({ data: uniqueIds.map(variantId => ({ variantId, addonId: row.id })) });
    }
    await audit(tx, current, `${module}.${id ? 'updated' : 'created'}`, module, row.id, before, { ...row, ...(variantIds ? { variantIds } : {}) });
    return row;
  });
}
