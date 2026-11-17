import { mountLanding } from '/assets/react-runtime.js';
const params = new URLSearchParams(location.search);
if (params.has('page') || params.get('source') === 'pwa') {
  location.replace('/staff.html' + location.search + location.hash);
} else {
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
  mountLanding();
}
