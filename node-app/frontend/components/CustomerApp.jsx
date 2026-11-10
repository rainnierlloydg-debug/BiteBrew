import React, { useEffect, useRef, useState } from 'react';
import { api, setAccount } from '/js/api.js';
import { mountSupportChat } from '/js/support-chat.js';

function Notice({ error }) {
  return error ? <div className="notice error" role="alert"><strong>{error.message || String(error)}</strong>{Array.isArray(error.details) && <ul>{error.details.map((detail, index) => <li key={index}>{detail.field}: {detail.message}</li>)}</ul>}</div> : null;
}
function Layout({ children }) {
  return <main className="login-layout"><section className="login-story"><div className="brand"><img src="/icons/brand-logo.png" width="48" height="48" alt="" /><strong>Bite &amp; Brew</strong></div><div><p className="eyebrow">CUSTOMER ACCESS</p><h1>Good bites.<br />Better sips.</h1><p>Your own customer account.</p></div><a href="/staff.html">Admin &amp; staff sign in</a></section><section className="glass login-card"><a className="login-back-home" href="/">&#8592; Back to home</a>{children}</section></main>;
}
function Field({ title, ...props }) { return <label className="field"><span>{title}</span><input {...props} /></label>; }
function CustomerForm({ onSession }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null);
    try { const result = await api('/customer/' + (register ? 'register' : 'login'), { method: 'POST', data: Object.fromEntries(new FormData(form)), authEvent: false }); onSession(result.data.customer); }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  return <Layout><span className="badge">CUSTOMER ACCESS</span><h2>{register ? 'Create your account' : 'Customer sign in'}</h2><p>Use your customer account here. Admin and staff use the separate workspace login.</p><form id="customer-form" key={register ? 'register' : 'login'} onSubmit={submit}>{register && <><Field title="Full name" name="name" required maxLength="120" autoComplete="name" /><Field title="Contact number (optional)" name="contact" maxLength="40" autoComplete="tel" /></>}<Field title="Email address" name="email" type="email" required maxLength="190" autoComplete="username" /><Field title="Password" name="password" type="password" required minLength={register ? 12 : undefined} maxLength="128" autoComplete={register ? 'new-password' : 'current-password'} />{register && <p>Use at least 12 characters for your password.</p>}<div data-error="" role="alert"><Notice error={error} /></div><button className="wide" disabled={busy}>{register ? 'Create customer account' : 'Sign in'}</button></form><button className="text-button" data-switch="" onClick={() => { setRegister(!register); setError(null); }}>{register ? 'Already have an account? Sign in' : 'New customer? Create an account'}</button></Layout>;
}
function CustomerChat({ onBack, onExpired }) {
  const host = useRef(null), [error, setError] = useState(null);
  useEffect(() => {
    let active = true, stop;
    mountSupportChat(host.current, { customer: true, name: 'Bite & Brew staff', onAuthExpired: () => { if (active) onExpired(); } }).then(cleanup => { if (active) stop = cleanup; else cleanup(); }).catch(failure => { if (active) setError(failure); });
    const hide = () => stop?.(); window.addEventListener('pagehide', hide);
    return () => { active = false; stop?.(); window.removeEventListener('pagehide', hide); };
  }, [onExpired]);
  return <Layout><span className="badge">CUSTOMER CHAT</span><h2>Chat with staff</h2><p>Ask about products, availability or your order.</p><button type="button" className="text-button" data-back="" onClick={onBack}>Back to my account</button><Notice error={error} /><section className="customer-support" data-support="" ref={host}><p>Opening conversation...</p></section></Layout>;
}
export function CustomerApp() {
  const [customer, setCustomer] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null), [chat, setChat] = useState(false), [busy, setBusy] = useState(false);
  const expired = React.useCallback(() => { setAccount(null); setCustomer(null); setChat(false); }, []);
  const session = React.useCallback(value => {
    setAccount(value?.id || null); setCustomer(value); setChat(false);
    if (value && new URLSearchParams(location.search).get('next') === 'checkout') location.replace('/?checkout=1#menu');
  }, []);
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { session((await api('/customer/session', { authEvent: false })).data.customer); }
    catch (failure) { setError([401, 404].includes(failure.status) ? new Error('Customer sign-in is not available on the running server yet. Ask the owner to restart the application, then try again.') : failure); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { load(); const restored = event => { if (event.persisted) load(); }; window.addEventListener('pageshow', restored); return () => window.removeEventListener('pageshow', restored); }, [load]);
  async function logout() {
    setBusy(true); setError(null);
    try { await api('/customer/logout', { method: 'POST', data: {}, authEvent: false }); expired(); }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  if (loading) return <main className="loading-screen">Opening customer access...</main>;
  if (error && !customer) return <Layout><h2>Customer access unavailable</h2><Notice error={error} /><button data-retry="" onClick={load}>Try again</button></Layout>;
  if (!customer) return <CustomerForm onSession={session} />;
  if (chat) return <CustomerChat onBack={() => setChat(false)} onExpired={expired} />;
  return <Layout><span className="badge">CUSTOMER ACCOUNT</span><h2>Welcome, {customer.name}.</h2><p>You are signed in as a customer.</p><p>{customer.email}</p><a className="button" href="/">Browse products &amp; cart</a><div data-error="" role="alert"><Notice error={error} /></div><button type="button" className="secondary wide" onClick={() => setChat(true)}>Chat with staff</button><button data-logout="" disabled={busy} onClick={logout}>Sign out</button></Layout>;
}
