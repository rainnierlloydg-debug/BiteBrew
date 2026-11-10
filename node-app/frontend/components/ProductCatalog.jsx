import React, { useEffect, useState } from 'react';
import { addProductToCart, productDetails, productPicture } from '/js/storefront.js';
import { money } from '/js/ui.js';
import { Markup } from '../markup.jsx';

function ProductCard({ product }) {
  const [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  function quickAdd(event) {
    event.stopPropagation();
    if (product.variants.length !== 1 || product.variants[0].addons?.length) return productDetails(product);
    try { addProductToCart(product, product.variants[0]); setMessage('Added to cart'); setFailed(false); }
    catch (error) { setMessage(error.message); setFailed(true); }
  }
  return <article className="menu-card" data-product={product.id} aria-label={'View ' + product.name + ' details'} onClick={() => productDetails(product)}><Markup html={productPicture(product)} /><div className="menu-caption"><span>{product.category.name}</span><h3><button className="product-title" type="button">{product.name}</button></h3>{product.demo && <span className="demo-label">Demonstration</span>}{product.description && <p>{product.description}</p>}<ul className="variant-prices">{product.variants.length ? product.variants.map(variant => <li key={variant.id}><span>{variant.name === 'Menu price (size unspecified)' ? 'Menu price' : variant.name}</span><strong>{money(variant.price)}</strong></li>) : <li>Currently unavailable</li>}</ul><div className="product-card-actions"><span className="product-details-link">View details &#8599;</span><button className="product-add" type="button" data-quick-add="" aria-label={'Add ' + product.name + ' to cart'} disabled={!product.variants.length} onClick={quickAdd}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button></div><p className={'product-add-message' + (failed ? ' error' : '')} role="status">{message}</p></div></article>;
}
export function ProductCatalog() {
  const [filters, setFilters] = useState({ q: '', categoryId: '', page: 1 });
  const [query, setQuery] = useState(''), [catalog, setCatalog] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    (async () => {
      try {
        const response = await fetch('/api/public/products?' + new URLSearchParams({ ...filters, pageSize: 12 }), { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error([401, 404].includes(response.status) ? 'The product catalog needs the updated application server. Please restart the app and try again.' : 'Products could not be loaded. Please try again.');
        const result = await response.json(); if (!controller.signal.aborted) setCatalog(result);
      } catch (failure) { if (!controller.signal.aborted) setError(failure); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [filters]);
  const categories = [{ id: '', name: 'All products' }, ...(catalog?.categories || [])];
  return <section className="menu-section wrap" id="menu"><div className="section-heading"><div><p className="eyebrow">EXPLORE THE CURRENT CATALOG</p><h2>Our products.</h2></div><p>Browse products, available options and prices.<br />View details and add to cart. Sign in only at checkout.</p></div><form id="product-search" className="catalog-search" onSubmit={event => { event.preventDefault(); const value = event.currentTarget.elements.q.value; setQuery(value); setFilters({ ...filters, q: value.trim(), page: 1 }); }}><label htmlFor="product-query">Find a product</label><div><input id="product-query" name="q" type="search" placeholder="Search pizza, burgers, milk tea..." maxLength="120" value={query} onChange={event => setQuery(event.target.value)} /><button className="button" type="submit">Search</button></div></form><div id="product-categories" className="catalog-tabs" role="group" aria-label="Product categories">{categories.map(category => <button key={category.id} type="button" data-category={category.id} aria-pressed={filters.categoryId === category.id} onClick={() => setFilters({ ...filters, categoryId: category.id, page: 1 })}>{category.name}</button>)}</div><p id="product-summary" className="catalog-summary" aria-live="polite">{!loading && !error && catalog ? `${catalog.meta.total} product${catalog.meta.total === 1 ? '' : 's'}${filters.q ? ' matching "' + filters.q + '"' : ''}` : ''}</p><div id="product-results" aria-busy={loading}>{loading ? <p className="catalog-message" role="status">Loading products...</p> : error ? <div className="catalog-message" role="alert"><p>{error.message}</p><button type="button" className="button" data-retry="" onClick={() => setFilters({ ...filters })}>Try again</button></div> : catalog?.data.length ? <div className="menu-grid">{catalog.data.map(product => <ProductCard key={product.id} product={product} />)}</div> : <p className="catalog-message" role="status">No products found. Try another search or category.</p>}</div><div id="product-pagination" className="catalog-pagination">{!loading && !error && catalog?.meta.lastPage > 1 && <><button type="button" data-page={filters.page - 1} disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button><span>Page {filters.page} of {catalog.meta.lastPage}</span><button type="button" data-page={filters.page + 1} disabled={filters.page >= catalog.meta.lastPage} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button></>}</div><p className="menu-note">Prices are in Philippine pesos. Products marked Demonstration have sample pricing and illustrations. Confirm availability with the store.</p></section>;
}
