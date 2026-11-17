import { e, money, dateTime, label, badge, modal, icon } from './ui.js';

const hidden = key => key === 'id' || /(?:Id|_id)$/.test(key) || /^(password.*|.*secret.*|.*token.*|authVersion|version|subscription|endpoint|endpointKey|p256dh|auth|keys|createdAt|updatedAt|history|businessSnapshot|pricingSnapshot)$/i.test(key);
const amounts = /^(price|basePrice|unitPrice|subtotal|total|paid|balance|refunded|refund|amount|discount|charges|tax|service|tendered|change|collections)$/i;
const names = { number: 'Order number', customerName: 'Customer', createdByName: 'Created by', variantName: 'Option / size', pickupAt: 'Pickup time', tableNumber: 'Table number', archivedAt: 'Archived on', removedAt: 'Removed on', taxBps: 'Tax rate', serviceBps: 'Service charge', allowCashierDiscounts: 'Cashier discounts allowed', paymentMethods: 'Payment methods' };
const title = key => names[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').replace(/^./, value => value.toUpperCase());
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameField = (path, a, b) => {
  if (a == null && b == null) return true;
  if (amounts.test(path.split('.').at(-1)) && /^-?\d+(\.\d+)?$/.test(String(a)) && /^-?\d+(\.\d+)?$/.test(String(b))) return Number(a) === Number(b);
  return equal(a, b);
};

function flatten(value, prefix = '', result = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (hidden(key) || (!prefix && key === 'items')) continue;
      flatten(child, prefix ? prefix + '.' + key : key, result);
    }
  } else result.set(prefix || 'value', value);
  return result;
}

function valueView(value, key) {
  if (value === undefined) return '<span class="muted">Not recorded</span>';
  if (value === null || value === '') return '<span class="muted">Not set</span>';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? `<ul class="audit-values">${value.map(item => `<li>${valueView(item, key)}</li>`).join('')}</ul>` : '<span class="muted">None</span>';
  if (typeof value === 'object') return `<dl class="audit-nested">${Object.entries(value).filter(([name]) => !hidden(name)).map(([name, content]) => `<div><dt>${e(title(name))}</dt><dd>${valueView(content, name)}</dd></div>`).join('')}</dl>`;
  if (amounts.test(key) && /^-?\d+(\.\d+)?$/.test(String(value))) return e(money(value));
  if (['taxBps', 'serviceBps'].includes(key)) return e(Number(value) / 100) + '%';
  if (/At$/.test(key) && Number.isFinite(Date.parse(value))) return e(dateTime(value));
  if (/status$/i.test(key)) return badge(value);
  return e(/^[A-Z][A-Z_]+$/.test(String(value)) && value !== 'PHP' ? label(value) : value);
}

function itemCards(items) {
  if (!Array.isArray(items)) return '<p class="audit-empty">Item details were not recorded for this version.</p>';
  if (!items?.length) return '<p class="audit-empty">No items in this version.</p>';
  return `<div class="audit-items">${items.map(item => `<article class="audit-item"><div class="audit-item-heading"><div><strong>${e(item.name || 'Order item')}</strong>${item.variantName ? `<small>${e(item.variantName)}</small>` : ''}</div><span class="audit-quantity">Qty ${e(item.quantity ?? 1)}</span></div><div class="audit-item-prices"><span>Unit price <strong>${valueView(item.unitPrice ?? item.basePrice, 'unitPrice')}</strong></span><span>Line total <strong>${valueView(item.subtotal, 'subtotal')}</strong></span></div>${item.addons?.length ? `<p class="audit-item-notes"><strong>Add-ons:</strong> ${item.addons.map(addon => e(addon.name || addon)).join(', ')}</p>` : ''}${item.instructions ? `<p class="audit-item-notes"><strong>Instructions:</strong> ${e(item.instructions)}</p>` : ''}</article>`).join('')}</div>`;
}

export function auditView(row) {
  const created = row.before == null && row.after != null;
  const removed = row.after == null && row.before != null;
  const old = flatten(row.before || {}), current = flatten(row.after || {});
  const fields = [...new Set([...old.keys(), ...current.keys()])].filter(key => {
    if (!created && !removed) return !sameField(key, old.get(key), current.get(key));
    const value = (created ? current : old).get(key);
    return value != null && value !== '' && (!Array.isArray(value) || value.length);
  });
  const recordCreated = created && /\.(?:created|demonstration_created)$/.test(row.action || '');
  const actionOnly = row.before == null && row.after == null;
  const kind = recordCreated ? 'Record created' : removed ? 'Previous record values' : created || actionOnly ? 'Action recorded' : 'Record updated';
  const explanation = recordCreated ? 'This is a new record. There is no previous version to compare.' : created ? 'These details were recorded for this action. No previous values were captured.' : removed ? 'The previous values are shown below.' : actionOnly ? 'This entry records an action rather than a field change.' : 'Only fields that changed are shown below.';
  const changing = !created && !removed;
  const fieldRows = fields.map(path => {
    const parts = path.split('.'), key = parts.at(-1);
    return `<div class="audit-field"><dt>${e(parts.map(title).join(' / '))}</dt>${changing ? `<dd class="audit-old"><span class="audit-value-label">Before</span>${valueView(old.get(path), key)}</dd>` : ''}<dd><span class="audit-value-label">${changing ? 'After' : 'Value'}</span>${valueView((removed ? old : current).get(path), key)}</dd></div>`;
  }).join('');
  const oldItems = row.before?.items ?? row.before?.pricingSnapshot?.lines, items = row.after?.items ?? row.after?.pricingSnapshot?.lines;
  const hasItems = Array.isArray(oldItems) || Array.isArray(items);
  const comparable = values => values?.map(item => ({ name: item.name, variantName: item.variantName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice ?? item.basePrice), subtotal: Number(item.subtotal), addons: item.addons?.map(addon => ({ name: addon.name, price: Number(addon.price) })) || [], instructions: item.instructions || '' }));
  const itemsChanged = !equal(comparable(oldItems), comparable(items));
  return `<section class="audit-view"><div class="audit-event"><span class="audit-event-icon">${icon('orders', 23)}</span><div><h3>${e(title(row.action || 'Audit event'))}</h3><p>${e(row.actor?.name || 'Staff member')} · ${e(dateTime(row.createdAt))}</p></div></div><div class="audit-explanation"><strong>${kind}</strong><p>${explanation}</p></div>${fields.length ? `<div class="audit-field-panel ${changing ? 'audit-comparison' : 'audit-snapshot'}">${changing ? '<div class="audit-field audit-column-headings"><span>Field</span><span>Before</span><span>After</span></div>' : ''}<dl>${fieldRows}</dl></div>` : '<p class="audit-empty">No field values changed. This entry records an action on the record.</p>'}${hasItems && itemsChanged ? `<section class="audit-item-section"><h3>Order items</h3>${changing ? `<div class="audit-item-versions"><div><h4>Before</h4>${itemCards(oldItems)}</div><div><h4>After</h4>${itemCards(items)}</div></div>` : itemCards(removed ? oldItems : items)}</section>` : ''}</section>`;
}

export function openAudit(row) {
  if (!row) return;
  modal('Audit changes', auditView(row), dialog => dialog.classList.add('audit-modal'));
}
