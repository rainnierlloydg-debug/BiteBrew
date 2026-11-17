import { messageBox } from '../shared/message-box.js';
import { syncDrafts } from './offline-store.js';
import { toast } from './ui.js';
let installPrompt, registration, updateOffered = false;
export async function setupPwa(ctx) {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; document.querySelector('[data-install]')?.removeAttribute('hidden'); });
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' });
    const offerUpdate = () => { if (registration.waiting) { document.querySelector('#update-banner')?.removeAttribute('hidden'); if (!updateOffered) { updateOffered = true; messageBox('An app update is ready. Save your work before updating. Apply it now?', { title: 'App update available', type: 'info', confirm: true, confirmLabel: 'Update now', cancelLabel: 'Later' }).then(accepted => { if (accepted) applyUpdate(ctx); }); } } };
    registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(); }); });
    offerUpdate();
    registration.update().catch(() => {});
    navigator.serviceWorker.addEventListener('message', event => { if (event.data?.type === 'PUSH_NOTIFICATION') { window.dispatchEvent(new CustomEvent('workspace-notification', { detail: event.data })); } else if (event.data?.type === 'SYNC_AUTH_REQUIRED') ctx.sessionExpired(); else if (event.data?.type) { window.dispatchEvent(new CustomEvent('draft-sync', { detail: event.data })); ctx.updateSync(); } });
    let wasControlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!wasControlled) { wasControlled = true; return; } if (!ctx.isDirty()) window.location.reload(); else toast('An update is ready. Save your work, then reload.'); });
  } catch { toast('Offline installation is unavailable in this browser. Online features remain available.'); }
}
export async function installApp() {
  if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
  else toast('Use your browser menu → Install app / Add to Home Screen. On iPhone/iPad, use Safari → Share → Add to Home Screen.');
}
export function applyUpdate(ctx) { if (ctx.isDirty()) { toast('Save or discard your unsaved work before updating.', 'error'); return; } registration?.waiting?.postMessage({ type: 'APPLY_UPDATE' }); }
export async function scheduleSync() { try { await registration?.sync?.register('ellas-order-drafts'); } catch {} if (navigator.onLine) return syncDrafts(); }
export const syncNow = () => syncDrafts({ manual: true });
export const getRegistration = () => registration;
