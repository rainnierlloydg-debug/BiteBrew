let csrf = null;
let accountId = null;
export const setAccount = value => { accountId = value; };
export class ApiFailure extends Error { constructor(status, error) { super(error?.message || 'The request failed.'); this.status = status; this.code = error?.code; this.details = error?.details; } }
export const csrfToken = () => csrf;
export function setCsrf(value) { csrf = value; }
export async function api(url, { method = 'GET', data, operationId, signal, authEvent = true } = {}) {
  let response;
  try {
    response = await fetch('/api' + url, { method, credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json', ...(accountId && !['/session', '/login'].includes(url) ? { 'X-Account-ID': accountId } : {}), ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(method !== 'GET' && method !== 'DELETE' ? { 'X-Operation-ID': operationId || crypto.randomUUID() } : {}) }, body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data) });
  } catch (error) { if (error.name === 'AbortError') throw error; throw new ApiFailure(0, { code: 'OFFLINE', message: 'Connection unavailable. Your local drafts are kept on this device.' }); }
  const result = await response.json().catch(() => ({ error: { code: 'INVALID_RESPONSE', message: 'The response was interrupted. Retry using the same operation ID.' } }));
  if (!response.ok) { if (authEvent && [401, 419].includes(response.status)) window.dispatchEvent(new CustomEvent('auth-expired')); throw new ApiFailure(response.status, result.error); }
  if (result.data?.csrf) csrf = result.data.csrf;
  return result;
}
export const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== '')).toString();
export function operation() { let key = null, signature = null; return async (url, data, method = 'POST') => { const next = JSON.stringify([url, data, method]); if (signature !== next) { key = crypto.randomUUID(); signature = next; } const result = await api(url, { method, data, operationId: key }); key = null; signature = null; return result.data; }; }
export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP picture.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a picture smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 25_000_000) { bitmap.close(); throw new Error('Choose an image with fewer than 25 million pixels.'); }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
  if (!blob || blob.size > 1.5 * 1024 * 1024) throw new Error('This image is still too large. Choose a smaller picture.');
  return new File([blob], 'picture.webp', { type: 'image/webp' });
}
