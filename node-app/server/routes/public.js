import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { pagination, pageResult } from '../lib/time.js';
import { fail } from '../lib/errors.js';

const available = { active: true, archivedAt: null, category: { active: true, archivedAt: null } };
export function publicRoutes() {
  const router = Router();
  router.get('/products', async (req, res, next) => {
    try {
      const p = pagination(req.query);
      const where = { ...available, ...(req.query.categoryId ? { categoryId: z.uuid().parse(req.query.categoryId) } : {}), ...(req.query.q ? { name: { contains: String(req.query.q).slice(0, 120) } } : {}) };
      const [products, total, categories] = await db.$transaction([
        db.menuItem.findMany({ where, select: { id: true, name: true, description: true, demo: true, image: true, imageFrame: true, category: { select: { id: true, name: true } }, variants: { where: { active: true }, select: { id: true, name: true, price: true, addons: { where: { addon: { active: true } }, select: { addon: { select: { id: true, name: true, price: true } } } } }, orderBy: { price: 'asc' } } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: p.skip, take: p.take }),
        db.menuItem.count({ where }),
        db.category.findMany({ where: { active: true, archivedAt: null, products: { some: { active: true, archivedAt: null } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ]);
      res.json({ ...pageResult(products.map(product => ({ ...product, variants: product.variants.map(variant => ({ ...variant, addons: variant.addons.map(link => link.addon) })), image: product.image ? `/api/public/products/${product.id}/image` : null })), total, p), categories });
    } catch (error) { next(error); }
  });
  // Only expose the image of a currently public product, never the upload directory.
  router.get('/products/:id/image', async (req, res, next) => {
    try {
      const product = await db.menuItem.findFirst({ where: { id: z.uuid().parse(req.params.id), ...available }, select: { image: true } });
      if (!product?.image || !/^\/uploads\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(product.image)) fail(404, 'NOT_FOUND', 'Product image unavailable.');
      res.sendFile(path.join(config.uploads, path.basename(product.image)), error => { if (error) next(error); });
    } catch (error) { next(error); }
  });
  return router;
}
