import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
const folders = ['server', 'public/js', 'public/shared', 'scripts', 'tests'];
let failed = false, count = 0;
function check(folder) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.js')) { count++; const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status) { failed = true; process.stderr.write(result.stderr); } }
  }
}
for (const folder of folders) check(folder);
function checkReact(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) checkReact(file);
    else if (file.endsWith('.jsx')) {
      count++;
      try { transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', jsx: 'automatic', sourcefile: file }); }
      catch (error) { failed = true; process.stderr.write(error.message + '\n'); }
    }
  }
}
checkReact('frontend');
if (fs.existsSync('public/sw.js')) { const result = spawnSync(process.execPath, ['--check', 'public/sw.js'], { encoding: 'utf8' }); if (result.status) { failed = true; process.stderr.write(result.stderr); } count++; }
console.log(`Checked ${count} JavaScript source files.`); process.exitCode = failed ? 1 : 0;
