import { z } from 'zod';
import { db } from '../db.js';
import { atomic, audit } from '../lib/atomic.js';
import { authorize } from '../lib/permissions.js';
import { BRAND } from '../../public/shared/brand.js';
export const defaults = {
  name: BRAND.name, systemName: BRAND.systemName,
  address: 'Poblacion 1, Victoria, Oriental Mindoro', contact: '0985 986 4399', hours: '7:00 AM–8:00 PM',
  facebook: 'https://www.facebook.com/share/1F1nJVSJQG/?mibextid=wwXIfr',
  logo: null, footer: "Thank you for choosing Bite & Brew!", orderPrefix: 'BB', preparationMinutes: 20,
  paymentMethods: ['CASH', 'GCASH'], allowCashierDiscounts: false, taxBps: 0, serviceBps: 0,
  currency: 'PHP', timezone: 'Asia/Manila',
};
export async function settings(tx = db) { return { ...defaults, ...(await tx.setting.findUnique({ where: { id: 1 } }))?.data }; }
const schema = z.object({
  name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(255), contact: z.string().trim().min(1).max(40),
  hours: z.string().trim().min(1).max(120), facebook: z.url().startsWith('https://').max(500),
  logo: z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/).nullable(), footer: z.string().trim().min(1).max(500),
  orderPrefix: z.string().regex(/^[A-Za-z0-9]{1,10}$/), preparationMinutes: z.number().int().min(1).max(240),
  paymentMethods: z.array(z.enum(['CASH', 'GCASH'])).min(1).max(2).refine(values => new Set(values).size === values.length),
  allowCashierDiscounts: z.boolean(), taxBps: z.number().int().min(0).max(10000), serviceBps: z.number().int().min(0).max(10000),
}).strict();
export async function saveSettings(actor, key, input) {
  authorize(actor, 'settings');
  const data = schema.parse(input);
  return atomic(actor, key, 'settings.save', data, async (tx, current) => {
    const before = await settings(tx), after = { ...before, ...data };
    await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, data: after }, update: { data: after } });
    await audit(tx, current, 'settings.updated', 'settings', '1', before, after);
    return after;
  });
}
