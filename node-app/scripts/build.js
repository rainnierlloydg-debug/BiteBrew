import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const logo = path.join(root, 'public/icons/brand-logo.png');
await fs.mkdir(path.join(root, 'public/icons'), { recursive: true });
for (const size of [192, 512]) {
  await sharp(logo).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(root, `public/icons/icon-${size}.png`));
}
const hash = createHash('sha256'); let count = 0;
async function collect(folder) { for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const file = path.join(folder, entry.name); if (entry.isDirectory()) await collect(file); else if (entry.name !== 'sw.js') { hash.update(path.relative(root, file)); hash.update(await fs.readFile(file)); count++; } } }
await collect(path.join(root, 'public'));
const workerPath = path.join(root, 'public/sw.js'); let worker = await fs.readFile(workerPath, 'utf8');
for (const match of worker.matchAll(/'((?:\/css|\/js|\/shared|\/icons|\/index|\/offline|\/manifest)[^']*)'/g)) await fs.access(path.join(root, 'public', match[1]));
worker = worker.replace(/const VERSION = '[^']+';/, `const VERSION = 'ellas-shell-${hash.digest('hex').slice(0, 16)}';`);
await fs.writeFile(workerPath, worker);
console.log(`Prepared ${count} public assets, PNG app icons, and a versioned service-worker cache. No frontend framework or bundler is used.`);
