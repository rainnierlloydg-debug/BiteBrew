import { db } from '../server/db.js';
import { audit } from '../server/lib/atomic.js';

// Demonstration prices: Small uses the original price; Medium +50, Large +100.
const sizes = ['Small', 'Medium', 'Large'];
const priceOffsets = { Small: 0, Medium: 50, Large: 100 };
try {
  const result = await db.$transaction(async tx => {
    const owner = await tx.user.findFirst({ where: { role: 'OWNER', active: true, archivedAt: null } });
    if (!owner) throw new Error('An active owner is required.');
    const pizzas = await tx.menuItem.findMany({
      where: { category: { name: { in: ['Pizza', 'Pizzas'] } } },
      include: { variants: { include: { addons: true }, orderBy: { createdAt: 'asc' } } },
    });
    let updated = 0;
    for (const pizza of pizzas) {
      const source = pizza.variants.find(variant => variant.active) || pizza.variants[0];
      if (!source) throw new Error(`No price available for ${pizza.name}.`);
      const before = pizza.variants.map(({ id, name, price, active }) => ({ id, name, price: String(price), active }));
      let changed = false;
      for (const name of sizes) {
        const existing = pizza.variants.find(variant => variant.name === name);
        if (existing) continue;
        await tx.variant.create({ data: {
          menuItemId: pizza.id, name, price: (Number(source.price) + priceOffsets[name]).toFixed(2), active: true,
          addons: { create: source.addons.map(({ addonId }) => ({ addonId })) },
        } });
        changed = true;
      }
      const retired = await tx.variant.updateMany({
        where: { menuItemId: pizza.id, name: { notIn: sizes }, active: true }, data: { active: false },
      });
      if (changed || retired.count) {
        updated++;
        const after = await tx.variant.findMany({ where: { menuItemId: pizza.id }, select: { id: true, name: true, price: true, active: true } });
        await audit(tx, owner, 'menu.pizza_sizes_added', 'menu_items', pizza.id, before,
          { variants: after, reason: 'User requested Small, Medium and Large with distinct demonstration prices: original price, +50 PHP and +100 PHP.' });
      }
    }
    return { pizzas: pizzas.length, updated };
  }, { timeout: 60000 });
  console.log(JSON.stringify(result));
  const pizzas = await db.menuItem.findMany({ where: { category: { name: { in: ['Pizza', 'Pizzas'] } } }, include: { variants: { where: { active: true } } } });
  if (pizzas.some(pizza => sizes.some(size => !pizza.variants.some(variant => variant.name === size)) || pizza.variants.length !== sizes.length)) {
    throw new Error('Some pizzas do not have exactly three active size options.');
  }
  console.log(`Verified Small, Medium and Large on ${pizzas.length} pizzas.`);
} finally { await db.$disconnect(); }
