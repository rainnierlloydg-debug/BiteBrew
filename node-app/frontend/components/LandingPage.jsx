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

export function LandingPage() {
  useEffect(() => {
    let active = true, cleanup;
    queueMicrotask(() => { if (active) cleanup = initStorefront(); });
    return () => { active = false; cleanup?.(); };
  }, []);
  return <div className="landing-page">
    <a className="skip" href="#main">Skip to content</a>
    <div className="sticky-header"><header className="site-header wrap">
      <a className="brand" href="/" aria-label="Bite and Brew home">
        <img src="/icons/brand-logo.png" width="64" height="50" alt="" />
        <span>Bite <i>&amp;</i> Brew<small>A BITE. A SIP. A GOOD DAY.</small></span>
      </a>
      <nav aria-label="Main navigation"><a href="#menu">Our menu</a><a href="#how-to-order">How to order</a><a href="#about">About</a></nav>
      <div className="header-logins">
        <button type="button" className="cart-button" data-cart aria-label="Open cart, 0 items" title="View cart"><Icon name="cart" size={21} /><span className="cart-count" data-cart-count aria-hidden="true">0</span></button>
        <a className="button small" href="/customer.html">Customer login</a>
      </div>
    </header></div>
    <main id="main">
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span></span> WELCOME TO BITE &amp; BREW</p>
          <h1 id="hero-title">Your favorites.<br /><em>One happy place.</em></h1>
          <p className="intro">From a cheesy slice to your favorite milk tea, find something for every craving. Explore the menu and make it yours.</p>
          <div className="hero-actions"><a className="button" href="#menu">Browse products</a><a className="button button-outline" href="#about">Explore the system</a></div>
          <div className="hero-note"><Icon name="cart" size={17} /><p>Browse freely. Sign in when you're ready to checkout.</p></div>
        </div>
        <div className="hero-visual">
          <div className="hero-art hero-photo"><img src="/images/hero-pizza-burger.png" width="1672" height="941" alt="Pepperoni pizza with a lifted slice, a cheeseburger and golden fries" fetchPriority="high" decoding="async" /></div>
          <div className="hero-pairing"><img src="/images/hero-food.png" width="1672" height="941" alt="Two milk tea drinks, a cheeseburger and fries" decoding="async" /><div><p className="eyebrow">BETTER TOGETHER</p><strong>A bite. A sip.<br />Your perfect pair.</strong><span>Find your combination below.</span></div></div>
        </div>
      </section>
      <section className="order-guide wrap" id="how-to-order" aria-label="How to order">
        <div><span className="step-number">01</span><p><strong>Find your favorites</strong><span>Browse the menu by category.</span></p></div>
        <div><span className="step-number">02</span><p><strong>Make it yours</strong><span>Choose your size and available add-ons.</span></p></div>
        <div><span className="step-number">03</span><p><strong>Ready to order?</strong><span>Sign in and review your cart at checkout.</span></p></div>
      </section>
      <ProductCatalog />
      <section className="about-section" id="about" aria-labelledby="about-title">
        <div className="wrap">
          <div className="section-heading"><div><p className="eyebrow">BEHIND EVERY ORDER</p><h2 id="about-title">Good food.<br />An organized team.</h2></div><p>Bite &amp; Brew connects orders, kitchen preparation and sales in a shared workspace for the people who keep the shop moving.</p></div>
          <div className="system-features">{features.map(feature => <article key={feature.icon}><span className="feature-icon"><Icon name={feature.icon} size={22} /></span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
          <div className="staff-access"><div><strong>Part of the Bite &amp; Brew team?</strong><p>Open your workspace to manage orders and daily operations.</p></div><a className="button button-outline" href="/staff.html">Admin &amp; staff login</a></div>
        </div>
      </section>
    </main>
    <footer className="site-footer"><div className="wrap footer-inner"><div><a className="footer-brand" href="/">Bite <i>&amp;</i> Brew</a><p>Your favorites, all in one place.</p></div><nav aria-label="Footer navigation"><a href="#menu">Our menu</a><a href="/customer.html">Customer login</a><a href="/staff.html">Admin &amp; staff login</a></nav><a className="back-to-top" href="#main">Back to top <Icon name="up" size={12} /></a></div></footer>
  </div>;
}
