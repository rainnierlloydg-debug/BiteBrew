import { initStorefront, productDetails, productPicture, addProductToCart } from './storefront.js';
import { e, money } from './ui.js';
// Preserve existing staff bookmarks and notification links.
const params = new URLSearchParams(location.search);
if (params.has('page') || params.get('source') === 'pwa') {
  location.replace('/staff.html' + location.search + location.hash);
}
// Ask an existing installation to refresh its cached shell.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
}

const results = document.querySelector('#product-results');
const filters = { q: '', categoryId: '', page: 1 };
let request;
const search = document.querySelector('#product-search');
search.onsubmit = event => { event.preventDefault(); filters.q = search.elements.q.value.trim(); filters.page = 1; loadProducts(); };
async function loadProducts() {
  request?.abort();
  const current = new AbortController(); request = current;
  results.setAttribute('aria-busy', 'true');
  document.querySelector('#product-pagination').innerHTML = '';
  document.querySelector('#product-summary').textContent = '';
  results.innerHTML = '<p class="catalog-message" role="status">Loading products...</p>';
  try {
    const response = await fetch('/api/public/products?' + new URLSearchParams({ ...filters, pageSize: 12 }), { signal: current.signal, cache: 'no-store' });
    if (!response.ok) throw new Error([401, 404].includes(response.status) ? 'The product catalog needs the updated application server. Please restart the app and try again.' : 'Products could not be loaded. Please try again.');
    const catalog = await response.json();
    if (current !== request) return;
    const categories = document.querySelector('#product-categories');
    categories.innerHTML = [{ id: '', name: 'All products' }, ...catalog.categories].map(category => `<button type="button" data-category="${e(category.id)}" aria-pressed="${filters.categoryId === category.id}">${e(category.name)}</button>`).join('');
    categories.querySelectorAll('button').forEach(button => button.onclick = () => { filters.categoryId = button.dataset.category; filters.page = 1; loadProducts(); });
    document.querySelector('#product-summary').textContent = `${catalog.meta.total} product${catalog.meta.total === 1 ? '' : 's'}${filters.q ? ' matching "' + filters.q + '"' : ''}`;
    results.innerHTML = catalog.data.length ? `<div class="menu-grid">${catalog.data.map(product => `<article class="menu-card" data-product="${e(product.id)}" aria-label="View ${e(product.name)} details">${productPicture(product)}<div class="menu-caption"><span>${e(product.category.name)}</span><h3><button class="product-title" type="button">${e(product.name)}</button></h3>${product.demo ? '<span class="demo-label">Demonstration</span>' : ''}${product.description ? `<p>${e(product.description)}</p>` : ''}<ul class="variant-prices">${product.variants.map(variant => `<li><span>${e(variant.name === 'Menu price (size unspecified)' ? 'Menu price' : variant.name)}</span><strong>${money(variant.price)}</strong></li>`).join('') || '<li>Currently unavailable</li>'}</ul><div class="product-card-actions"><span class="product-details-link">View details &#8599;</span><button class="product-add" type="button" data-quick-add aria-label="Add ${e(product.name)} to cart" ${product.variants.length ? '' : 'disabled'}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><p class="product-add-message" role="status"></p></div></article>`).join('')}</div>` : '<p class="catalog-message" role="status">No products found. Try another search or category.</p>';
    results.querySelectorAll('[data-product]').forEach(card => {
      const product = catalog.data.find(product => product.id === card.dataset.product);
      card.onclick = () => productDetails(product);
      card.querySelector('[data-quick-add]').onclick = event => {
        event.stopPropagation();
        if (product.variants.length !== 1 || product.variants[0].addons?.length) return productDetails(product);
        const message = card.querySelector('.product-add-message');
        try { addProductToCart(product, product.variants[0]); message.textContent = 'Added to cart'; message.classList.remove('error'); }
        catch (error) { message.textContent = error.message; message.classList.add('error'); }
      };
    });
    const pagination = document.querySelector('#product-pagination');
    pagination.innerHTML = catalog.meta.lastPage > 1 ? `<button type="button" data-page="${filters.page - 1}" ${filters.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${filters.page} of ${catalog.meta.lastPage}</span><button type="button" data-page="${filters.page + 1}" ${filters.page >= catalog.meta.lastPage ? 'disabled' : ''}>Next</button>` : '';
    pagination.querySelectorAll('button').forEach(button => button.onclick = () => { filters.page = Number(button.dataset.page); loadProducts(); });
  } catch (error) {
    if (error.name === 'AbortError' || current !== request) return;
    results.innerHTML = `<div class="catalog-message" role="alert"><p>${e(error.message)}</p><button type="button" class="button" data-retry>Try again</button></div>`;
    results.querySelector('[data-retry]').onclick = loadProducts;
  } finally { if (current === request) results.setAttribute('aria-busy', 'false'); }
}
loadProducts();

initStorefront();
