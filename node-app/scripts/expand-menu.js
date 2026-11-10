import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db } from '../server/db.js';
import { config, root } from '../server/config.js';
import { atomic, audit } from '../server/lib/atomic.js';
import { authorize } from '../server/lib/permissions.js';
import { settings } from '../server/services/settings.js';
import { BRAND } from '../public/shared/brand.js';

function burgerIllustration(item) {
  const toppings = new Set(item.toppings || []), double = toppings.has('double');
  const seeds = [[201, 169], [236, 145], [274, 163], [313, 144], [353, 172], [245, 190], [322, 191]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3" fill="#fff0c3" transform="rotate(-25 ${x} ${y})"/>`).join('');
  const cheese = toppings.has('cheese') ? '<path d="M149 275H411L366 306 324 287 269 308 218 287 171 302Z" fill="#f5c64c"/>' : '';
  const bacon = toppings.has('bacon') ? '<path d="M165 261 208 253 249 264 291 253 337 264 388 255" fill="none" stroke="#a75040" stroke-width="15" stroke-linecap="round"/>' : '';
  const mushroom = toppings.has('mushroom') ? '<g fill="#c5b094" stroke="#9e8568" stroke-width="2"><path d="M206 256q20-28 40 0h-15v12h-10v-12Z"/><path d="M318 254q20-28 40 0h-15v12h-10v-12Z"/></g>' : '';
  const egg = toppings.has('egg') ? '<ellipse cx="280" cy="262" rx="48" ry="17" fill="#fff9e9"/><ellipse cx="280" cy="259" rx="19" ry="11" fill="#edb92b"/>' : '';
  const pineapple = toppings.has('pineapple') ? '<ellipse cx="280" cy="261" rx="81" ry="14" fill="#edc756"/><ellipse cx="280" cy="261" rx="25" ry="5" fill="#b57f3a"/>' : '';
  const chili = toppings.has('chili') ? '<g fill="#408445"><ellipse cx="225" cy="259" rx="15" ry="7"/><ellipse cx="327" cy="260" rx="15" ry="7"/></g>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="440" viewBox="0 0 560 440"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f6faef"/><stop offset="1" stop-color="#e4efdc"/></linearGradient><linearGradient id="bun" x2="0" y2="1"><stop stop-color="#f0c074"/><stop offset="1" stop-color="#d89340"/></linearGradient></defs><rect width="560" height="440" fill="url(#bg)"/><circle cx="280" cy="226" r="167" fill="#fff" opacity=".5"/><ellipse cx="280" cy="388" rx="147" ry="15" fill="#284c32" opacity=".12"/><path d="M149 ${double ? 342 : 324}H411Q404 381 365 383H195Q155 381 149 ${double ? 342 : 324}Z" fill="url(#bun)"/>${double ? `<rect x="145" y="309" width="270" height="34" rx="17" fill="${item.color}"/><path d="M150 309H409L357 327 304 314 250 328 200 315Z" fill="#f5c64c"/>` : ''}<rect x="141" y="278" width="278" height="40" rx="20" fill="${item.color}"/><path d="M164 293H398" stroke="#412d25" stroke-width="4" stroke-linecap="round" opacity=".2"/>${cheese}<rect x="155" y="248" width="250" height="21" rx="10" fill="#cf6751"/>${bacon}${mushroom}${egg}${pineapple}${chili}<path d="M143 232 166 221 191 236 216 225 242 236 267 225 294 237 322 224 350 235 377 224 418 233 408 249 376 240 352 251 321 239 295 250 268 239 242 249 217 239 191 250 167 238 148 248Z" fill="#79a35e"/><path d="M145 214Q151 119 234 113H326Q408 119 415 214Q280 238 145 214Z" fill="url(#bun)"/>${seeds}</svg>`;
}

function illustration(item) {
  if (item.category === 'Burgers') return burgerIllustration(item);
  const tea = item.category === 'Milk Tea';
  const pearls = [[247, 328], [284, 339], [319, 326], [269, 367], [306, 363], [237, 359]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#3c2b29"/>`).join('');
  const fries = [[207, 157, -9], [244, 137, -3], [283, 143, 5], [322, 160, 12], [227, 178, -6], [302, 174, 7]].map(([x, y, angle]) => `<rect x="${x}" y="${y}" width="25" height="180" rx="8" fill="#efbd50" stroke="#e5a536" stroke-width="3" transform="rotate(${angle} ${x + 12} 290)"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="440" viewBox="0 0 560 440"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f6faef"/><stop offset="1" stop-color="#e4efdc"/></linearGradient><linearGradient id="drink" x2="1" y2="1"><stop stop-color="${item.color}"/><stop offset="1" stop-color="#f0dcc2"/></linearGradient></defs><rect width="560" height="440" fill="url(#bg)"/><circle cx="280" cy="228" r="163" fill="#ffffff" opacity=".5"/><ellipse cx="280" cy="397" rx="112" ry="13" fill="#284c32" opacity=".12"/>${tea ? `<path d="M307 56 283 204" stroke="#466c4d" stroke-width="17" stroke-linecap="round"/><path d="M201 171H359L337 378Q335 395 318 395H242Q225 395 223 378Z" fill="url(#drink)" stroke="#ffffff" stroke-width="8"/>${pearls}<rect x="191" y="153" width="178" height="29" rx="12" fill="#426e49"/><path d="M231 199 242 296" stroke="#ffffff" opacity=".35" stroke-width="11" stroke-linecap="round"/><rect x="243" y="231" width="77" height="47" rx="16" fill="#fff" opacity=".7"/><text x="281" y="262" text-anchor="middle" fill="#426e49" font-family="Arial,sans-serif" font-size="23" font-weight="bold">B&amp;B</text>` : `${fries}<path d="M188 256Q279 300 373 256L351 376Q349 395 329 395H232Q211 395 208 376Z" fill="${item.color}"/><path d="M211 283Q280 309 349 282" fill="none" stroke="#fff" stroke-width="6" opacity=".2"/><circle cx="280" cy="342" r="32" fill="#fff" opacity=".85"/><text x="280" y="350" text-anchor="middle" fill="${item.color}" font-family="Arial,sans-serif" font-size="21" font-weight="bold">B&amp;B</text>`}</svg>`;
}

export async function expandMenu(actor, { rebrand = false } = {}) {
  authorize(actor, 'menu');
  const source = JSON.parse(await fs.readFile(path.join(root, 'data/extended-menu.json'), 'utf8'));
  await fs.mkdir(config.uploads, { recursive: true });
  for (const item of source.products) {
    const filename = item.code.toLowerCase() + '-illustration-v1.webp';
    item.image = '/uploads/' + filename;
    try { await fs.access(path.join(config.uploads, filename)); } catch { await fs.writeFile(path.join(config.uploads, filename), await sharp(Buffer.from(illustration(item))).webp({ quality: 90 }).toBuffer(), { flag: 'wx' }); }
  }
  return atomic(actor, randomUUID(), 'menu.expand.catalog', { rebrand, codes: source.products.map(item => item.code) }, async (tx, current) => {
    let productsCreated = 0;
    for (const [index, item] of source.products.entries()) {
      const category = await tx.category.upsert({ where: { name: item.category }, create: { name: item.category, active: true }, update: {} });
      if (await tx.menuItem.findUnique({ where: { code: item.code } })) continue;
      await tx.menuItem.create({ data: { code: item.code, name: item.name, categoryId: category.id, description: item.description + ' Illustration shown. DEMO pricing — confirm prices in Menu before use.', image: item.image, demo: true, active: true, sortOrder: 100 + index, variants: { create: item.variants.map(variant => ({ ...variant, active: true })) } } });
      productsCreated++;
    }
    if (rebrand) {
      const before = await settings(tx), after = { ...before, name: BRAND.name, systemName: BRAND.systemName, footer: 'Thank you for choosing Bite & Brew!', logo: null, orderPrefix: 'BB' };
      await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, data: after }, update: { data: after } });
      await audit(tx, current, 'settings.rebranded', 'settings', '1', before, after);
    }
    await audit(tx, current, 'menu.expanded', 'menu_items', null, null, { productsCreated, demoPricing: true, source: source.source });
    return { productsCreated, milkTeaProducts: source.products.filter(item => item.category === 'Milk Tea').length, friesProducts: source.products.filter(item => item.category === 'Fries').length, burgerProducts: source.products.filter(item => item.category === 'Burgers').length, demoPricing: true, rebranded: rebrand };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts/expand-menu.js')) {
  try { const owner = await db.user.findFirst({ where: { role: 'OWNER', active: true, archivedAt: null }, orderBy: { createdAt: 'asc' } }); if (!owner) throw new Error('An active owner is required.'); console.log(JSON.stringify(await expandMenu(owner, { rebrand: process.argv.includes('--rebrand') }))); } finally { await db.$disconnect(); }
}
