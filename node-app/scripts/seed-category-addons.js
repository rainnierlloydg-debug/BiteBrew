import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../server/db.js';
import { root } from '../server/config.js';
import { audit } from '../server/lib/atomic.js';
import { authorize } from '../server/lib/permissions.js';

export async function seedCategoryAddons(owner) {
  authorize(owner, 'menu');
  const source = JSON.parse(await fs.readFile(path.join(root, 'data/category-addons.json'), 'utf8'));
  return db.$transaction(async tx => {
    let created = 0, linked = 0;
    for (const item of source.addons) {
      const variants = await tx.variant.findMany({ where: {
        active: true, product: { archivedAt: null, category: { name: item.category }, ...(item.productCodes ? { code: { in: item.productCodes } } : {}) },
      }, select: { id: true } });
      if (!variants.length) continue;
      let addon = await tx.addon.findUnique({ where: { code: item.code } });
      if (!addon) {
        addon = await tx.addon.create({ data: { code: item.code, name: item.name, price: item.price, active: true } });
        created++;
        await audit(tx, owner, 'addons.demonstration_created', 'addons', addon.id, null, { ...addon, demoPricing: true, category: item.category });
      }
      const result = await tx.addonVariant.createMany({ data: variants.map(variant => ({ addonId: addon.id, variantId: variant.id })), skipDuplicates: true });
      linked += result.count;
      if (result.count) await audit(tx, owner, 'addons.variants_linked', 'addons', addon.id, null, { category: item.category, variantsAdded: result.count });
    }
    return { created, linked, demoPricing: true };
  }, { timeout: 60000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts/seed-category-addons.js')) {
  try {
    const owner = await db.user.findFirst({ where: { role: 'OWNER', active: true, archivedAt: null } });
    if (!owner) throw new Error('An active owner is required.');
    console.log(JSON.stringify(await seedCategoryAddons(owner)));
  } finally { await db.$disconnect(); }
}
