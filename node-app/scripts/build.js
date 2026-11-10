import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root, 'public/assets'), { recursive: true });
const reactBuild = {
  absWorkingDir: root,
  entryPoints: ['./frontend/runtime.jsx'],
  outfile: path.join(root, 'public/assets/react-runtime.js'),
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  target: ['es2022'], minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['/js/*', '/shared/*'],
  tsconfigRaw: {},
  logLevel: 'silent',
};
try { await build(reactBuild); }
catch (error) {
  if (!error.errors?.some(item => /access is denied|permission denied/i.test(item.text))) throw error;
  // Some restricted Windows hosts allow Node file access but block native
  // directory traversal. Resolve/load through Node on those hosts only.
  await build({ ...reactBuild, plugins: [{ name: 'node-filesystem', setup(builder) {
    builder.onResolve({ filter: /.*/ }, async args => {
      if (/^\/(?:js|shared)\//.test(args.path)) return { path: args.path, external: true };
      const folder = args.resolveDir || root;
      const resolved = args.path.startsWith('.') || path.isAbsolute(args.path)
        ? path.resolve(folder, args.path)
        : createRequire(path.join(folder, '__build__.js')).resolve(args.path);
      return { path: resolved, namespace: 'node-source' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'node-source' }, async args => ({
      contents: await fs.readFile(args.path, 'utf8'), resolveDir: path.dirname(args.path),
      loader: args.path.endsWith('.jsx') ? 'jsx' : args.path.endsWith('.json') ? 'json' : 'js',
    }));
  } }] });
}
const logo = path.join(root, 'public/icons/brand-logo.png');
await fs.mkdir(path.join(root, 'public/icons'), { recursive: true });
for (const size of [192, 512]) {
  await sharp(logo).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(root, `public/icons/icon-${size}.png`));
}
const hash = createHash('sha256'); let count = 0;
async function collect(folder) { for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const file = path.join(folder, entry.name); if (entry.isDirectory()) await collect(file); else if (entry.name !== 'sw.js') { hash.update(path.relative(root, file)); hash.update(await fs.readFile(file)); count++; } } }
await collect(path.join(root, 'public'));
const workerPath = path.join(root, 'public/sw.js'); let worker = await fs.readFile(workerPath, 'utf8');
for (const match of worker.matchAll(/'((?:\/assets|\/css|\/js|\/shared|\/icons|\/images|\/customer|\/index|\/offline|\/manifest)[^']*)'/g)) await fs.access(path.join(root, 'public', match[1]));
worker = worker.replace(/const VERSION = '[^']+';/, `const VERSION = 'ellas-shell-${hash.digest('hex').slice(0, 16)}';`);
await fs.writeFile(workerPath, worker);
console.log(`Built the React frontend and prepared ${count} public assets, PNG icons, and a versioned service-worker cache.`);
