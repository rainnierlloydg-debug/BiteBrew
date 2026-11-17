export function pushTarget(value, origin) {
  const fallback = '/staff.html?page=notifications';
  try {
    const url = new URL(typeof value === 'string' ? value : fallback, origin);
    if (url.origin !== origin || !['/', '/staff.html'].includes(url.pathname)) return fallback;
    const page = url.searchParams.get('page');
    if (!['dashboard', 'orders', 'kitchen', 'payments', 'notifications'].includes(page)) return fallback;
    const params = new URLSearchParams({ page });
    for (const key of ['order', 'request']) {
      const id = url.searchParams.get(key);
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) params.set(key, id);
    }
    return '/staff.html?' + params;
  } catch { return fallback; }
}
