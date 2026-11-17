import { brandText } from './brand.js';

const pending = [];
let active = null;
const titles = { info: 'Bite & Brew', success: 'Success', error: 'Something went wrong', warning: 'Please review', confirm: 'Please confirm' };

// Shared by React screens and the existing page controllers. Text is never HTML.
export function messageBox(message, { type = 'info', title = titles[type] || titles.info, confirm = false, confirmLabel = confirm ? 'Continue' : 'OK', cancelLabel = 'Cancel' } = {}) {
  const text = brandText(String(message ?? ''));
  const key = JSON.stringify([text, type, title, confirm, confirmLabel]);
  const existing = [active, ...pending].find(entry => entry?.key === key);
  if (existing) return existing.promise;
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  pending.push({ key, text, type, title, confirm, confirmLabel, cancelLabel, promise, resolve });
  queueMicrotask(openNext);
  return promise;
}

export const confirmMessage = (message, options = {}) => messageBox(message, { ...options, type: 'confirm', confirm: true });
export const showMessage = (message, type = 'info', title) => messageBox(message, { type, ...(title ? { title } : {}) });

export function clearMessageBoxes() {
  for (const entry of pending.splice(0)) entry.resolve(false);
  active?.close?.(false);
}

let validating = false;
document.addEventListener('invalid', event => {
  event.preventDefault();
  if (validating) return;
  validating = true;
  const field = event.target;
  const label = field.closest('label')?.querySelector('span')?.textContent;
  showMessage((label ? label + ': ' : '') + field.validationMessage, 'warning', 'Check your information')
    .finally(() => { validating = false; if (field.isConnected) field.focus(); });
}, true);

function openNext() {
  if (active || !pending.length) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', openNext, { once: true }); return; }
  const entry = active = pending.shift(), previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'message-box message-box-' + entry.type;
  dialog.setAttribute('role', entry.confirm || entry.type === 'error' ? 'alertdialog' : 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'message-box-title');
  dialog.setAttribute('aria-describedby', 'message-box-text');
  const symbol = document.createElement('div'); symbol.className = 'message-box-symbol'; symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = entry.confirm ? '?' : entry.type === 'error' || entry.type === 'warning' ? '!' : entry.type === 'success' ? '\u2713' : 'i';
  const title = document.createElement('h2'); title.id = 'message-box-title'; title.textContent = brandText(entry.title);
  const text = document.createElement('p'); text.id = 'message-box-text'; text.textContent = entry.text;
  const actions = document.createElement('div'); actions.className = 'message-box-actions';
  let finished = false;
  const finish = value => {
    if (finished) return; finished = true;
    if (dialog.open) dialog.close();
    dialog.remove(); active = null;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    entry.resolve(value); queueMicrotask(openNext);
  };
  entry.close = finish;
  if (entry.confirm) {
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'message-box-cancel'; cancel.dataset.messageCancel = ''; cancel.textContent = entry.cancelLabel;
    cancel.onclick = () => finish(false); actions.append(cancel);
  }
  const accept = document.createElement('button'); accept.type = 'button'; accept.dataset.messageOk = ''; accept.textContent = entry.confirmLabel; accept.onclick = () => finish(true); actions.append(accept);
  dialog.append(symbol, title, text, actions);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(!entry.confirm); });
  dialog.addEventListener('close', () => finish(!entry.confirm));
  document.body.append(dialog); dialog.showModal();
  (entry.confirm ? actions.firstElementChild : accept).focus({ preventScroll: true });
}
