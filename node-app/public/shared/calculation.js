export function cents(value) {
  const text = String(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new Error('Use a non-negative amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const decimal = value => (Number(value) / 100).toFixed(2);
export const rate = (amount, basisPoints) => Math.floor((amount * basisPoints + 5000) / 10000);
export function calculate({ items, discount = null, taxBps = 0, serviceBps = 0 }) {
  const lines = items.map(item => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new Error('Quantity must be between 1 and 100.');
    const addons = [...item.addons].sort((a, b) => a.id.localeCompare(b.id)).map(a => ({ id: a.id, name: a.name, price: decimal(cents(a.price)) }));
    const unit = cents(item.basePrice) + addons.reduce((sum, a) => sum + cents(a.price), 0);
    return { variantId: item.variantId, name: item.name, variantName: item.variantName, quantity: item.quantity, basePrice: decimal(cents(item.basePrice)), unitPrice: decimal(unit), subtotal: decimal(unit * item.quantity), addons, instructions: item.instructions || '' };
  });
  const subtotal = lines.reduce((sum, line) => sum + cents(line.subtotal), 0);
  const discountValue = discount ? Math.min(subtotal, discount.kind === 'PERCENT' ? rate(subtotal, cents(discount.value)) : cents(discount.value)) : 0;
  const discounted = subtotal - discountValue;
  const tax = rate(discounted, taxBps), service = rate(discounted, serviceBps);
  if (discounted + tax + service > 9999999999) throw new Error('The order exceeds the supported amount.');
  return { lines, subtotal: decimal(subtotal), discount: decimal(discountValue), tax: decimal(tax), service: decimal(service), charges: decimal(tax + service), total: decimal(discounted + tax + service), discountSnapshot: discount ? { id: discount.id, name: discount.name, kind: discount.kind, value: String(discount.value) } : null, taxBps, serviceBps };
}
export function quoteMaterial(quote) {
  return JSON.stringify({ lines: quote.lines.map(({ instructions, ...line }) => line), subtotal: quote.subtotal, discount: quote.discount, tax: quote.tax, service: quote.service, total: quote.total, discountSnapshot: quote.discountSnapshot, taxBps: quote.taxBps, serviceBps: quote.serviceBps });
}
export async function browserQuoteHash(quote) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(quoteMaterial(quote))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
