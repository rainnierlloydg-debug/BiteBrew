import { renderMarkup } from '/assets/react-runtime.js';
import { api, operation, prepareImage } from '../api.js';
import { calculate, browserQuoteHash } from '../../shared/calculation.js';
import { activeUser, getDraft, saveDraft, listDrafts, deleteDraft, pauseDraft, syncDrafts } from '../offline-store.js';
import { scheduleSync } from '../pwa.js';
import { e, money, header, icon, picture, field, input, option, badge, label, empty, errorMessage, toast, debounce, modal, dateTime, table } from '../ui.js';

function quoteComparison(previous, current) {
  return `<p>Review prices, selections, discounts and charges before accepting this revised estimate.</p><div class="comparison"><div><small>Saved total</small><strong>${money(previous?.total)}</strong></div><div><small>Revised total</small><strong>${money(current.total)}</strong></div></div>${table([{ title: 'Item / variant', render: line => e(line.name + ' / ' + line.variantName) }, { title: 'Qty', key: 'quantity' }, { title: 'Saved unit', render: line => { const old = previous?.lines?.find(item => item.variantId === line.variantId); return old ? money(old.unitPrice) : 'New selection'; } }, { title: 'Revised unit', render: line => money(line.unitPrice) }], current.lines)}<div class="order-totals">${['subtotal', 'discount', 'tax', 'service', 'total'].map(key => `<div><span>${e(key)}</span><span>${money(previous?.[key])} → ${money(current[key])}</span></div>`).join('')}</div>`;
}

export async function render(ctx) {
  const cached = await ctx.cachedRequest('/catalog?pageSize=100', 'catalog');
  const products = cached.result.data, business = ctx.state.bootstrap.business, discounts = ctx.state.bootstrap.discounts || [];
  let customers = [];
  if (ctx.state.sessionConfirmed && navigator.onLine) try { customers = (await api('/customers?pageSize=100')).data; } catch (error) { if (error.status === 401) throw error; }
  let sourceDraft = ctx.params.draftId ? await getDraft(ctx.params.draftId) : null;
  if (sourceDraft && sourceDraft.userId !== ctx.state.user.id) throw new Error('This draft belongs to another account.');
  if (sourceDraft && ['SYNCING', 'QUEUED', 'SYNCED'].includes(sourceDraft.status)) throw new Error('Unqueue this draft first, or open its official order.');
  const editing = ctx.params.editId ? (await api('/orders/' + ctx.params.editId)).data : null;
  if (editing && editing.status !== 'PENDING' && !(editing.status === 'CONFIRMED' && ctx.state.user.role === 'OWNER' && ctx.params.reason)) throw new Error('Ordinary order editing is only available while Pending.');
  const saved = sourceDraft?.payload || {}, state = {
    id: sourceDraft?.id || crypto.randomUUID(), operationId: sourceDraft?.operationId || crypto.randomUUID(),
    type: editing?.type || saved.type || 'TAKEAWAY', customerId: editing?.customerId || saved.customerId || '', customerName: editing?.customerName || saved.customerName || '', contact: editing?.contact || saved.contact || '', tableNumber: editing?.tableNumber || saved.tableNumber || '', pickupAt: saved.pickupAt || editing?.pickupAt || '', instructions: editing?.instructions || saved.instructions || '', discountId: saved.discountId || editing?.pricingSnapshot.discountSnapshot?.id || '',
    cart: editing ? editing.items.map(item => ({ variantId: item.variantId, quantity: item.quantity, addons: item.addons.map(a => a.id), instructions: item.instructions || '' })) : structuredClone(saved.items || []), quote: null, error: null, estimated: cached.offline, revision: 0, busy: false,
  };
  function payload() { return { type: state.type, customerId: state.customerId || null, customerName: state.customerName || null, contact: state.contact || null, tableNumber: state.type === 'DINE_IN' ? state.tableNumber : null, pickupAt: state.type === 'PICKUP' && state.pickupAt ? new Date(state.pickupAt.includes('T') && !/[Z+]\d?/.test(state.pickupAt.slice(10)) ? state.pickupAt + '+08:00' : state.pickupAt).toISOString() : null, instructions: state.instructions, discountId: state.discountId || null, items: state.cart.map(line => ({ variantId: line.variantId, quantity: Number(line.quantity), addons: line.addons, instructions: line.instructions || '' })), ...(state.quote?.quoteHash ? { quoteHash: state.quote.quoteHash } : {}), ...(editing ? { version: editing.version, ...(ctx.params.reason ? { reason: ctx.params.reason } : {}) } : {}) }; }
  state.reviewBase = sourceDraft?.snapshot || null; state.approvedHash = sourceDraft?.payload?.quoteHash || null;
  const needsReview = () => Boolean(state.reviewBase && state.quote && state.approvedHash !== state.quote.quoteHash);
  const variantFor = id => { for (const product of products) { const variant = product.variants.find(item => item.id === id); if (variant) return { ...variant, product }; } return null; };
  async function estimatedQuote() {
    const items = state.cart.map(line => { const variant = variantFor(line.variantId); if (!variant?.active) throw new Error('A saved selection is unavailable. Remove or replace it before submission.'); return { ...line, name: variant.product.name, variantName: variant.name, basePrice: String(variant.price), addons: line.addons.map(id => { const addon = variant.addons.find(value => value.id === id && value.active); if (!addon) throw new Error('An add-on is no longer available. Review your selections.'); return addon; }) }; });
    const quote = calculate({ items, discount: discounts.find(item => item.id === state.discountId) || null, taxBps: business.taxBps || 0, serviceBps: business.serviceBps || 0 }); quote.quoteHash = await browserQuoteHash(quote); return quote;
  }
  async function persist(status = 'LOCAL') {
    if (editing || !state.cart.length) return null;
    const review = needsReview() || Boolean(state.reviewBase && !state.quote);
    const record = { id: state.id, userId: ctx.state.user.id, operationId: state.operationId, status: review ? 'NEEDS_REVIEW' : status, payload: { ...payload(), ...(review ? { quoteHash: state.approvedHash } : {}) }, snapshot: review ? state.reviewBase : state.quote, conflict: review && state.quote ? { quote: state.quote } : null, createdAt: sourceDraft?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0 };
    await saveDraft(record); if (status === 'LOCAL') ctx.setDirty(false); await ctx.updateSync(); return record;
  }
  const saveLater = debounce(() => { if (!state.busy && ctx.active()) persist().catch(error => toast(error.message, 'error')); }, 400);
  ctx.cleanup(() => saveLater.cancel());
  async function updateQuote() {
    const revision = ++state.revision; state.quote = null; state.error = null; renderFooter();
    if (!state.cart.length) return;
    try {
      let quote, estimated = cached.offline || !navigator.onLine || !ctx.state.sessionConfirmed;
      if (!estimated) { try { quote = (await api('/orders/quote', { method: 'POST', data: payload() })).data; } catch (error) { if (error.status !== 0) throw error; estimated = true; } }
      if (estimated) quote = await estimatedQuote();
      if (revision !== state.revision) return;
      state.quote = quote; state.estimated = estimated; state.error = null; renderFooter(); renderLineTotals(); saveLater();
    } catch (error) { if (revision === state.revision) { state.error = error; renderFooter(); saveLater(); } }
  }
  const quoteLater = debounce(updateQuote, 350);
  ctx.cleanup(() => quoteLater.cancel());
  const changed = () => { ctx.setDirty(true); state.quote = null; renderFooter(); quoteLater(); if (!editing) saveLater(); };
  renderMarkup(ctx.root, header(editing ? 'Edit ' + editing.number : 'New Order / POS', 'Choose your food and drinks, review the total, and submit when ready.', `<a class="button secondary mobile-cart-link" href="#current-order">${icon('orders')}View order</a><button class="secondary" data-drafts>Offline drafts</button>`, 'ORDER WORKSPACE') + ctx.snapshotNotice(cached.offline, cached.syncedAt) + `<div class="pos-layout"><section class="catalog"><div class="glass catalog-toolbar"><div class="search-input">${icon('search')}<input id="pos-search" aria-label="Search products" placeholder="Find pizza, burgers, milk tea, fries..."></div><select id="pos-category" aria-label="Category"><option value="">All categories</option>${ctx.state.bootstrap.categories.map(category => option(category.id, category.name, '')).join('')}</select></div><div class="section-title"><h2>Food & drinks</h2><span>${products.length} products</span></div><div id="product-grid" class="product-grid"></div></section><form id="current-order" class="glass order-panel"><div class="order-heading"><div class="section-title"><div><h2>${editing ? 'Edit order' : 'Current order'}</h2><small data-item-count></small></div>${icon('orders')}</div><div class="segmented">${['DINE_IN', 'TAKEAWAY', 'PICKUP'].map(type => `<button type="button" data-type="${type}" class="${state.type === type ? 'selected' : ''}">${label(type)}</button>`).join('')}</div></div><div class="order-scroll"><div id="customer-fields"></div><div class="section-title compact"><h3>Items</h3><button type="button" class="text-button" data-clear>Clear</button></div><div id="cart-lines"></div><details class="order-options"><summary>Discount & order notes</summary>${field('Discount', `<select name="discountId"><option value="">No discount</option>${ctx.state.user.role === 'OWNER' || business.allowCashierDiscounts ? discounts.filter(d => d.active).map(discount => option(discount.id, discount.name, state.discountId)).join('') : ''}</select>`)}${field('Order notes', `<textarea name="instructions" rows="2" maxlength="2000">${e(state.instructions)}</textarea>`)}</details></div><div id="order-footer" class="order-footer"></div></form></div>`);
  const form = ctx.root.querySelector('#current-order');
  function renderProducts() {
    const search = ctx.root.querySelector('#pos-search').value.toLowerCase(), categoryId = ctx.root.querySelector('#pos-category').value;
    const rows = products.filter(product => (!search || product.name.toLowerCase().includes(search)) && (!categoryId || product.categoryId === categoryId));
    renderMarkup(ctx.root.querySelector('#product-grid'), rows.length ? rows.map(product => `<article class="glass product-card">${picture(product)}<div class="product-content"><span class="eyebrow">${e(product.category?.name || 'Menu')}${product.demo ? ' · DEMONSTRATION' : ''}</span><h3>${e(product.name)}</h3>${product.description ? `<p>${e(product.description)}</p>` : ''}<div class="variants">${product.variants.filter(variant => variant.active).map(variant => `<div class="variant-row">${variant.name !== 'Menu price (size unspecified)' ? `<small>${e(variant.name)}</small>` : ''}<div><strong>${money(variant.price)}</strong><button type="button" data-add="${e(variant.id)}" aria-label="Add ${e(product.name)} ${e(variant.name)}">${icon('plus', 18)}<span>Add</span></button></div></div>`).join('')}</div></div></article>`).join('') : empty('No matching products', 'Try a different search or category.'));
    ctx.root.querySelectorAll('[data-add]').forEach(button => button.onclick = () => { state.cart.push({ variantId: button.dataset.add, quantity: 1, addons: [], instructions: '' }); renderCart(); changed(); });
  }
  function renderCustomer() {
    const pickup = state.pickupAt ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(state.pickupAt)).replace(' ', 'T') : '';
    renderMarkup(ctx.root.querySelector('#customer-fields'), `<div class="form-grid">${field(state.type === 'PICKUP' ? 'Customer name' : 'Customer name (optional)', input('customerName', state.customerName, `maxlength="120" ${state.type === 'PICKUP' ? 'required' : ''}`))}${field('Contact (optional)', input('contact', state.contact, 'type="tel" maxlength="40"'))}${state.type === 'DINE_IN' ? field('Table number', input('tableNumber', state.tableNumber, 'required maxlength="20"')) : ''}${state.type === 'PICKUP' ? field('Pickup time · Asia/Manila', input('pickupAt', pickup, 'type="datetime-local" required')) : ''}</div>${customers.length ? `<details class="repeat-customer"><summary>Link a customer record (optional)</summary><select name="customerId"><option value="">Walk-in / entered details</option>${customers.map(customer => option(customer.id, customer.name, state.customerId)).join('')}</select></details>` : ''}`);
  }
  function renderCart() {
    ctx.root.querySelector('[data-item-count]').textContent = state.cart.reduce((sum, line) => sum + Number(line.quantity), 0) + ' items · ' + (editing ? 'Unsaved changes' : 'Not Submitted');
    renderMarkup(ctx.root.querySelector('#cart-lines'), state.cart.length ? state.cart.map((line, index) => { const variant = variantFor(line.variantId); return `<article class="cart-line"><div class="section-title"><div><strong>${e(variant?.product.name || 'Unavailable selection')}</strong>${variant?.name !== 'Menu price (size unspecified)' ? `<small>${e(variant?.name || '')}</small>` : ''}</div><button type="button" class="icon-button secondary" data-remove="${index}" aria-label="Remove item">${icon('close', 16)}</button></div><div class="quantity-row"><label>Qty <input aria-label="Quantity for ${e(variant?.product.name || 'item')}" type="number" min="1" max="100" required value="${line.quantity}" data-quantity="${index}"></label><strong data-line-total="${index}"></strong></div>${variant?.addons.length ? `<details class="addon-picker"><summary>Add-ons <small>${line.addons.length} selected</small></summary><div class="addon-grid">${variant.addons.filter(addon => addon.active).map(addon => `<button type="button" aria-pressed="${line.addons.includes(addon.id)}" class="addon ${line.addons.includes(addon.id) ? 'selected' : ''}" data-addon="${e(addon.id)}" data-line="${index}"><span>${e(addon.name)}</span><strong>+${money(addon.price)}</strong></button>`).join('')}</div></details>` : ''}<input aria-label="Preparation instructions" placeholder="Preparation instructions (optional)" maxlength="500" value="${e(line.instructions)}" data-instructions="${index}"></article>`; }).join('') : empty('Your order starts here', 'Tap Add on a food or drink to start an order.'));
    ctx.root.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { state.cart.splice(Number(button.dataset.remove), 1); renderCart(); changed(); });
    ctx.root.querySelectorAll('[data-quantity]').forEach(element => element.onchange = () => { state.cart[Number(element.dataset.quantity)].quantity = Number(element.value); changed(); renderLineTotals(); });
    ctx.root.querySelectorAll('[data-instructions]').forEach(element => element.oninput = () => { state.cart[Number(element.dataset.instructions)].instructions = element.value; changed(); });
    ctx.root.querySelectorAll('[data-addon]').forEach(button => button.onclick = () => { const line = state.cart[Number(button.dataset.line)], id = button.dataset.addon; line.addons = line.addons.includes(id) ? line.addons.filter(value => value !== id) : [...line.addons, id]; const details = button.closest('details'); button.classList.toggle('selected', line.addons.includes(id)); button.setAttribute('aria-pressed', String(line.addons.includes(id))); details.querySelector('summary small').textContent = line.addons.length + ' selected'; changed(); });
    renderLineTotals();
  }
  function renderLineTotals() { ctx.root.querySelectorAll('[data-line-total]').forEach(element => { element.textContent = state.quote?.lines[Number(element.dataset.lineTotal)] ? money(state.quote.lines[Number(element.dataset.lineTotal)].subtotal) : '—'; }); }
  function renderFooter() {
    if (!ctx.active()) return;
    renderMarkup(ctx.root.querySelector('#order-footer'), `<div class="order-totals">${[['Subtotal', state.quote?.subtotal], ['Discount', state.quote?.discount], ['Charges', state.quote?.charges]].filter(([name, value]) => name === 'Subtotal' || Number(value) > 0).map(([name, value]) => `<div><span>${name}</span><strong>${value === undefined ? '—' : money(value)}</strong></div>`).join('')}<div class="grand-total"><strong>${state.estimated ? 'Estimated total' : 'Total'}</strong><strong>${state.quote ? money(state.quote.total) : '—'}</strong></div></div>${state.error ? errorMessage(state.error) : ''}<p class="small">${state.estimated ? 'Cached prices. The server must accept this draft before it becomes an official order.' : 'Saving creates an official Pending order. No payment is recorded here.'}</p><div class="actions"><button type="button" class="secondary" data-save-local ${editing || !state.cart.length || state.busy ? 'disabled' : ''}>Save draft</button><button type="submit" ${!state.quote || state.busy || !state.cart.length ? 'disabled' : ''}>${state.busy ? 'Submitting...' : editing ? 'Save changes' : state.estimated ? 'Queue draft' : 'Create order'}${icon('arrow', 16)}</button></div>`);
    if (needsReview()) {
      const review = document.createElement('button'); review.type = 'button'; review.className = 'secondary'; review.textContent = 'Review changed estimate';
      ctx.root.querySelector('#order-footer').prepend(review); ctx.root.querySelector('[type="submit"]').disabled = true;
      review.onclick = () => modal('Review draft changes', quoteComparison(state.reviewBase, state.quote) + '<button type="button" data-accept>Accept revised estimate</button>', (dialog, close) => { dialog.querySelector('[data-accept]').onclick = async () => { state.approvedHash = state.quote.quoteHash; state.reviewBase = structuredClone(state.quote); state.operationId = crypto.randomUUID(); await persist(); close(true); renderFooter(); }; });
    }
    ctx.root.querySelector('[data-save-local]').onclick = async () => { try { await persist(); toast('Local draft saved · Not Submitted.'); } catch (error) { toast(error.message, 'error'); } };
  }
  ctx.root.querySelector('[data-drafts]').onclick = () => ctx.go('drafts');
  ctx.root.querySelector('#pos-search').oninput = renderProducts; ctx.root.querySelector('#pos-category').onchange = renderProducts;
  ctx.root.querySelectorAll('[data-type]').forEach(button => button.onclick = () => { state.type = button.dataset.type; ctx.root.querySelectorAll('[data-type]').forEach(other => other.classList.toggle('selected', other === button)); renderCustomer(); changed(); });
  form.addEventListener('input', event => { const name = event.target.name; if (['customerName', 'contact', 'tableNumber', 'pickupAt', 'instructions'].includes(name)) { state[name] = event.target.value; changed(); } });
  form.addEventListener('change', event => { if (event.target.name === 'discountId') { state.discountId = event.target.value; changed(); } if (event.target.name === 'customerId') { state.customerId = event.target.value; const customer = customers.find(row => row.id === state.customerId); if (customer) { state.customerName = customer.name; state.contact = customer.contact || ''; } renderCustomer(); changed(); } });
  ctx.root.querySelector('[data-clear]').onclick = async () => { if (!state.cart.length || !confirm('Clear the current order draft?')) return; try { if (!editing) { await deleteDraft(ctx.state.user.id, state.id); state.id = crypto.randomUUID(); state.operationId = crypto.randomUUID(); } state.cart = []; state.quote = null; state.error = null; state.reviewBase = null; state.approvedHash = null; state.revision++; renderCart(); renderFooter(); ctx.setDirty(Boolean(editing)); ctx.updateSync(); } catch (error) { toast(error.message, 'error'); } };
  const submitEdit = operation();
  form.onsubmit = async event => {
    event.preventDefault(); if (!state.quote || state.busy || needsReview()) return; state.busy = true; renderFooter();
    try {
      if (editing) { ctx.requireOnline(); const result = await submitEdit('/orders/' + editing.id, payload(), 'PUT'); ctx.setDirty(false); ctx.go('orders'); await ctx.openOrder(result.id); return; }
      await persist('QUEUED'); ctx.setDirty(false); await scheduleSync();
      if (navigator.onLine && ctx.state.sessionConfirmed) await syncDrafts({ manual: true });
      const accepted = await getDraft(state.id);
      if (accepted?.status === 'SYNCED') { toast('Order ' + accepted.officialNumber + ' was accepted.'); ctx.go('orders'); await ctx.openOrder(accepted.officialId); }
      else { toast(accepted?.status === 'NEEDS_REVIEW' ? 'The draft needs review before acceptance.' : 'Draft queued · Not Submitted until server acceptance.'); ctx.go('drafts'); }
    } catch (error) { state.error = error; state.busy = false; renderFooter(); } finally { state.busy = false; }
  };
  ctx.beforeLeave(async () => { if (!editing && state.cart.length && !state.busy) { const existing = await getDraft(state.id); if (!existing || existing.status === 'LOCAL' || existing.status === 'NEEDS_REVIEW') await persist(); } });
  renderProducts(); renderCustomer(); renderCart(); renderFooter(); await updateQuote();
  const fit = () => { if (ctx.active()) form.style.setProperty('--order-top', Math.max(18, form.getBoundingClientRect().top) + 'px'); };
  fit(); ctx.listen('resize', fit); ctx.listen('scroll', fit); const observer = new ResizeObserver(fit); observer.observe(ctx.root); ctx.cleanup(() => observer.disconnect());
}

export async function renderDrafts(ctx) {
  const drafts = await listDrafts(ctx.state.user.id);
  renderMarkup(ctx.root, header('Offline drafts', 'Local drafts are not official orders until the server confirms acceptance.', `<button class="secondary" data-sync>${icon('refresh')}Sync Now</button><button data-new>${icon('plus')}New draft</button>`, 'LOCAL & BACKGROUND SYNC') + `<div class="notice">Drafts are private to this account on this device. Authentication, payments, refunds, official statuses and chat delivery are online-only.</div><section class="glass panel">${table([{ title: 'Draft / official order', render: draft => `<strong>${e(draft.officialNumber || 'Draft ' + draft.id.slice(0, 8))}</strong><small>${draft.status === 'SYNCED' ? 'Accepted by server' : 'Not Submitted'} · ${dateTime(draft.updatedAt)}</small>${draft.error ? `<small class="danger-text">${e(draft.error)}</small>` : ''}` }, { title: 'State', render: draft => badge(draft.status) }, { title: 'Total', numeric: true, render: draft => money(draft.total || draft.snapshot?.total || 0) }, { title: 'Actions', render: draft => `<div class="actions wrap">${['LOCAL', 'NEEDS_REVIEW'].includes(draft.status) ? `<button class="secondary" data-edit="${e(draft.id)}">Edit</button><button data-queue="${e(draft.id)}">${draft.conflict?.quote ? 'Review changes' : 'Queue'}</button>` : ''}${draft.status === 'QUEUED' ? `<button class="secondary" data-pause="${e(draft.id)}">Unqueue</button>` : ''}${draft.status === 'SYNCED' ? `<button class="secondary" data-open="${e(draft.officialId)}">View order</button>` : ''}${!['SYNCING', 'QUEUED'].includes(draft.status) ? `<button class="text-button danger" data-delete="${e(draft.id)}">Delete local copy</button>` : ''}</div>` }], drafts, 'No local drafts')}</section>`);
  ctx.root.querySelector('[data-new]').onclick = () => ctx.go('pos');
  ctx.root.querySelector('[data-sync]').onclick = async () => { try { if (!navigator.onLine) throw new Error('Reconnect to submit queued drafts.'); const result = await syncDrafts({ manual: true }); if (result.paused) toast('Sign in to resume synchronization.', 'error'); await ctx.updateSync(); ctx.refresh(); } catch (error) { toast(error.message, 'error'); } };
  ctx.root.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => ctx.go('pos', { draftId: button.dataset.edit }));
  ctx.root.querySelectorAll('[data-open]').forEach(button => button.onclick = () => ctx.openOrder(button.dataset.open));
  ctx.root.querySelectorAll('[data-pause]').forEach(button => button.onclick = async () => { try { await pauseDraft(ctx.state.user.id, button.dataset.pause); ctx.refresh(); ctx.updateSync(); } catch (error) { toast(error.message, 'error'); } });
  ctx.root.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (!confirm('Delete this local copy? Unsynchronized work will be lost. Official server records are preserved.')) return; await deleteDraft(ctx.state.user.id, button.dataset.delete); ctx.updateSync(); ctx.refresh(); });
  ctx.root.querySelectorAll('[data-queue]').forEach(button => button.onclick = async () => {
    const draft = await getDraft(button.dataset.queue);
    if (draft.conflict?.quote) {
      const quote = draft.conflict.quote;
      modal('Review changed prices', `<p>The server did not accept this draft. Review the revised totals before deciding.</p><div class="comparison"><div><small>Saved estimate</small><strong>${money(draft.snapshot?.total)}</strong></div><div><small>Current server total</small><strong>${money(quote.total)}</strong></div></div>${table([{ title: 'Item', key: 'name' }, { title: 'Quantity', key: 'quantity' }, { title: 'Current unit price', numeric: true, render: line => money(line.unitPrice) }], quote.lines)}<p class="notice">Accepting this quote explicitly updates the draft. It remains Not Submitted until server acceptance.</p><button data-accept>Accept revised quote & queue</button>`, (dialog, close) => { dialog.querySelector('[data-accept]').onclick = async () => { await saveDraft({ ...draft, operationId: crypto.randomUUID(), payload: { ...draft.payload, quoteHash: quote.quoteHash }, snapshot: quote, conflict: null, error: null, status: 'QUEUED', attempts: 0, nextAttemptAt: 0 }); close(true); await scheduleSync(); ctx.refresh(); ctx.updateSync(); }; });
    } else {
      if (!draft.payload?.quoteHash) { toast('Open the draft and review its estimate first.', 'error'); return; }
      await saveDraft({ ...draft, status: 'QUEUED', error: null, attempts: 0, nextAttemptAt: 0 }); await scheduleSync(); ctx.refresh(); ctx.updateSync();
    }
  });
  ctx.listen('draft-sync', () => { if (!document.querySelector('dialog[open]')) ctx.refresh(); });
}
