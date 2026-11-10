const element = document.querySelector('.document');
document.querySelector('#print-document')?.addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const session = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' }).then(response => response.json());
    const response = await fetch('/api/documents/' + encodeURIComponent(element.dataset.order) + '/printed', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.data.csrf }, body: JSON.stringify({ kind: element.dataset.kind }) });
    if (!response.ok) throw new Error('Your session expired or printing is not permitted. Return to the workspace and sign in again.');
    window.print();
  } catch (error) { document.querySelector('#document-error').textContent = error.message; } finally { button.disabled = false; }
});
