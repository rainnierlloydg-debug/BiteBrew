import React, { version } from 'react';
import { renderComponent } from './markup.jsx';
import { LandingPage } from './components/LandingPage.jsx';
import { CustomerApp } from './components/CustomerApp.jsx';

export { renderMarkup, isReactRoot } from './markup.jsx';
export { version as reactVersion };
export function mountLanding() { renderComponent(document.querySelector('#landing-root'), <LandingPage />); }
export function mountCustomer() { renderComponent(document.querySelector('#app'), <CustomerApp />); }
