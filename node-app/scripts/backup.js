import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, config } from '../server/config.js';
import { encodeBackup, decodeBackup } from '../server/lib/backup-codec.js';

const restore = process.argv[2] === '--restore', argument = process.argv[restore ? 3 : 2];
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase || passphrase.length < 20) throw new Error('Set BACKUP_PASSPHRASE privately to at least 20 characters.');
const url = new URL(restore ? process.env.RESTORE_DATABASE_URL || '' : process.env.DATABASE_URL || '');
if (restore && (!url.pathname.endsWith('_restore') || url.href === new URL(process.env.DATABASE_URL).href)) throw new Error('Restore requires a different, empty, migrated database whose name ends in _restore.');
const hash = value => createHash('sha256').update(value).digest('hex');
const schema = await fs.readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
const expected = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map(match => match[1]).filter(name => name !== 'sessions');
const connection = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), dateStrings: true, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true });
try {
  if (!restore) {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const tables = {};
    for (const table of expected) { tables[table] = (await connection.query('SELECT * FROM `' + table + '`'))[0]; if (tables[table].length > 100000) throw new Error('Use mysqldump and a filesystem snapshot for databases over 100,000 rows per table.'); }
    await connection.commit();
    const files = [];
    await fs.mkdir(config.uploads, { recursive: true });
    for (const item of await fs.readdir(config.uploads, { withFileTypes: true })) { if (!item.isFile() || !/^[a-zA-Z0-9._-]+$/.test(item.name)) continue; const bytes = await fs.readFile(path.join(config.uploads, item.name)); files.push({ name: item.name, data: bytes.toString('base64'), hash: hash(bytes) }); }
    const value = { version: 2, schemaHash: hash(schema), createdAt: new Date().toISOString(), timezone: 'UTC', tables, files };
    if (Buffer.byteLength(JSON.stringify(value)) > 200 * 1024 * 1024) throw new Error('Use mysqldump and a filesystem snapshot for backups above 200 MB.');
    const destination = path.resolve(root, argument || 'var/backups/ellas-' + new Date().toISOString().replaceAll(':', '-') + '.epbackup');
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, encodeBackup(value, passphrase), { mode: 0o600, flag: 'wx' });
    console.log('Encrypted backup saved:', destination); console.log('Includes business tables and uploaded media; active sessions and environment secrets are excluded.');
  } else {
    if (!argument) throw new Error('Usage: npm run restore -- path/to/file.epbackup');
    const value = decodeBackup(await fs.readFile(path.resolve(root, argument)), passphrase);
    if (value.version !== 2 || value.schemaHash !== hash(schema) || Object.keys(value.tables).sort().join() !== [...expected].sort().join()) throw new Error('Backup schema does not match this application release. Restore with the matching source version.');
    for (const table of [...expected, 'sessions']) if ((await connection.query('SELECT COUNT(*) AS count FROM `' + table + '`'))[0][0].count > 0) throw new Error('Restore target contains records; no records were changed.');
    const destination = path.resolve(root, process.env.RESTORE_UPLOAD_DIR || './var/restore-uploads');
    if (destination === config.uploads) throw new Error('Use a separate RESTORE_UPLOAD_DIR; preserve the active media directory.');
    await fs.mkdir(destination, { recursive: true });
    for (const file of value.files) { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name) || file.name.includes('..')) throw new Error('Invalid media filename.'); const bytes = Buffer.from(file.data, 'base64'); if (hash(bytes) !== file.hash) throw new Error('Media checksum failed.'); try { await fs.writeFile(path.join(destination, file.name), bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST' || hash(await fs.readFile(path.join(destination, file.name))) !== file.hash) throw error; } }
    await connection.query('SET FOREIGN_KEY_CHECKS = 0'); await connection.beginTransaction();
    try {
      for (const table of expected) {
        const columns = new Set((await connection.query('SHOW COLUMNS FROM `' + table + '`'))[0].map(column => column.Field));
        for (const row of value.tables[table]) { const keys = Object.keys(row); if (!keys.length || keys.some(key => !columns.has(key))) throw new Error('Backup columns do not match.'); await connection.query('INSERT INTO `' + table + '` (' + keys.map(key => '`' + key + '`').join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')', keys.map(key => typeof row[key] === 'object' && row[key] !== null ? JSON.stringify(row[key]) : row[key])); }
      }
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; } finally { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); }
    console.log('Restored into the separate database and media directory. Verify reports before switching application configuration. All sessions must sign in again.');
  }
} finally { await connection.end(); }
