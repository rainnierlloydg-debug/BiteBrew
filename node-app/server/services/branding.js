import { saveMedia } from './media.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, textSearch } from '../db.js';
import { root } from '../config.js';
import { brandBusiness, brandText } from '../../public/shared/brand.js';

// Idempotent data migration for installations created before the rebrand.
// Historical order snapshots are normalized for display in orderView instead.
export async function applyBranding() {
  const bytes = await fs.readFile(path.join(root, 'data/product-photos.png'));
  const filename = 'supplied-products-' + createHash('sha256').update(bytes).digest('hex').slice(0, 16) + '.png';
  await saveMedia(filename, bytes, { ifAbsent: true });
  return db.$transaction(async tx => {
    const stored = await tx.setting.findUnique({ where: { id: 1 } });
    if (stored) {
      const normalized = JSON.parse(JSON.stringify(brandBusiness(stored.data)));
      if (JSON.stringify(normalized) !== JSON.stringify(stored.data)) {
        await tx.setting.update({ where: { id: 1 }, data: { data: normalized } });
      }
    }
    const products = await tx.menuItem.findMany({ where: { OR: [
      { name: textSearch('Ella') }, { code: 'EP-ELLAS-BEST' },
      { image: { startsWith: '/uploads/supplied-products-' } },
    ] } });
    let updated = 0;
    for (const product of products) {
      const data = {};
      const name = brandText(product.name);
      if (name !== product.name) data.name = name;
      if (product.code === 'EP-ELLAS-BEST') data.code = 'BB-SPECIAL';
      if (product.imageFrame && product.image?.startsWith('/uploads/supplied-products-') && product.image !== '/uploads/' + filename) {
        data.image = '/uploads/' + filename;
      }
      if (Object.keys(data).length) {
        await tx.menuItem.update({ where: { id: product.id }, data });
        updated++;
      }
    }
    return { productsUpdated: updated };
  });
}
