import { api, setAccount, setCsrf } from './api.js';
import { setWorkspaceLocked, workspaceLocked } from './offline-store.js';

const key = 'bite-brew-workspace-locked';
export function workspaceLocallyLocked() {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}
export const isWorkspaceLocked = async () => workspaceLocallyLocked() || await workspaceLocked();
export async function unlockWorkspace() {
  await setWorkspaceLocked(false);
  try { localStorage.removeItem(key); } catch {}
}
let closing;
export function closeWorkspaceFromLanding() {
  // Lock immediately, including if the visitor goes Back before the request completes.
  try { localStorage.setItem(key, String(Date.now())); } catch {}
  if (closing) return closing;
  closing = (async () => {
    await setWorkspaceLocked(true);
    const session = (await api('/session', { authEvent: false })).data;
    if (session.user) await api('/logout', { method: 'POST', data: {}, authEvent: false });
    setAccount(null); setCsrf(null);
  })().finally(() => { closing = null; });
  return closing;
}
export const workspaceLockKey = key;
