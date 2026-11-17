import { brandText } from '../shared/brand.js';
import { fontAwesomeIcon as icon } from '../shared/fontawesome-icons.js';
export { icon };
import { renderMarkup } from '/assets/react-runtime.js';
export const e = value => String(brandText(value) ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
export const dateTime = value => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const label = value => ({ DINE_IN: 'Dine-In', TAKEAWAY: 'Takeaway', PICKUP: 'Pickup', GCASH: 'GCash', CASH: 'Cash', OWNER: 'Owner', CASHIER: 'Cashier', KITCHEN: 'Kitchen staff', LOCAL: 'Local Draft', QUEUED: 'Queued', SYNCING: 'Syncing', SYNCED: 'Synced', NEEDS_REVIEW: 'Needs Review' })[value] || String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
export const badge = value => `<span class="badge badge-${String(value).toLowerCase().replace(/[^a-z_]/g, '')}">${e(label(value))}</span>`;
export const header = (title, description, actions = '', eyebrow = 'YOUR STAFF WORKSPACE') => `<header class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="actions">${actions}</div></header>`;
export const empty = (title, text = '') => `<div class="empty">${icon('leaf', 32)}<h3>${e(title)}</h3><p>${e(text)}</p></div>`;
export const field = (title, input, hint = '') => `<label class="field"><span>${e(title)}</span>${input}${hint ? `<small>${e(hint)}</small>` : ''}</label>`;
export const input = (name, value = '', attrs = '') => `<input name="${e(name)}" value="${e(value)}" ${attrs}>`;
export const option = (id, title, selected) => `<option value="${e(id)}" ${id === selected ? 'selected' : ''}>${e(title)}</option>`;
export function pager(meta) { return !meta || meta.lastPage <= 1 ? '' : `<div class="pager"><span>${meta.total} records · Page ${meta.page} of ${meta.lastPage}</span><button class="secondary" data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>Previous</button><button class="secondary" data-page="${meta.page + 1}" ${meta.page >= meta.lastPage ? 'disabled' : ''}>Next</button></div>`; }
export function table(columns, rows, emptyTitle = 'No records yet') {
  return !rows.length ? empty(emptyTitle, 'Try changing the filters or add a record to get started.') : `<div class="table-wrap" tabindex="0" aria-label="Scrollable records table"><table><thead><tr>${columns.map(column => `<th${column.numeric ? ' class="numeric"' : ''}>${e(column.title)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td${column.numeric ? ' class="numeric"' : ''}>${column.render ? column.render(row) : e(row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function errorMessage(error) { return `<div class="notice error" role="alert"><strong>${e(error.message || error)}</strong>${Array.isArray(error.details) ? `<ul>${error.details.map(detail => `<li>${e(detail.field)}: ${e(detail.message)}</li>`).join('')}</ul>` : ''}</div>`; }
export function toast(message, type = 'info') { const element = document.createElement('div'); element.className = 'toast ' + type; element.textContent = message; document.querySelector('#toasts').append(element); setTimeout(() => element.remove(), 6000); }
export function modal(title, body, ready) {
  const dialog = document.createElement('dialog'); dialog.className = 'glass modal';
  renderMarkup(dialog, `<div class="modal-heading"><h2>${e(title)}</h2><button class="icon-button secondary" data-close aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>`);
  document.body.append(dialog); let dirty = false, force = false;
  const close = (saved = false) => { if (!saved && dirty && !confirm('Discard unsaved changes?')) return; force = true; dialog.close(); };
  dialog.markDirty = () => { dirty = true; dialog.dataset.dirty = 'true'; };
  dialog.addEventListener('input', dialog.markDirty);
  dialog.addEventListener('change', dialog.markDirty);
  dialog.addEventListener('cancel', event => { if (!force && dirty && !confirm('Discard unsaved changes?')) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('[data-close]').addEventListener('click', () => close());
  dialog.showModal(); ready?.(dialog, close); return dialog;
}
export const formValues = form => Object.fromEntries(new FormData(form));
export function bindPager(root, change) { root.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => change(Number(button.dataset.page)))); }
export function debounce(fn, delay = 300) { let timer; const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; debounced.cancel = () => clearTimeout(timer); return debounced; }
export function picture(product, { fit = 'cover' } = {}) {
  if (!product.image) return `<div class="product-image placeholder">${icon(product.category?.name === 'Milk Tea' ? 'drink' : product.category?.name === 'Fries' ? 'fries' : product.category?.name === 'Burgers' ? 'burger' : 'pizza', 52)}</div>`;
  const frame = product.imageFrame;
  if (!frame) return `<div class="product-image"><img src="${e(product.image)}" alt="${e(product.name)}" loading="lazy" decoding="async"></div>`;
  if (!['x', 'y', 'width', 'height', 'source_width', 'source_height'].every(key => Number.isFinite(frame[key])) || !frame.width || !frame.height) return `<div class="product-image"><img src="${e(product.image)}" alt="${e(product.name)}" loading="lazy"></div>`;
  return `<div class="product-image fitted-frame"><svg viewBox="0 0 ${frame.width} ${frame.height}" preserveAspectRatio="xMidYMid ${fit === 'contain' ? 'meet' : 'slice'}" role="img" aria-label="${e(product.name)}"><svg width="${frame.width}" height="${frame.height}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" overflow="hidden"><image href="${e(product.image)}" width="${frame.source_width}" height="${frame.source_height}"/></svg></svg></div>`;
}
