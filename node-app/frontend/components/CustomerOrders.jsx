import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '/js/api.js';
import { money } from '/js/ui.js';
import { Icon } from './Icon.jsx';
import { showMessage } from '/shared/message-box.js';

const labels = { PENDING: 'Pending confirmation', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready for pickup', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const date = value => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export function CustomerOrders({ onBack, onExpired }) {
  const [page, setPage] = useState(1), [result, setResult] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => { if (error) showMessage(error.message, 'error'); }, [error]);
  const load = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true);
    try {
      const value = await api('/customer/orders?page=' + page + '&pageSize=10', { authEvent: false, signal: controller.signal });
      if (!controller.signal.aborted) { setResult(value); setError(null); }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if ([401, 419].includes(failure.status)) onExpired();
      else setError(previous => previous?.message === failure.message ? previous : failure);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [page, onExpired]);
  useEffect(() => {
    load();
    const refresh = () => { if (navigator.onLine && document.visibilityState === 'visible') load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); request.current?.abort(); };
  }, [load]);
  return <section className="customer-orders" aria-labelledby="customer-orders-title">
    <button type="button" className="text-button customer-back" data-orders-back="" onClick={onBack}><Icon name="left" size={14} /> Back to my account</button>
    <div className="customer-orders-heading"><div><p className="eyebrow">YOUR ORDERS</p><h1 id="customer-orders-title">My orders</h1><p>Follow your order from confirmation to pickup. Updates refresh while you are online.</p></div><button type="button" className="secondary" data-orders-refresh="" disabled={busy} onClick={load}><Icon name="refresh" size={16} /> Refresh</button></div>
    {error && <div className="notice error" role="alert">{error.message} Your last loaded orders remain below. <button type="button" className="text-button" onClick={load}>Try again</button></div>}
    {!result && !error && <p role="status">Loading your orders...</p>}
    {result?.data.length === 0 && <div className="customer-order-card"><h2>No orders yet</h2><p>Choose your favorites from the menu to place your first order.</p><a className="button" href="/menu.html">Browse menu</a></div>}
    <div className="customer-orders-list" aria-busy={busy}>{result?.data.map(order => <article className="customer-order-card" data-customer-order={order.id} key={order.id}>
      <div className="customer-order-top"><div><h2>{order.number}</h2><small>Placed {date(order.createdAt)}</small></div><span className={'badge badge-' + order.status.toLowerCase()}>{labels[order.status] || order.status}</span></div>
      <p>{order.type === 'PICKUP' ? 'Scheduled pickup: ' + date(order.pickupAt) : 'Takeaway / collect at the store'}</p>
      <ul className="customer-order-items">{order.items.map(item => <li key={item.id}><span><strong>{item.quantity} × {item.name}</strong><small>{item.variantName === 'Menu price (size unspecified)' ? 'Menu price' : item.variantName}</small>{item.addons?.length > 0 && <small>Add-ons: {item.addons.map(addon => addon.name).join(', ')}</small>}</span><strong>{money(item.subtotal)}</strong></li>)}</ul>
      <div className="customer-order-payment"><span>Total <strong>{money(order.total)}</strong></span><span>{order.paymentStatus === 'PAID' ? 'Paid' : order.paymentStatus === 'PARTIAL' ? 'Partially paid' : 'Unpaid'}{order.status !== 'CANCELLED' && Number(order.balance) > 0 ? ' · Balance ' + money(order.balance) : ''}</span></div>
      {Number(order.refunded) > 0 && <p>Refunded: {money(order.refunded)}</p>}
      {order.status === 'PENDING' && <p className="customer-order-note">The store will review your order. Payment is collected by the store.</p>}
      {order.status === 'READY' && <p className="customer-order-note">Your order is ready. Please collect it at the store.</p>}
      {order.status === 'CANCELLED' && <p className="customer-order-note">This order was cancelled. Contact staff if you need help.</p>}
    </article>)}</div>
    {result?.meta.lastPage > 1 && <div className="customer-orders-pagination"><button type="button" className="secondary" disabled={busy || page <= 1} onClick={() => { setResult(null); setPage(page - 1); }}>Previous</button><span>Page {page} of {result.meta.lastPage}</span><button type="button" className="secondary" disabled={busy || page >= result.meta.lastPage} onClick={() => { setResult(null); setPage(page + 1); }}>Next</button></div>}
  </section>;
}
