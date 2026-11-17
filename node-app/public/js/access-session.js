import { unlockWorkspace } from './workspace-session.js';
import { api, setAccount } from './api.js';
import { activeUser, listDrafts, clearPrivateData, setActiveUser } from './offline-store.js';
import { confirmMessage } from '../shared/message-box.js';

export function staffDestination(user) {
  return user.role === 'KITCHEN' ? '/staff.html?page=kitchen' : user.role === 'CASHIER' ? '/staff.html?page=pos' : '/staff.html?page=dashboard';
}

export async function prepareAccountSession(session) {
  const account = session.user || session.customer;
  if (!account) return;
  const previous = await activeUser().catch(() => null);
  if (previous && previous.id !== session.user?.id) {
    const drafts = (await listDrafts(previous.id)).filter(draft => draft.status !== 'SYNCED');
    if (drafts.length && !(await confirmMessage(`Switching accounts will clear ${drafts.length} unsynchronized draft(s) from the previous account on this device. Continue?`, { title: 'Switch account?', confirmLabel: 'Switch account' }))) {
      await api(session.user ? '/logout' : '/customer/logout', { method: 'POST', data: {}, authEvent: false });
      setAccount(null);
      await api('/session', { authEvent: false });
      throw new Error('Sign-in canceled. Sign in to the original account to keep working on its drafts.');
    }
    await clearPrivateData(previous.id);
  }
  if (session.user) { await setActiveUser(session.user); await unlockWorkspace(); }
  setAccount(account.id);
}
