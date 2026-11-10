import { renderMarkup } from '/assets/react-runtime.js';
export const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
export const dateTime = value => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const label = value => ({ DINE_IN: 'Dine-In', TAKEAWAY: 'Takeaway', PICKUP: 'Pickup', GCASH: 'GCash', CASH: 'Cash', OWNER: 'Owner', CASHIER: 'Cashier', KITCHEN: 'Kitchen staff', LOCAL: 'Local Draft', QUEUED: 'Queued', SYNCING: 'Syncing', SYNCED: 'Synced', NEEDS_REVIEW: 'Needs Review' })[value] || String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const paths = {
  drink: '<path d="M6 8h12l-2 13H8L6 8ZM5 5h14M14 2l-2 7"/><circle cx="10" cy="17" r=".7"/><circle cx="14" cy="17" r=".7"/>',
  fries: '<path d="M5 10h14l-2 11H7L5 10ZM7 10V4M11 10V2M15 10V3M18 10V5"/>',
  burger: '<path d="M3 10a9 7 0 0 1 18 0H3ZM3 14h18M4 18h16l-1 3H5l-1-3Z"/><path d="M8 7h.01M12 5h.01M16 7h.01"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  pizza: '<path d="M12 3 3 20c6 2 12 2 18-2L12 3Z"/><path d="M5 16c5 2 9 2 14-1"/><circle cx="11" cy="10" r="1"/><circle cx="14" cy="14" r="1"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h6"/>',
  kitchen: '<path d="M4 13a8 8 0 0 1 16 0M3 17h18M5 20h14M12 3v2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h18M16 12h5v5h-5z"/>',
  chart: '<path d="M4 3v18h18M8 16v-5M13 16V7M18 16v-9"/>',
  chat: '<path d="M21 14a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z"/><path d="M7 8h10M7 12h6"/>',
  bell: '<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4ZM10 21h4"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M9 12h6"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', check: '<path d="m5 12 4 4L19 6"/>', logout: '<path d="M9 4H4v16h5M10 12h11m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', leaf: '<path d="M20 3C5 2 2 10 7 16c7 5 14-2 13-13ZM4 21 16 8"/>', refresh: '<path d="M20 7a8 8 0 1 0 1 8M20 3v5h-5"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>', wifi: '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01"/>',
};
export const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.orders}</svg>`;
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
export function picture(product) {
  if (!product.image) return `<div class="product-image placeholder">${icon(product.category?.name === 'Milk Tea' ? 'drink' : product.category?.name === 'Fries' ? 'fries' : product.category?.name === 'Burgers' ? 'burger' : 'pizza', 52)}</div>`;
  const frame = product.imageFrame;
  if (!frame) return `<div class="product-image"><img src="${e(product.image)}" alt="${e(product.name)}" loading="lazy" decoding="async"></div>`;
  if (!['x', 'y', 'width', 'height', 'source_width', 'source_height'].every(key => Number.isFinite(frame[key])) || !frame.width || !frame.height) return `<div class="product-image"><img src="${e(product.image)}" alt="${e(product.name)}" loading="lazy"></div>`;
  return `<div class="product-image fitted-frame"><svg viewBox="0 0 ${frame.width} ${frame.height}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${e(product.name)}"><svg width="${frame.width}" height="${frame.height}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" overflow="hidden"><image href="${e(product.image)}" width="${frame.source_width}" height="${frame.source_height}"/></svg></svg></div>`;
}
