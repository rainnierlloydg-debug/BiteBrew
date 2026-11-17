export const BRAND = Object.freeze({
  name: 'Bite & Brew',
  systemName: 'Bite & Brew Order and Sales Management System',
  tagline: 'Good bites. Better sips.',
});

// Normalize former branding when displaying saved settings and order snapshots.
export function brandText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/ella[’']?s\s+pizza/gi, BRAND.name)
    .replace(/ella[’']?s\s+best/gi, 'Bite & Brew Special');
}

export function brandBusiness(business = {}) {
  const legacy = /ella[’']?s\s+pizza/i.test(business.name || '');
  return { ...business, name: brandText(business.name), systemName: brandText(business.systemName),
    footer: brandText(business.footer), ...(legacy ? { logo: null, orderPrefix: 'BB' } : {}) };
}
