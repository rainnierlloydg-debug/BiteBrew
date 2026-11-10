// Validates checked-in SQL against real MySQL without requiring Prisma packages.
// Creates and drops only its own randomly named temporary schema.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const name = 'ellas_node_schema_' + randomUUID().replaceAll('-', '').slice(0, 12) + '_test';
const args = ['--host=' + (process.env.MYSQL_SETUP_HOST || '127.0.0.1'), '--port=' + (process.env.MYSQL_SETUP_PORT || '3308'), '--user=' + (process.env.MYSQL_SETUP_USER || 'root'), '--batch', '--skip-column-names'];
const run = sql => { const result = spawnSync(process.env.MYSQL_BINARY || 'mysql', args, { input: sql, encoding: 'utf8', env: { ...process.env, MYSQL_PWD: process.env.MYSQL_SETUP_PASSWORD || '' } }); if (result.status !== 0) throw new Error('MySQL schema check failed: ' + (result.error?.code || result.stderr)); return result.stdout.trim(); };
let created = false;
try {
  run('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'); created = true;
  run('USE `' + name + '`;\n' + fs.readFileSync('prisma/migrations/20261108000000_initial/migration.sql', 'utf8'));
  const tables = Number(run("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + name + "';"));
  const foreignKeys = Number(run("SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='" + name + "';"));
  assert.equal(tables, 25); assert.equal(foreignKeys, 32);
  assert.equal(run("SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='" + name + "' AND CONSTRAINT_NAME='payments_orderId_fkey';"), 'RESTRICT');
  assert.equal(run("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + name + "' AND TABLE_NAME='orders' AND COLUMN_NAME='status';"), 'PENDING');
  const evidence = { checkedAt: new Date(), engine: run('SELECT VERSION();'), tables, foreignKeys, transactionDelete: 'RESTRICT', scope: 'Initial SQL migration only; Prisma client and API integration not tested' };
  fs.mkdirSync('docs/verification-artifacts', { recursive: true }); fs.writeFileSync('docs/verification-artifacts/schema-result.json', JSON.stringify(evidence, null, 2)); console.log('Real MySQL migration passed: 25 tables, 32 foreign keys, enum default and transaction deletion protection.');
} finally { if (created) run('DROP DATABASE `' + name + '`;'); }
