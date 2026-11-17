import { showMessage } from '/shared/message-box.js';
import { Icon } from './Icon.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { api, setAccount } from '/js/api.js';
import { mountSupportChat } from '/js/support-chat.js';

function Notice({ error }) {
  useEffect(() => { if (error) showMessage(error.message || String(error), 'error'); }, [error]);
  return error ? <div className="notice error" role="alert"><strong>{error.message || String(error)}</strong>{Array.isArray(error.details) && <ul>{error.details.map((detail, index) => <li key={index}>{detail.field}: {detail.message}</li>)}</ul>}</div> : null;
}
function Layout({ children }) {
  return <main className="login-layout customer-access"><section className="login-story"><img className="customer-story-photo" src="/images/hero-pizza-burger.png" width="1672" height="941" alt="Pepperoni pizza, a cheeseburger and golden fries" /><div className="customer-story-content"><p className="eyebrow">A BITE. A SIP. A GOOD DAY.</p><h1>Good bites.<br /><em>Better sips.</em></h1><p>Your favorites, all in one place.</p></div></section><section className="glass login-card"><a className="login-back-home" href="/"><Icon name="left" size={14} /> Back to home</a><a className="customer-login-brand" href="/" aria-label="Bite and Brew home"><img src="/icons/brand-logo.png" width="64" height="54" alt="" /><strong>Bite &amp; Brew</strong><span>Your next favorite starts here.</span></a>{children}<div className="customer-access-footer"><span>For the people behind every order.</span><a href="/staff.html">Admin &amp; staff sign in</a></div></section></main>;
}
function Field({ title, ...props }) { return <label className="field"><span>{title}</span><input {...props} /></label>; }
function PasswordField({ register }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>Password</span><div className="customer-password"><input name="password" type={visible ? 'text' : 'password'} required minLength={register ? 12 : undefined} maxLength="128" autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Create a strong password' : 'Enter your password'} /><button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eye-slash' : 'eye'} size={17} /></button></div></label>;
}
function CustomerForm({ onSession }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null);
    try { const result = await api('/customer/' + (register ? 'register' : 'login'), { method: 'POST', data: Object.fromEntries(new FormData(form)), authEvent: false }); onSession(result.data.customer); }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  return <Layout><span className="badge">CUSTOMER ACCOUNT</span><h2>{register ? 'Create your account' : 'Welcome back.'}</h2><p>{register ? 'A few details, and you’re ready to find your favorites.' : 'Sign in to continue to your orders and favorite bites.'}</p><form id="customer-form" key={register ? 'register' : 'login'} onSubmit={submit} aria-busy={busy}>{register && <><Field title="Full name" name="name" required maxLength="120" autoComplete="name" placeholder="Your full name" /><Field title="Contact number (optional)" name="contact" type="tel" maxLength="40" autoComplete="tel" placeholder="Your contact number" /></>}<Field title="Email address" name="email" type="email" required maxLength="190" autoComplete="username" placeholder="you@example.com" /><PasswordField register={register} />{register && <p className="customer-password-hint">Use at least 12 characters for your password.</p>}<div data-error="" role="alert"><Notice error={error} /></div><button className="wide" disabled={busy}>{busy ? (register ? 'Creating account…' : 'Signing in…') : register ? 'Create customer account' : 'Sign in'}</button></form><p className="customer-switch-prompt">{register ? 'Already have an account?' : 'New to Bite & Brew?'}</p><button type="button" className="text-button customer-form-switch" data-switch="" disabled={busy} onClick={() => { setRegister(!register); setError(null); }}>{register ? 'Back to sign in' : 'Create an account'}</button></Layout>;
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
