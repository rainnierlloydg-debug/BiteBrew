import { showMessage, confirmMessage } from '/shared/message-box.js';
import { Icon } from './Icon.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { api, setAccount } from '/js/api.js';
import { mountSupportChat } from '/js/support-chat.js';
import { isWorkspaceLocked } from '/js/workspace-session.js';
import { prepareAccountSession, staffDestination } from '/js/access-session.js';

function Notice({ error }) {
  useEffect(() => { if (error) showMessage(error.message || String(error), 'error'); }, [error]);
  return error ? <div className="notice error" role="alert"><strong>{error.message || String(error)}</strong>{Array.isArray(error.details) && <ul>{error.details.map((detail, index) => <li key={index}>{detail.field}: {detail.message}</li>)}</ul>}</div> : null;
}
function Layout({ children, signIn = false }) {
  return <main className={'login-layout customer-access' + (signIn ? ' shared-sign-in' : '')}><section className="login-story"><img className="customer-story-photo" src="/images/hero-pizza-burger.png" width="1672" height="941" alt="Pepperoni pizza, a cheeseburger and golden fries" /><div className="customer-story-content"><p className="eyebrow">A BITE. A SIP. A GOOD DAY.</p><h1>Good bites.<br /><em>Better sips.</em></h1><p>Your favorites, all in one place.</p></div></section><section className="glass login-card"><a className="login-back-home" href="/"><Icon name="left" size={14} /> Back to home</a><a className="customer-login-brand" href="/" aria-label="Bite and Brew home"><img src="/icons/brand-logo.png" width="64" height="54" alt="" /><strong>Bite &amp; Brew</strong><span>Your next favorite starts here.</span></a>{children}<div className="customer-access-footer"><span>Staff accounts are provided by the administrator.</span></div></section></main>;
}
function Field({ title, ...props }) { return <label className="field"><span>{title}</span><input {...props} /></label>; }
function PasswordField({ register, confirm = false }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{confirm ? 'Confirm password' : 'Password'}</span><div className="customer-password"><input name={confirm ? 'confirmPassword' : 'password'} type={visible ? 'text' : 'password'} required minLength={register ? 12 : undefined} maxLength="128" autoComplete={register ? 'new-password' : 'current-password'} placeholder={confirm ? 'Re-enter password' : register ? 'Create a strong password' : 'Enter your password'} /><button type="button" className="password-toggle" data-toggle-password="" aria-label={(visible ? 'Hide ' : 'Show ') + (confirm ? 'confirm password' : 'password')} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eye-slash' : 'eye'} size={17} /></button></div></label>;
}
function CustomerForm({ onSession }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null), [verification, setVerification] = useState(null), [time, setTime] = useState(Date.now());
  useEffect(() => {
    try { const message = sessionStorage.getItem('bite-brew-login-notice'); sessionStorage.removeItem('bite-brew-login-notice'); if (message) showMessage(message, 'info'); } catch {}
  }, []);
  useEffect(() => { if (!verification) return; const timer = setInterval(() => setTime(Date.now()), 1000); return () => clearInterval(timer); }, [verification]);
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null);
    try {
      const route = verification ? '/customer/register/verify' : register ? '/customer/register' : '/login';
      const data = verification ? { token: verification.token, code: form.elements.code.value } : Object.fromEntries(new FormData(form));
      if (register && !verification && data.password !== data.confirmPassword) {
        setError(new Error('Passwords do not match. Please re-enter your confirmation password.'));
        form.elements.confirmPassword.focus(); return;
      }
      const result = (await api(route, { method: 'POST', data, authEvent: false })).data;
      if (result.verificationRequired) { setVerification(result); setTime(Date.now()); }
      else await onSession(result, true);
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(null);
    try { const result = (await api('/customer/register/resend', { method: 'POST', data: { token: verification.token }, authEvent: false })).data; setVerification(result); setTime(Date.now()); await showMessage('A new confirmation code was sent to your email.', 'success'); }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  const wait = verification ? Math.max(0, Math.ceil((new Date(verification.resendAt).getTime() - time) / 1000)) : 0;
  return <Layout signIn><div className={register ? 'customer-registration' : 'customer-signin'}>
    <h2>{verification ? 'Check your email' : register ? 'Create your account' : 'Welcome back.'}</h2>
    <p className="access-intro">{verification ? 'Enter the 6-digit confirmation code sent to:' : register ? 'Create an account to order your favorites.' : 'Sign in with your email to open your account.'}</p>
    {verification && <p className="verification-email">{verification.email}</p>}
    <form id="customer-form" key={verification ? 'verify' : register ? 'register' : 'login'} onSubmit={submit} aria-busy={busy}>
      {verification ? <><Field title="Confirmation code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoComplete="one-time-code" required placeholder="000000" /><p className="customer-password-hint">Expires in 10 minutes. Check your spam folder too.</p></> : <>
        {register && <><Field title="Full name" name="name" required maxLength="120" autoComplete="name" placeholder="Your full name" /><Field title="Contact number (optional)" name="contact" type="tel" maxLength="40" autoComplete="tel" placeholder="Your contact number" /></>}
        <Field title="Email address" name="email" type="email" required maxLength="190" autoComplete={register ? 'email' : 'username'} placeholder="you@example.com" />{register ? <div className="registration-passwords"><PasswordField register /><PasswordField register confirm /></div> : <PasswordField />}
        {register && <p className="customer-password-hint">Use at least 12 characters for your password.</p>}
      </>}
      <div data-error="" role="alert"><Notice error={error} /></div>
      <button className="wide" disabled={busy}>{busy ? 'Please wait...' : verification ? 'Verify & create account' : register ? 'Send confirmation code' : 'Sign in'}</button>
    </form>
    {verification && <button type="button" className="text-button verification-resend" disabled={busy || wait > 0} onClick={resend}>{wait ? 'Resend code in ' + wait + 's' : 'Resend code'}</button>}
    <p className="customer-switch-prompt">{verification ? 'Wrong email address?' : register ? 'Already have an account?' : 'New to Bite & Brew?'}</p>
    <button type="button" className="text-button customer-form-switch" data-switch="" disabled={busy} onClick={() => { if (verification) setVerification(null); else setRegister(!register); setError(null); }}>{verification ? 'Change registration details' : register ? 'Back to sign in' : 'Create customer account'}</button>
  </div></Layout>;
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
  const expired = React.useCallback(() => { setAccount(null); setCustomer(null); setChat(false); location.replace('/login.html'); }, []);
  const session = React.useCallback(async (result, explicitSignIn = false) => {
    if (result.user && !explicitSignIn && await isWorkspaceLocked()) {
      await api('/logout', { method: 'POST', data: {}, authEvent: false });
      result = (await api('/session', { authEvent: false })).data;
    }
    await prepareAccountSession(result);
    if (result.user) { location.replace(staffDestination(result.user)); return; }
    const value = result.customer;
    setAccount(value?.id || null); setCustomer(value || null); setChat(false);
    if (value && new URLSearchParams(location.search).get('next') === 'checkout') location.replace('/menu.html?checkout=1#menu');
    else if (value && location.pathname === '/login.html') location.replace('/customer.html');
    else if (!value && location.pathname !== '/login.html') location.replace('/login.html' + (new URLSearchParams(location.search).get('next') === 'checkout' ? '?next=checkout' : ''));
  }, []);
  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { await session((await api('/session', { authEvent: false })).data); }
    catch (failure) { setError([401, 404].includes(failure.status) ? new Error('Sign-in is temporarily unavailable. Please try again.') : failure); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { load(); const restored = event => { if (event.persisted) load(); }; window.addEventListener('pageshow', restored); return () => window.removeEventListener('pageshow', restored); }, [load]);
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await confirmMessage('Are you sure you want to sign out?', { title: 'Sign out?', confirmLabel: 'Sign out', cancelLabel: 'Cancel' }))) return;
      setError(null); await api('/customer/logout', { method: 'POST', data: {}, authEvent: false }); expired();
    }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  }
  if (loading) return <main className="loading-screen">Opening your account...</main>;
  if (error && !customer) return <Layout><h2>Sign-in unavailable</h2><Notice error={error} /><button data-retry="" onClick={load}>Try again</button></Layout>;
  if (!customer) return location.pathname === '/login.html' ? <CustomerForm onSession={session} /> : <main className="loading-screen">Opening sign in...</main>;
  if (chat) return <CustomerChat onBack={() => setChat(false)} onExpired={expired} />;
  return <Layout><span className="badge">CUSTOMER ACCOUNT</span><h2>Welcome, {customer.name}.</h2><p>You are signed in as a customer.</p><p>{customer.email}</p><a className="button" href="/menu.html">Browse products &amp; cart</a><div data-error="" role="alert"><Notice error={error} /></div><button type="button" className="secondary wide" onClick={() => setChat(true)}>Chat with staff</button><button data-logout="" disabled={busy} onClick={logout}>Sign out</button></Layout>;
}
