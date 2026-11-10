const databaseName = 'ellas-pizza-offline-v2';
export async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { const db = request.result; const drafts = db.createObjectStore('drafts', { keyPath: 'id' }); drafts.createIndex('userId', 'userId'); db.createObjectStore('cache', { keyPath: 'key' }); db.createObjectStore('meta', { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function operation(store, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode); let result;
    const request = action(transaction.objectStore(store));
    if (request) { request.onsuccess = () => { result = request.result; }; request.onerror = () => reject(request.error); }
    transaction.oncomplete = () => { db.close(); resolve(result); }; transaction.onerror = () => { db.close(); reject(transaction.error); }; transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Local operation was interrupted.')); };
  });
}
export const activeUser = () => operation('meta', 'readonly', store => store.get('activeUser')).then(row => row?.value || null);
export async function setActiveUser(user, onlyIfActive = false) {
  const value = user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions } : null;
  if (!onlyIfActive) return operation('meta', 'readwrite', store => store.put({ key: 'activeUser', value }));
  const db = await database();
  try { await new Promise((resolve, reject) => { const transaction = db.transaction('meta', 'readwrite'), store = transaction.objectStore('meta'), request = store.get('activeUser'); request.onsuccess = () => { if (request.result?.value?.id === user?.id) store.put({ key: 'activeUser', value }); }; transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); } finally { db.close(); }
}
export const cached = (userId, name) => operation('cache', 'readonly', store => store.get(userId + ':' + name));
export async function cacheData(userId, name, value) {
  const db = await database();
  try { await new Promise((resolve, reject) => {
    const transaction = db.transaction(['meta', 'cache'], 'readwrite');
    const request = transaction.objectStore('meta').get('activeUser');
    request.onsuccess = () => { if (request.result?.value?.id === userId) transaction.objectStore('cache').put({ key: userId + ':' + name, userId, value, syncedAt: new Date().toISOString() }); };
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  }); } finally { db.close(); }
}
export const listDrafts = userId => operation('drafts', 'readonly', store => store.index('userId').getAll(userId)).then(rows => rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
export const getDraft = id => operation('drafts', 'readonly', store => store.get(id));
export async function saveDraft(draft, { allowUnqueue = false } = {}) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['meta', 'drafts'], 'readwrite'), userRequest = transaction.objectStore('meta').get('activeUser');
    let failure;
    userRequest.onsuccess = () => {
      if (userRequest.result?.value?.id !== draft.userId) { failure = new Error('The local account changed. Sign in to the original account.'); transaction.abort(); return; }
      const store = transaction.objectStore('drafts'), existing = store.get(draft.id);
      existing.onsuccess = () => {
        if (existing.result?.status === 'SYNCED' && draft.status !== 'SYNCED') failure = new Error('This draft has already become an official order.');
        if (!allowUnqueue && ['QUEUED', 'SYNCING'].includes(existing.result?.status) && ['LOCAL', 'NEEDS_REVIEW'].includes(draft.status) && existing.result.operationId !== draft.operationId) failure = new Error('Wait for synchronization before changing this draft.');
        if (!allowUnqueue && ['QUEUED', 'SYNCING'].includes(existing.result?.status) && draft.status === 'LOCAL') failure = new Error('Unqueue this draft before editing it.');
        if (failure) transaction.abort(); else store.put({ ...draft, updatedAt: new Date().toISOString() });
      };
    };
    transaction.oncomplete = resolve; transaction.onabort = () => reject(failure || transaction.error); transaction.onerror = () => reject(transaction.error);
  }); db.close();
  return draft;
}
export async function deleteDraft(userId, id) { const draft = await getDraft(id); if (draft?.userId === userId) { if (['QUEUED', 'SYNCING'].includes(draft.status)) throw new Error('Unqueue this draft before deleting it, or wait for synchronization to finish.'); await operation('drafts', 'readwrite', store => store.delete(id)); } }
export async function clearPrivateData(userId) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'cache', 'meta'], 'readwrite');
    for (const name of ['drafts', 'cache']) { const request = transaction.objectStore(name).openCursor(); request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value.userId === userId) cursor.delete(); cursor.continue(); }; }
    transaction.objectStore('meta').delete('activeUser'); transaction.objectStore('meta').delete('syncLease'); transaction.objectStore('meta').delete('syncStatus');
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
  }); db.close();
  if ('caches' in self) await caches.delete('ellas-private-' + userId);
}
async function notify(message) {
  if ('clients' in self) for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage(message);
  else self.dispatchEvent(new CustomEvent('draft-sync', { detail: message }));
}
async function lease() {
  const db = await database(), token = crypto.randomUUID();
  const accepted = await new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite'), store = transaction.objectStore('meta'), request = store.get('syncLease'); let acquired = false;
    request.onsuccess = () => { if (!request.result || request.result.expiresAt < Date.now()) { store.put({ key: 'syncLease', token, expiresAt: Date.now() + 180000 }); acquired = true; } };
    transaction.oncomplete = () => resolve(acquired); transaction.onerror = () => reject(transaction.error);
  }); db.close(); return accepted ? token : null;
}
export async function pauseDraft(userId, id) {
  const token = await lease(); if (!token) throw new Error('Synchronization is running. Wait for it to finish before editing or unqueuing drafts.');
  try { const draft = await getDraft(id); if (!draft || draft.userId !== userId || draft.status === 'SYNCED') throw new Error('This draft is unavailable or already submitted.'); await saveDraft({ ...draft, status: 'LOCAL' }, { allowUnqueue: true }); }
  finally { const current = await operation('meta', 'readonly', store => store.get('syncLease')); if (current?.token === token) await operation('meta', 'readwrite', store => store.delete('syncLease')); }
}
export async function syncDrafts({ manual = false } = {}) {
  const token = await lease(); if (!token) return { running: true };
  try {
    const user = await activeUser(); if (!user) return { paused: true };
    let session;
    try { const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' }); if (!response.ok) throw new Error('Session unavailable'); session = (await response.json()).data; } catch { return { offline: true }; }
    if (!session.user || session.user.id !== user.id) { await notify({ type: 'SYNC_AUTH_REQUIRED' }); return { paused: true }; }
    const drafts = await listDrafts(user.id);
    for (const original of drafts) {
      if ((await activeUser())?.id !== user.id) break;
      if (!['QUEUED', 'SYNCING'].includes(original.status) || (!manual && original.nextAttemptAt > Date.now())) continue;
      const latest = await getDraft(original.id);
      if (!latest || !['QUEUED', 'SYNCING'].includes(latest.status)) continue;
      let draft = { ...latest, status: 'SYNCING' };
      await saveDraft(draft); await notify({ type: 'SYNC_CHANGED', id: draft.id });
      try {
        const response = await fetch('/api/orders', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, 'X-Operation-ID': draft.operationId }, body: JSON.stringify(draft.payload) });
        const result = await response.json().catch(() => ({ error: { code: 'RESPONSE_LOST', message: 'The server response could not be read. Retry safely with the same operation ID.' } }));
        if ((await activeUser())?.id !== user.id) break;
        if ([401, 419].includes(response.status)) { await saveDraft({ ...draft, status: 'QUEUED', error: 'Sign in to resume synchronization.' }); await notify({ type: 'SYNC_AUTH_REQUIRED' }); break; }
        if (response.ok && !result.data?.number) throw new Error('The acceptance response was interrupted. Retrying with the same operation ID is safe.');
        if (response.ok && result.data?.number) {
          await saveDraft({ id: draft.id, userId: user.id, operationId: draft.operationId, status: 'SYNCED', officialId: result.data.id, officialNumber: result.data.number, syncedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), total: result.data.total });
          await notify({ type: 'ORDER_ACCEPTED', id: draft.id, orderId: result.data.id, number: result.data.number });
        } else if (response.status >= 500 || [408, 429].includes(response.status)) throw new Error(result.error?.message || 'Temporary server failure.');
        else await saveDraft({ ...draft, status: 'NEEDS_REVIEW', error: result.error?.message || 'Review the draft before resubmission.', conflict: result.error?.details || null });
      } catch (error) {
        if ((await activeUser())?.id !== user.id) break;
        const attempts = (manual ? 0 : draft.attempts || 0) + 1;
        await saveDraft({ ...draft, status: attempts >= 5 ? 'NEEDS_REVIEW' : 'QUEUED', attempts, nextAttemptAt: Date.now() + Math.min(300000, 10000 * 2 ** attempts), error: attempts >= 5 ? 'Retry limit reached. Review this draft and retry manually.' : error.message });
      }
      await notify({ type: 'SYNC_CHANGED', id: draft.id });
    }
    return { finished: true };
  } finally {
    const current = await operation('meta', 'readonly', store => store.get('syncLease'));
    if (current?.token === token) await operation('meta', 'readwrite', store => store.delete('syncLease'));
  }
}
