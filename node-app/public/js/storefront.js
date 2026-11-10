import { renderMarkup } from '/assets/react-runtime.js';
import { api, setAccount } from './api.js';
import { e, money, picture } from './ui.js';
import { cents, decimal } from '../shared/calculation.js';

const CART = 'bite-brew-public-cart-v1', PENDING = 'bite-brew-checkout-v1';
export function productPicture(product) {
  return picture(product);
}
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
const lineKey = line => line.variantId + ':' + (line.addons || []).map(addon => typeof addon === 'string' ? addon : addon.id).sort().join(',');
const addonSummary = line => (line.addons || []).length ? `<small class="cart-addon-summary">Add-ons: ${line.addons.map(addon => `${e(addon.name)} (+${money(addon.price)})`).join(', ')}</small>` : '';
export function addProductToCart(product, variant, quantity = 1, addons = []) {
  if (!variant?.id || !/^[a-f0-9-]{36}$/i.test(variant.id)) throw new Error('This product cannot be added right now. Refresh the page and try again.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Choose a quantity between 1 and 100.');
  const selected = [...new Set(addons.map(addon => addon.id))].map(id => {
    const addon = variant.addons?.find(item => item.id === id);
    if (!addon || !uuid(addon.id)) throw new Error('Choose an available add-on.');
    return { id: addon.id, name: addon.name, price: String(addon.price) };
  });
  const price = decimal(cents(variant.price) + selected.reduce((sum, addon) => sum + cents(addon.price), 0));
  const lines = readCart(), existing = lines.find(line => lineKey(line) === lineKey({ variantId: variant.id, addons: selected }));
  if ((existing?.quantity || 0) + quantity > 100) throw new Error('You can add up to 100 of each option.');
  if (lines.length >= 100 && !existing) throw new Error('Your cart can hold up to 100 different options.');
  if (existing) { existing.quantity += quantity; existing.price = price; existing.addons = selected; }
  else lines.push({ variantId: variant.id, name: product.name, variantName: variant.name, quantity, price, addons: selected });
  writeCart(lines);
}
let storageError = '';
function readCart() {
  try {
    const data = JSON.parse(localStorage.getItem(CART) || '[]');
    if (!Array.isArray(data)) return [];
    return data.slice(0, 100).filter(line => typeof line.variantId === 'string' && /^[a-f0-9-]{36}$/i.test(line.variantId) && typeof line.name === 'string' && typeof line.variantName === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 100 && /^\d{1,8}(\.\d{1,2})?$/.test(String(line.price))).map(line => ({ variantId: line.variantId, name: line.name.slice(0, 120), variantName: line.variantName.slice(0, 80), quantity: line.quantity, price: String(line.price), addons: (Array.isArray(line.addons) ? line.addons : []).slice(0, 20).filter(addon => uuid(addon.id) && typeof addon.name === 'string' && /^\d{1,8}(\.\d{1,2})?$/.test(String(addon.price))).map(addon => ({ id: addon.id, name: addon.name.slice(0, 100), price: String(addon.price) })) }));
  } catch { return []; }
}
function writeCart(lines) {
  try { localStorage.setItem(CART, JSON.stringify(lines)); storageError = ''; }
  catch { storageError = 'Your browser could not save the cart. Enable browser storage and try again.'; throw new Error(storageError); }
  updateCartCount();
}
function updateCartCount() {
  const count = readCart().reduce((sum, line) => sum + line.quantity, 0);
  document.querySelectorAll('[data-cart-count]').forEach(node => { node.textContent = count; });
  document.querySelectorAll('[data-cart]').forEach(node => { node.setAttribute('aria-label', `Open cart, ${count} ${count === 1 ? 'item' : 'items'}`); });
}
function dialog(title, body) {
  const node = document.createElement('dialog'); node.className = 'shop-dialog';
  node.setAttribute('aria-labelledby', 'shop-dialog-title');
  renderMarkup(node, `<div class="shop-dialog-heading"><h2 id="shop-dialog-title">${e(title)}</h2><button class="shop-close" type="button" aria-label="Close dialog">&#215;</button></div><div class="shop-dialog-body">${body}</div>`);
  const previous = document.activeElement;
  node.querySelector('.shop-close').onclick = () => node.close();
  node.addEventListener('close', () => { node.remove(); if (previous?.isConnected) previous.focus(); });
  document.body.append(node); node.showModal(); return node;
}
function showError(node, error) { node.querySelector('[data-shop-error]').textContent = error.message; }
const lineSummary = lines => `<ul class="shop-lines">${lines.map(line => `<li><div><strong>${e(line.name)}</strong><small>${e(line.variantName)} &times; ${line.quantity}</small>${addonSummary(line)}</div><b>${money(decimal(cents(line.price) * line.quantity))}</b></li>`).join('')}</ul>`;

export function productDetails(product) {
  const usable = product.variants.length > 0 && product.variants.every(variant => typeof variant.id === 'string' && /^[a-f0-9-]{36}$/i.test(variant.id));
  const optionLabel = variant => (variant.name === 'Menu price (size unspecified)' ? 'Menu price' : variant.name) + ' - ' + money(variant.price);
  const optionControl = product.variants.length === 1
    ? `<input type="hidden" name="variant" value="0"><input aria-label="Selected option" value="${e(optionLabel(product.variants[0]))}" readonly>`
    : `<select name="variant" required>${product.variants.map((variant, index) => `<option value="${index}">${e(optionLabel(variant))}</option>`).join('')}</select>`;
  const node = dialog(product.name, `${productPicture(product)}<p>${e(product.description || '')}</p>${product.demo ? '<p class="shop-note">Demonstration product: sample price and artwork.</p>' : ''}<form class="shop-form"> <label>Option${optionControl}</label><label>Quantity<input name="quantity" type="number" min="1" max="100" value="1" required></label><p data-shop-error role="alert">${product.variants.length && !usable ? 'This product cannot be added right now. Refresh the page and try again.' : ''}</p><button class="button" ${usable ? '' : 'disabled'}>${product.variants.length ? 'Add to cart' : 'Currently unavailable'}</button></form>`);
  const form = node.querySelector('form');
  const addonPicker = document.createElement('fieldset'); addonPicker.className = 'shop-addon-picker';
  form.querySelector('[name="quantity"]').closest('label').before(addonPicker);
  const estimate = document.createElement('p'); estimate.className = 'shop-note';
  form.querySelector('[data-shop-error]').before(estimate);
  function updateEstimate() {
    const variant = product.variants[Number(form.elements.variant.value)];
    const selected = [...addonPicker.querySelectorAll('input:checked')].map(input => variant?.addons?.find(addon => addon.id === input.value)).filter(Boolean);
    const unit = variant ? cents(variant.price) + selected.reduce((sum, addon) => sum + cents(addon.price), 0) : 0;
    estimate.textContent = 'Estimated total: ' + money(decimal(unit * Math.max(1, Number(form.elements.quantity.value) || 1)));
  }
  function showAddons() {
    const addons = product.variants[Number(form.elements.variant.value)]?.addons || [];
    addonPicker.hidden = !addons.length;
    renderMarkup(addonPicker, '<legend>Add-ons (optional, priced per item)</legend>' + addons.map(addon => `<label class="shop-addon-option"><input type="checkbox" value="${e(addon.id)}"><span>${e(addon.name)}</span><strong>+${money(addon.price)}</strong></label>`).join(''));
    addonPicker.onchange = updateEstimate; updateEstimate();
  }
  form.elements.variant.onchange = showAddons;
  form.elements.quantity.oninput = updateEstimate;
  showAddons();
  form.onsubmit = event => {
    event.preventDefault();
    try {
      const variant = product.variants[Number(form.elements.variant.value)], quantity = Number(form.elements.quantity.value);
      if (!usable) throw new Error('This product cannot be added right now. Refresh the page and try again.');
      if (!variant || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Choose an available option and a quantity between 1 and 100.');
      const selected = [...addonPicker.querySelectorAll('input:checked')].map(input => variant.addons.find(addon => addon.id === input.value));
      addProductToCart(product, variant, quantity, selected); node.close(); showCart('Added to your cart.');
    } catch (error) { showError(node, error); }
  };
}
export function showCart(message = '') {
  const lines = readCart();
  const node = dialog('Your cart', `<p class="shop-note">${e(message)}</p>${lines.length ? `<ul class="shop-lines">${lines.map((line, index) => `<li><div><strong>${e(line.name)}</strong><small>${e(line.variantName)} &middot; ${money(line.price)} each</small>${addonSummary(line)}<label>Quantity <input aria-label="Quantity for ${e(line.name)} ${e(line.variantName)}" type="number" min="1" max="100" value="${line.quantity}" data-quantity="${index}"></label></div><div><b>${money(decimal(cents(line.price) * line.quantity))}</b><button class="shop-link" data-remove="${index}" type="button">Remove</button></div></li>`).join('')}</ul><p class="shop-total">Estimated subtotal <strong>${money(decimal(lines.reduce((sum, line) => sum + cents(line.price) * line.quantity, 0)))}</strong></p><p class="shop-note">Current prices and charges are confirmed at checkout. Payment is handled by the store after the order is placed.</p><p data-shop-error role="alert"></p><button class="button" data-checkout type="button">Proceed to checkout</button>` : '<p>Your cart is empty. Browse products to add something.</p>'}`);
  node.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { try { lines.splice(Number(button.dataset.remove), 1); writeCart(lines); node.close(); showCart(); } catch (error) { showError(node, error); } });
  node.querySelectorAll('[data-quantity]').forEach(input => input.onchange = () => {
    try { const quantity = Number(input.value); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Quantity must be between 1 and 100.'); lines[Number(input.dataset.quantity)].quantity = quantity; writeCart(lines); node.close(); showCart(); } catch (error) { showError(node, error); }
  });
  node.querySelector('[data-checkout]')?.addEventListener('click', () => { node.close(); showCheckout(); });
}
function signInForCheckout() {
  location.assign('/customer.html?next=checkout');
}
export async function showCheckout() {
  if (!readCart().length) return showCart();
  const node = dialog('Checkout', '<p>Checking your customer session...</p><p data-shop-error role="alert"></p>');
  try {
    const session = (await api('/customer/session', { authEvent: false })).data;
    if (!node.isConnected) return;
    if (!session.customer) { node.close(); return signInForCheckout(); }
    const account = session.customer;
    setAccount(account.id);
    const body = node.querySelector('.shop-dialog-body');
    renderMarkup(body, `<p>Ordering as <strong>${e(account.name)}</strong></p><form class="shop-form"><label>Order type<select name="type"><option value="TAKEAWAY">Takeaway / collect at the store</option><option value="PICKUP">Scheduled pickup</option></select></label><label>Contact number<input name="contact" autocomplete="tel" required maxlength="40"></label><label data-pickup hidden>Pickup date and time<input name="pickupAt" type="datetime-local"></label><label>Order notes (optional)<textarea name="instructions" maxlength="2000" rows="2"></textarea></label><p class="shop-note">This order will be Pending and unpaid until the store confirms it. Pay at the store; no online payment is collected here.</p><p data-shop-error role="alert"></p><button class="button">Review current total</button></form><div data-review></div>`);
    const form = node.querySelector('form');
    form.elements.type.onchange = () => { const scheduled = form.elements.type.value === 'PICKUP'; node.querySelector('[data-pickup]').hidden = !scheduled; form.elements.pickupAt.required = scheduled; };
    const review = node.querySelector('[data-review]');
    function displayQuote(payload, quote, key) {
      form.hidden = true;
      renderMarkup(review, `${lineSummary(quote.lines.map(line => ({ ...line, price: line.unitPrice })))}<div class="shop-breakdown"><p>Subtotal <b>${money(quote.subtotal)}</b></p><p>Tax <b>${money(quote.tax)}</b></p><p>Service charge <b>${money(quote.service)}</b></p><p class="shop-total">Total <strong>${money(quote.total)}</strong></p></div><p class="shop-note">${payload.type === 'PICKUP' ? 'Scheduled pickup: ' + e(new Date(payload.pickupAt).toLocaleString()) : 'Collect at the store'}<br>Pending confirmation. Payment is collected by the store.</p><p data-submit-error role="alert"></p><div class="shop-actions"><button class="button" data-place>Place order</button><button class="shop-link" data-edit>Edit details</button></div>`);
      review.querySelector('[data-edit]').onclick = () => { sessionStorage.removeItem(PENDING); renderMarkup(review, ''); form.hidden = false; };
      review.querySelector('[data-place]').onclick = async event => {
        const button = event.currentTarget; button.disabled = true; review.querySelector('[data-edit]').disabled = true;
        try {
          sessionStorage.setItem(PENDING, JSON.stringify({ accountId: account.id, payload, quote, key }));
          const order = (await api('/customer/checkout', { method: 'POST', data: payload, operationId: key, authEvent: false })).data;
          sessionStorage.removeItem(PENDING);
          const current = readCart();
          const submitted = new Map(payload.items.map(item => [lineKey(item), item.quantity]));
          writeCart(current.flatMap(line => { const quantity = line.quantity - (submitted.get(lineKey(line)) || 0); return quantity > 0 ? [{ ...line, quantity }] : []; }));
          renderMarkup(body, `<h3>Order placed</h3><p class="shop-order-number">${e(order.number)}</p><p>Status: <strong>Pending confirmation</strong></p><p>Total: <strong>${money(order.total)}</strong></p><p>Payment has not been collected. The store will review your order.</p><a class="button" href="/">Continue browsing</a>`);
        } catch (error) {
          if ([401, 419].includes(error.status)) { node.close(); return signInForCheckout(); }
          if (error.code === 'QUOTE_CHANGED' && error.details?.quote) {
            sessionStorage.removeItem(PENDING); displayQuote({ ...payload, quoteHash: error.details.quote.quoteHash }, error.details.quote, crypto.randomUUID());
            review.querySelector('[data-submit-error]').textContent = error.message + ' Please confirm the new total.'; return;
          }
          review.querySelector('[data-submit-error]').textContent = error.message + (error.status === 0 ? ' Retry to check the same order safely.' : '');
          if (error.code === 'MENU_CONFLICT') { sessionStorage.removeItem(PENDING); review.querySelector('[data-place]').hidden = true; }
        } finally { if (button.isConnected) { button.disabled = false; review.querySelector('[data-edit]').disabled = false; } }
      };
    }
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING)); } catch {}
    if (pending?.accountId === account.id) displayQuote(pending.payload, pending.quote, pending.key);
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const payload = { type: values.type, contact: values.contact, instructions: values.instructions, ...(values.type === 'PICKUP' ? { pickupAt: new Date(values.pickupAt).toISOString() } : {}), items: readCart().map(line => ({ variantId: line.variantId, quantity: line.quantity, addons: line.addons.map(addon => addon.id), instructions: '' })) };
        const quote = (await api('/customer/quote', { method: 'POST', data: payload, authEvent: false })).data;
        if (node.isConnected) displayQuote({ ...payload, quoteHash: quote.quoteHash }, quote, crypto.randomUUID());
      } catch (error) { if ([401, 419].includes(error.status)) { node.close(); signInForCheckout(); } else showError(node, error); }
      finally { button.disabled = false; }
    };
  } catch (error) { if (node.isConnected) showError(node, error); }
}
export function initStorefront() {
  const cart = document.querySelector('[data-cart]'), openCart = () => showCart(storageError);
  cart?.addEventListener('click', openCart);
  updateCartCount(); window.addEventListener('storage', updateCartCount);
  if (new URLSearchParams(location.search).get('checkout') === '1') {
    history.replaceState(null, '', '/#menu'); showCheckout();
  }
  return () => { cart?.removeEventListener('click', openCart); window.removeEventListener('storage', updateCartCount); };
}
