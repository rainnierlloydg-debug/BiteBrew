import '../server/config.js';
import { spawnSync } from 'node:child_process';
import { writePostgresSchema } from './postgres-schema.js';
if (!/^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') || !process.env.DIRECT_URL) throw new Error('Set PostgreSQL DATABASE_URL and DIRECT_URL before building.');
await writePostgresSchema();
for (const args of [['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/postgres/schema.prisma'], ['scripts/build.js']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
