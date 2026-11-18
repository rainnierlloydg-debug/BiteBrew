import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { smtpSettings } from '../server/lib/smtp-settings.js';

const root = path.resolve(import.meta.dirname, '..');
const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
export function updateEmailEnvironment(source, values) {
  let result = source;
  for (const key of keys) {
    const value = String(values[key] || '');
    if (/[\r\n]/.test(value)) throw new Error('Email settings cannot contain line breaks.');
    const quote = ["'", '`', '"'].find(mark => !value.includes(mark) && !(mark === '"' && /\\[nr]/.test(value)));
    if (!quote) throw new Error('An email setting cannot be represented safely in .env. Configure it through the server environment instead.');
    const line = key + '=' + quote + value + quote;
    const pattern = new RegExp('^' + key + '=.*$', 'gm');
    if (pattern.test(result)) result = result.replace(pattern, () => line);
    else result = result.replace(/\s*$/, '') + '\n' + line + '\n';
  }
  return result;
}
async function main() {
  if (process.argv.includes('--setup')) {
    if (process.platform !== 'win32') throw new Error('Set SMTP environment variables privately, then run npm run email:check.');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/setup-email.ps1')], { stdio: 'inherit' });
    if (result.error) throw new Error('The local email setup window could not start.');
    process.exitCode = result.status ?? 1; return;
  }
  const envPath = path.join(root, '.env');
  dotenv.config({ path: envPath, quiet: true });
  const mail = smtpSettings();
  if (!mail.configured) {
    if (mail.missing.length) console.error('Missing email settings: ' + mail.missing.join(', '));
    for (const error of mail.errors) console.error(error);
    throw new Error('Run npm run email:setup in node-app to configure a sender.');
  }
  const transport = nodemailer.createTransport(mail.options);
  try {
    await transport.verify();
  } catch (error) {
    const advice = error.code === 'EAUTH' ? 'SMTP sign-in failed. For Gmail, use a Google App Password.' : 'SMTP connection failed. Check the hostname, port, TLS settings and network access.';
    throw new Error(advice);
  } finally { transport.close(); }
  console.log('SMTP connection and authentication verified. No email was sent by this check.');
  if (process.argv.includes('--save')) {
    const source = await fs.readFile(envPath, 'utf8');
    const values = Object.fromEntries(keys.map(key => [key, process.env[key] || '']));
    values.SMTP_FROM = mail.from; values.SMTP_PORT = String(mail.options.port); values.SMTP_SECURE = String(mail.options.secure);
    if (mail.options.auth) values.SMTP_PASS = mail.options.auth.pass;
    const temporary = envPath + '.email-setup-tmp';
    await fs.writeFile(temporary, updateEmailEnvironment(source, values), { mode: 0o600 });
    await fs.rename(temporary, envPath);
    const statusPath = path.resolve(root, '../.runtime/email-setup-result.json');
    await fs.mkdir(path.dirname(statusPath), { recursive: true });
    await fs.writeFile(statusPath, JSON.stringify({ status: 'configured', verifiedAt: new Date().toISOString() }));
    console.log('Email settings saved privately. Restart the application to load them.');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
