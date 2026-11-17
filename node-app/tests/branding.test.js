import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, brandText, brandBusiness } from '../public/shared/brand.js';
import { settings } from '../server/services/settings.js';
import { orderView } from '../server/services/orders.js';

const formerName = 'Ella\u2019s Pizza';
const formerProduct = 'Ella\u2019s Best';

test('saved business branding is updated without changing contact or financial settings', async () => {
  const original = { name: formerName, footer: `Thank you for choosing ${formerName}!`, logo: '/uploads/old-logo.png', orderPrefix: 'EP', contact: 'fixture contact', taxBps: 1200 };
  const business = await settings({ setting: { findUnique: async () => ({ data: original }) } });
  assert.equal(business.name, BRAND.name);
  assert.equal(business.footer, 'Thank you for choosing Bite & Brew!');
  assert.equal(business.orderPrefix, 'BB');
  assert.equal(business.logo, null);
  assert.equal(business.contact, original.contact);
  assert.equal(business.taxBps, original.taxBps);
  assert.equal(original.name, formerName);
  assert.deepEqual(brandBusiness(business), business);
});

test('historical receipts use current branding without rewriting stored snapshots or totals', async () => {
  const stored = { id: 'order', number: 'EP-HISTORICAL', businessSnapshot: { name: formerName, footer: formerName }, items: [{ name: formerProduct, quantity: 1, addons: [] }], total: '170.00', paid: '100.00', history: [], confirmedAt: new Date() };
  const tx = { order: { findUnique: async () => structuredClone(stored) } };
  const owner = await orderView(tx, 'order', { role: 'OWNER' });
  assert.equal(owner.businessSnapshot.name, BRAND.name);
  assert.equal(owner.items[0].name, 'Bite & Brew Special');
  assert.equal(owner.number, stored.number);
  assert.equal(owner.total, '170.00');
  assert.equal(owner.balance, '70.00');
  const kitchen = await orderView(tx, 'order', { role: 'KITCHEN' });
  assert.equal(kitchen.businessName, BRAND.name);
  assert.equal(kitchen.items[0].name, 'Bite & Brew Special');
  assert.equal(kitchen.total, undefined);
  assert.equal(kitchen.businessSnapshot, undefined);
  assert.equal(stored.businessSnapshot.name, formerName);
  assert.equal(stored.items[0].name, formerProduct);
});

test('branding handles apostrophe variants while preserving unrelated content', () => {
  for (const name of [formerName, "Ella's Pizza", 'ELLAS PIZZA']) assert.equal(brandText(name), BRAND.name);
  assert.equal(brandText(formerProduct), 'Bite & Brew Special');
  assert.equal(brandText('Mozzarella Pizza'), 'Mozzarella Pizza');
  assert.equal(brandText(null), null);
  assert.equal(brandBusiness({ name: BRAND.name, logo: '/uploads/new-logo.png' }).logo, '/uploads/new-logo.png');
});
