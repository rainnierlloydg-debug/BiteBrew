import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '../server/db.js';
import { root, config } from '../server/config.js';
import { audit } from '../server/lib/atomic.js';
import { expandMenu } from './expand-menu.js';
import { seedCategoryAddons } from './seed-category-addons.js';
export async function seedMenu() {
  const owner = await db.user.findFirst({ where: { role: 'OWNER', active: true, archivedAt: null }, orderBy: { createdAt: 'asc' } });
  if (!owner) throw new Error('Create an owner account before importing the supplied menu.');
  const menu = JSON.parse(await fs.readFile(path.join(root, 'data/menu.json'), 'utf8')), photos = JSON.parse(await fs.readFile(path.join(root, 'data/product-photos.json'), 'utf8'));
  const bytes = await fs.readFile(path.join(root, 'data/product-photos.png')), filename = 'supplied-products-' + createHash('sha256').update(bytes).digest('hex').slice(0, 16) + '.png';
  await fs.mkdir(config.uploads, { recursive: true }); await fs.writeFile(path.join(config.uploads, filename), bytes);
  const result = await db.$transaction(async tx => {
    const category = await tx.category.upsert({ where: { name: 'Pizzas' }, create: { name: 'Pizzas', createdAt: new Date() }, update: {} });
    const createdVariants = [], allVariants = []; let productsCreated = 0;
    for (const [index, item] of menu.products.entries()) {
      let product = await tx.menuItem.findUnique({ where: { code: item.code }, include: { variants: true } });
      if (!product) {
        const frame = photos.frames[item.code];
        product = await tx.menuItem.create({ data: { code: item.code, name: item.name, categoryId: category.id, active: true, demo: false, sortOrder: index, image: '/uploads/' + filename, ...(frame ? { imageFrame: { ...frame, source_width: photos.source_width, source_height: photos.source_height } } : {}), createdAt: new Date() }, include: { variants: true } }); productsCreated++;
      }
      let variant = product.variants[0];
      if (!variant) { variant = await tx.variant.create({ data: { menuItemId: product.id, name: menu.variant_name, price: item.price, active: true, createdAt: new Date() } }); createdVariants.push(variant.id); }
      allVariants.push(variant.id);
    }
    for (const item of menu.addons) {
      let addon = await tx.addon.findUnique({ where: { code: item.code } }), created = false;
      if (!addon) { addon = await tx.addon.create({ data: { code: item.code, name: item.name, price: item.price, active: true, createdAt: new Date() } }); created = true; }
      for (const variantId of created ? allVariants : createdVariants) await tx.addonVariant.upsert({ where: { addonId_variantId: { addonId: addon.id, variantId } }, create: { addonId: addon.id, variantId }, update: {} });
    }
    await audit(tx, owner, 'menu.supplied_imported', 'menu_items', null, null, { productsCreated, source: 'Owner-supplied menu and product photographs', pricesOverwritten: false });
    return { productsCreated, suppliedProducts: menu.products.length, addons: menu.addons.length };
  }, { timeout: 60000 });
  const expanded = await expandMenu(owner);
  await seedCategoryAddons(owner);
  return { ...result, extendedProductsCreated: expanded.productsCreated };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts/seed-menu.js')) {
  try { const result = await seedMenu(); console.log(`Supplied menu ready: ${result.suppliedProducts} products, ${result.addons} add-ons; ${result.productsCreated} new products. ${result.extendedProductsCreated} food/drink demonstration products added. Existing owner edits were preserved.`); } finally { await db.$disconnect(); }
}
