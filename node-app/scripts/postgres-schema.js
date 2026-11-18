import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function postgresSchema(source) {
  const converted = source
    .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "../../generated/postgres-client"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]')
    .replace('provider = "mysql"', 'provider = "postgresql"\n  schemas = ["bitebrew"]')
    .replace('url      = env("DATABASE_URL")', 'url      = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")')
    .replaceAll('@db.DateTime(', '@db.Timestamp(');
  const extra = '\nmodel SocketIoAttachment {\n  id BigInt @id @default(autoincrement())\n  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")\n  payload Bytes @db.ByteA\n  @@map("socket_io_attachments")\n}\n';
  return '// Generated from ../schema.prisma by scripts/postgres-schema.js.\n' + (converted + extra).replace(/((?:model|enum)\s+\w+\s*\{[\s\S]*?)(\n})/g, '$1\n  @@schema("bitebrew")$2');
}
const root = path.resolve(import.meta.dirname, '..');
export async function writePostgresSchema() {
  const target = path.join(root, 'prisma/postgres/schema.prisma');
  const schema = postgresSchema(await fs.readFile(path.join(root, 'prisma/schema.prisma'), 'utf8'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, schema);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writePostgresSchema();
