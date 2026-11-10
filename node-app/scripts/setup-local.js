import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import { spawnSync } from 'node:child_process';
import { root } from '../server/config.js';

const envPath = path.join(root, '.env');
try { await fs.access(envPath); throw new Error('node-app/.env already exists. Existing credentials were preserved; use db:deploy for migrations.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const host = process.env.MYSQL_SETUP_HOST || '127.0.0.1', port = Number(process.env.MYSQL_SETUP_PORT || 3308);
const connection = await mysql.createConnection({ host, port, user: process.env.MYSQL_SETUP_USER || 'root', password: process.env.MYSQL_SETUP_PASSWORD || '', multipleStatements: false });
const credentials = [];
try {
  for (const [database, username] of [['ellas_pizza_node', 'ellas_node'], ['ellas_pizza_node_test', 'ellas_node_test']]) {
    const [databases] = await connection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
    const [users] = await connection.execute('SELECT User FROM mysql.user WHERE User = ?', [username]);
    if (databases.length || users.length) throw new Error('A Node target database or account already exists. Configure credentials manually; setup preserves existing records and accounts.');
  }
  for (const [database, username] of [['ellas_pizza_node', 'ellas_node'], ['ellas_pizza_node_test', 'ellas_node_test']]) {
    const [existing] = await connection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
    if (existing.length) throw new Error('A target database already exists. Configure its credentials manually; setup never resets existing databases.');
    const password = randomBytes(32).toString('hex');
    await connection.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query("CREATE USER '" + username + "'@'127.0.0.1' IDENTIFIED BY ?", [password]);
    await connection.query("GRANT ALL PRIVILEGES ON `" + database + "`.* TO '" + username + "'@'127.0.0.1'");
    credentials.push(`mysql://${username}:${password}@${host}:${port}/${database}`);
  }
} finally { await connection.end(); }
const vapid = webpush.generateVAPIDKeys();
let template = await fs.readFile(path.join(root, '.env.example'), 'utf8');
for (const [key, value] of Object.entries({ DATABASE_URL: credentials[0], TEST_DATABASE_URL: credentials[1], SESSION_SECRET: randomBytes(64).toString('hex'), VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey })) template = template.replace(new RegExp('^' + key + '=.*$', 'm'), key + '=' + value);
await fs.writeFile(envPath, template, { mode: 0o600, flag: 'wx' });
console.log('Separate local Node databases and private environment credentials created. The previous application database was not changed.');
const executable = process.platform === 'win32' ? 'node_modules/prisma/build/index.js' : 'node_modules/prisma/build/index.js';
for (const args of [['generate'], ['migrate', 'deploy']]) { const result = spawnSync(process.execPath, [executable, ...args], { cwd: root, stdio: 'inherit' }); if (result.status) process.exit(result.status || 1); }
console.log('Next: npm run import:legacy, or npm run admin and npm run seed:menu for a fresh installation.');
