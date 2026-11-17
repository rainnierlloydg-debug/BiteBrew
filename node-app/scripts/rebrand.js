import { db } from '../server/db.js';
import { applyBranding } from '../server/services/branding.js';

try { console.log(JSON.stringify(await applyBranding())); }
catch (error) { console.error('Branding update failed:', error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
