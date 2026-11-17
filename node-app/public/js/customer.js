// Versioned entry avoids the former separate login bundle in an older offline cache.
import { mountCustomer } from '/assets/react-runtime.js?shared-login=4';
mountCustomer();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' }).then(registration => {
    const activate = () => registration.waiting?.postMessage({ type: 'APPLY_UPDATE' });
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', activate));
    activate(); registration.update().catch(() => {});
  }).catch(() => {});
}
