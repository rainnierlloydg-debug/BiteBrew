import { Icon } from './Icon.jsx';
import React, { useEffect } from 'react';
import { initStorefront } from '/js/storefront.js';
import { ProductCatalog } from './ProductCatalog.jsx';

const features = [
  { icon: 'orders', title: 'Orders in one place', text: 'Your staff records orders and follows each one from confirmation to completion.' },
  { icon: 'kitchen', title: 'A connected kitchen', text: 'Kitchen staff see what needs preparing and update orders as they become ready.' },
  { icon: 'wallet', title: 'Clear payments', text: 'Track cash and GCash payments, outstanding balances and daily sales.' },
  { icon: 'users', title: 'A workspace for your team', text: 'Owners, cashiers and kitchen staff have access suited to their roles.' }
];

export function LandingPage({ catalog = false }) {
  useEffect(() => {
    if (!catalog) return;
    let active = true, cleanup;
    queueMicrotask(() => { if (active) cleanup = initStorefront(); });
    return () => { active = false; cleanup?.(); };
  }, [catalog]);
  return <div className="landing-page">
    <a className="skip" href="#main">Skip to content</a>
    <div className="sticky-header"><header className="site-header wrap">
      <a className="brand" href="/" aria-label="Bite and Brew home">
        <img src="/icons/brand-logo.png" width="64" height="50" alt="" />
        <span>Bite <i>&amp;</i> Brew<small>A BITE. A SIP. A GOOD DAY.</small></span>
      </a>
      <nav aria-label="Main navigation">{catalog ? <><a href="/">Home</a><a href="/customer.html">My account</a></> : <><a href="#information">Information</a><a href="#how-it-works">How it works</a><a href="#about">About</a></>}</nav>
      <div className="header-logins">
        {catalog && <button type="button" className="cart-button" data-cart aria-label="Open cart, 0 items" title="View cart"><Icon name="cart" size={21} /><span className="cart-count" data-cart-count aria-hidden="true">0</span></button>}
        <a className="button small" href="/login.html">Sign in</a>
      </div>
    </header></div>
    <main id="main">{catalog ? <ProductCatalog /> : <>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span></span> WELCOME TO BITE &amp; BREW</p>
          <h1 id="hero-title">Every order.<br /><em>One connected team.</em></h1>
          <p className="intro">Bite & Brew brings order management, kitchen preparation and payment tracking together, helping the team keep daily operations organized.</p>
          <div className="hero-actions"><a className="button" href="#information">Explore the system</a><a className="button button-outline" href="/login.html">Sign in</a></div>
          <div className="hero-note"><Icon name="users" size={17} /><p>One sign-in page. The right workspace for your account.</p></div>
        </div>
        <div className="information-preview" aria-label="Order workflow overview">
          <div className="information-preview-heading"><span className="feature-icon"><Icon name="orders" size={26} /></span><div><p className="eyebrow">BITE &amp; BREW WORKSPACE</p><h2>From order to handoff.</h2></div></div>
          <ol className="information-flow"><li><span>01</span><div><strong>Record the order</strong><p>Keep the customer's choices and order details together.</p></div></li><li><span>02</span><div><strong>Prepare in the kitchen</strong><p>Follow the queue and update preparation status.</p></div></li><li><span>03</span><div><strong>Track payment &amp; completion</strong><p>Record payments and keep a history of the transaction.</p></div></li></ol>
          <p className="information-preview-note">Connected workspaces for owners, cashiers and kitchen staff.</p>
        </div>
      </section>
      <section className="order-guide wrap" id="how-it-works" aria-label="How the system works">
        <div><span className="step-number">01</span><p><strong>Sign in</strong><span>Use your assigned email and password.</span></p></div>
        <div><span className="step-number">02</span><p><strong>Open your workspace</strong><span>The system identifies your account and role.</span></p></div>
        <div><span className="step-number">03</span><p><strong>Keep the team connected</strong><span>Follow orders, preparation and updates.</span></p></div>
      </section>
      <section className="information-section wrap" id="information" aria-labelledby="information-title">
        <div className="section-heading"><div><p className="eyebrow">GET TO KNOW THE SYSTEM</p><h2 id="information-title">The right tools.<br />For every role.</h2></div><p>Each account opens a workspace suited to its responsibilities, with shared order information to keep the team in sync.</p></div>
        <div className="information-roles"><article><span className="feature-icon"><Icon name="users" size={24} /></span><h3>Owner &amp; administrator</h3><p>Manage staff accounts, menu records, reports and settings. Review sales and the activity history.</p></article><article><span className="feature-icon"><Icon name="orders" size={24} /></span><h3>Cashier</h3><p>Record orders, handle payments and keep track of each order through the point of sale.</p></article><article><span className="feature-icon"><Icon name="kitchen" size={24} /></span><h3>Kitchen staff</h3><p>See the preparation queue, update order status and communicate with the team.</p></article><article><span className="feature-icon"><Icon name="chat" size={24} /></span><h3>Customer</h3><p>Sign in to your customer account to access ordering and contact the shop through customer chat.</p></article></div>
      </section>
      <section className="about-section" id="about" aria-labelledby="about-title">
        <div className="wrap">
          <div className="section-heading"><div><p className="eyebrow">BEHIND EVERY ORDER</p><h2 id="about-title">Good food.<br />An organized team.</h2></div><p>Bite &amp; Brew connects orders, kitchen preparation and sales in a shared workspace for the people who keep the shop moving.</p></div>
          <div className="system-features">{features.map(feature => <article key={feature.icon}><span className="feature-icon"><Icon name={feature.icon} size={22} /></span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
          <div className="staff-access"><div><strong>Part of the Bite &amp; Brew team?</strong><p>Open your workspace to manage orders and daily operations.</p></div><a className="button button-outline" href="/login.html">Open workspace</a></div>
        </div>
      </section>
    </>}</main>
    <footer className="site-footer"><div className="wrap footer-inner"><div><a className="footer-brand" href="/">Bite <i>&amp;</i> Brew</a><p>Your favorites, all in one place.</p></div><nav aria-label="Footer navigation"><a href={catalog ? "/" : "#information"}>{catalog ? "Home" : "Information"}</a><a href="/login.html">Sign in</a></nav><a className="back-to-top" href="#main">Back to top <Icon name="up" size={12} /></a></div></footer>
  </div>;
}
