import { api, setAccount } from './api.js';
import { e, field, input, errorMessage } from './ui.js';
import { mountSupportChat } from './support-chat.js';

const app = document.querySelector('#app');
let customer = null;
let stopChat, viewVersion = 0;
function layout(content) {
  stopChat?.(); stopChat = null; viewVersion++;
  app.innerHTML = `<main class="login-layout"><section class="login-story"><div class="brand"><img src="/icons/brand-logo.png" width="48" height="48" alt=""><strong>Bite &amp; Brew</strong></div><div><p class="eyebrow">CUSTOMER ACCESS</p><h1>Good bites.<br>Better sips.</h1><p>Your own customer account.</p></div><a href="/staff.html">Admin &amp; staff sign in</a></section><section class="glass login-card"><a class="login-back-home" href="/">&#8592; Back to home</a>${content}</section></main>`;
}
function showLogin(register = false) {
  customer = null;
  setAccount(null);
  layout(`<span class="badge">CUSTOMER ACCESS</span><h2>${register ? 'Create your account' : 'Customer sign in'}</h2><p>Use your customer account here. Admin and staff use the separate workspace login.</p><form id="customer-form">${register ? field('Full name', input('name', '', 'required maxlength="120" autocomplete="name"')) + field('Contact number (optional)', input('contact', '', 'maxlength="40" autocomplete="tel"')) : ''}${field('Email address', input('email', '', 'type="email" required maxlength="190" autocomplete="username"'))}${field('Password', input('password', '', `type="password" required ${register ? 'minlength="12"' : ''} maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}"`))}${register ? '<p>Use at least 12 characters for your password.</p>' : ''}<div data-error role="alert"></div><button class="wide">${register ? 'Create customer account' : 'Sign in'}</button></form><button class="text-button" data-switch>${register ? 'Already have an account? Sign in' : 'New customer? Create an account'}</button>`);
  app.querySelector('[data-switch]').onclick = () => showLogin(!register);
  const form = app.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    try { const session = (await api('/customer/' + (register ? 'register' : 'login'), { method: 'POST', data: Object.fromEntries(new FormData(form)), authEvent: false })).data; customer = session.customer; showProfile(); }
    catch (error) { form.querySelector('[data-error]').innerHTML = errorMessage(error); }
    finally { button.disabled = false; }
  };
}
function showProfile() {
  setAccount(customer.id);
  if (new URLSearchParams(location.search).get('next') === 'checkout') { location.replace('/?checkout=1#menu'); return; }
  layout(`<span class="badge">CUSTOMER ACCOUNT</span><h2>Welcome, ${e(customer.name)}.</h2><p>You are signed in as a customer.</p><p>${e(customer.email)}</p><a class="button" href="/">Browse products &amp; cart</a><div data-error role="alert"></div><button data-logout>Sign out</button>`);
  app.querySelector('[data-logout]').onclick = async event => {
    event.currentTarget.disabled = true;
    try { await api('/customer/logout', { method: 'POST', data: {}, authEvent: false }); showLogin(); }
    catch (error) { app.querySelector('[data-error]').innerHTML = errorMessage(error); event.currentTarget.disabled = false; }
  };
  const chatButton = document.createElement('button');
  chatButton.type = 'button'; chatButton.className = 'secondary wide'; chatButton.textContent = 'Chat with staff';
  app.querySelector('[data-logout]').before(chatButton);
  chatButton.onclick = showChat;
}
async function showChat() {
  layout(`<span class="badge">CUSTOMER CHAT</span><h2>Chat with staff</h2><p>Ask about products, availability or your order.</p><button type="button" class="text-button" data-back>Back to my account</button><section class="customer-support" data-support><p>Opening conversation...</p></section>`);
  app.querySelector('[data-back]').onclick = showProfile;
  const version = viewVersion, root = app.querySelector('[data-support]');
  try {
    const stop = await mountSupportChat(root, { customer: true, name: 'Bite & Brew staff', onAuthExpired: () => { if (version === viewVersion) showLogin(); } });
    if (version !== viewVersion) stop(); else stopChat = stop;
  } catch (error) { if (version === viewVersion) root.innerHTML = errorMessage(error); }
}
async function start() {
  try { const session = (await api('/customer/session', { authEvent: false })).data; customer = session.customer; customer ? showProfile() : showLogin(); }
  catch (error) {
    const message = [401, 404].includes(error.status)
      ? new Error('Customer sign-in is not available on the running server yet. Ask the owner to restart the application, then try again.')
      : error;
    layout(`<h2>Customer access unavailable</h2>${errorMessage(message)}<button data-retry>Try again</button>`);
    app.querySelector('[data-retry]').onclick = start;
  }
}
window.addEventListener('pageshow', event => { if (event.persisted) start(); });
window.addEventListener('pagehide', () => stopChat?.());
start();
