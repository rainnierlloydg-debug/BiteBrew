import React, { Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

// Existing controllers provide escaped, application-owned templates. React owns
// the rendered elements; this bridge preserves their synchronous form bindings.
const roots = new Map();
let revision = 0;
const names = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', autocomplete: 'autoComplete', autofocus: 'autoFocus', novalidate: 'noValidate', formnovalidate: 'formNoValidate', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', crossorigin: 'crossOrigin', contenteditable: 'contentEditable', spellcheck: 'spellCheck', allowfullscreen: 'allowFullScreen', playsinline: 'playsInline', 'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv', charset: 'charSet' };
const booleans = new Set(['disabled', 'required', 'multiple', 'hidden', 'inert', 'readOnly', 'autoFocus', 'noValidate', 'formNoValidate', 'open', 'controls', 'loop', 'muted', 'autoPlay', 'allowFullScreen', 'playsInline', 'reversed']);
function styleProps(element) {
  return Object.fromEntries([...element.style].map(name => [name.startsWith('--') ? name : name.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), element.style.getPropertyValue(name)]));
}
function elementNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE'].includes(node.tagName)) return null;
  const tag = node.localName, props = { key };
  for (const attribute of node.attributes) {
    if (/^on/i.test(attribute.name)) continue;
    let name = names[attribute.name] || attribute.name;
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') name = name.replace(/[-:]([a-z])/g, (_, letter) => letter.toUpperCase());
    if (name === 'style') props.style = styleProps(node);
    else if (name === 'checked') props.defaultChecked = true;
    else if (name === 'value' && tag === 'input' && node.type !== 'file') props.defaultValue = attribute.value;
    else if (booleans.has(name)) props[name] = true;
    else if (name === 'selected' && tag === 'option' && node.closest('select')) continue;
    else props[name] = attribute.value;
  }
  if (tag === 'textarea') { props.defaultValue = node.textContent; return React.createElement(tag, props); }
  if (tag === 'select') {
    const selected = [...node.querySelectorAll('option[selected]')].map(option => option.value);
    if (selected.length) props.defaultValue = node.multiple ? selected : selected[0];
  }
  const children = [...node.childNodes].map((child, index) => elementNode(child, index));
  return children.length ? React.createElement(tag, props, ...children) : React.createElement(tag, props);
}
export function Markup({ html }) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  return <>{[...template.content.childNodes].map((node, index) => elementNode(node, index))}</>;
}
function unmountDescendants(container) {
  for (const [element, root] of [...roots]) if (element !== container && container.contains(element)) { roots.delete(element); root.unmount(); }
}
export function renderComponent(container, component) {
  if (!container) throw new Error('The view container is unavailable.');
  flushSync(() => {
    unmountDescendants(container);
    let root = roots.get(container);
    if (!root) { root = createRoot(container); roots.set(container, root); }
    root.render(component);
  });
}
export function renderMarkup(container, html) {
  renderComponent(container, <Fragment key={++revision}><Markup html={html} /></Fragment>);
}
export function isReactRoot(container) { return roots.has(container); }
// Dialogs and page containers may be removed by existing browser APIs.
const observer = new MutationObserver(() => {
  for (const [element, root] of [...roots]) if (!element.isConnected) { roots.delete(element); root.unmount(); }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
