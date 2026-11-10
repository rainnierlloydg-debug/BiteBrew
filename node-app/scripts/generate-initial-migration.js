// Generates the checked-in initial SQL from the supported constructs in schema.prisma.
// Future schema changes should use Prisma migrate dev on a development database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'), source = await fs.readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
const enums = new Map([...source.matchAll(/enum (\w+)\s*\{([^}]+)\}/g)].map(([, name, body]) => [name, body.trim().split(/\s+/)]));
const models = [...source.matchAll(/model (\w+)\s*\{([^}]+)\}/g)].map(([, name, body]) => ({ name, body, table: body.match(/@@map\("([^"]+)"\)/)?.[1] || name }));
const tables = new Map(models.map(model => [model.name, model.table]));
const quote = value => '`' + value + '`';
const indexName = value => value.length <= 60 ? value : value.slice(0, 48) + '_' + createHash('sha256').update(value).digest('hex').slice(0, 10);
const statements = ['-- Initial Node.js / Prisma MySQL schema. MySQL 8+, UTC server timezone.'];
const foreignKeys = [];
for (const model of models) {
  const columns = [], indexes = [];
  for (const line of model.body.split('\n').map(value => value.trim()).filter(value => value && !value.startsWith('//'))) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@(id|unique|index)\(\[([^\]]+)\]/); if (!match) continue;
      const fields = match[2].split(',').map(value => value.trim()), fieldList = fields.map(quote).join(', '), name = indexName(model.table + '_' + fields.join('_') + (match[1] === 'unique' ? '_key' : '_idx'));
      indexes.push(match[1] === 'id' ? `PRIMARY KEY (${fieldList})` : `${match[1] === 'unique' ? 'UNIQUE ' : ''}INDEX ${quote(name)} (${fieldList})`); continue;
    }
    const match = line.match(/^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/); if (!match) throw new Error('Unsupported schema line: ' + line);
    const [, name, type, modifier, attributes] = match;
    if (tables.has(type)) {
      const relation = attributes.match(/fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\](?:,\s*onDelete:\s*(\w+))?/);
      if (relation) { const fields = relation[1].split(',').map(value => value.trim()), references = relation[2].split(',').map(value => value.trim()); foreignKeys.push(`ALTER TABLE ${quote(model.table)} ADD CONSTRAINT ${quote(indexName(model.table + '_' + fields.join('_') + '_fkey'))} FOREIGN KEY (${fields.map(quote).join(', ')}) REFERENCES ${quote(tables.get(type))} (${references.map(quote).join(', ')}) ON DELETE ${relation[3] === 'Cascade' ? 'CASCADE' : 'RESTRICT'} ON UPDATE CASCADE;`); } continue;
    }
    let sqlType;
    if (enums.has(type)) sqlType = 'ENUM(' + enums.get(type).map(value => "'" + value + "'").join(', ') + ')';
    else if (type === 'String') sqlType = attributes.match(/@db\.Char\((\d+)\)/) ? 'CHAR(' + RegExp.$1 + ')' : attributes.match(/@db\.VarChar\((\d+)\)/) ? 'VARCHAR(' + RegExp.$1 + ')' : attributes.includes('@db.Text') ? 'TEXT' : 'VARCHAR(191)';
    else if (type === 'Int') sqlType = 'INTEGER'; else if (type === 'Boolean') sqlType = 'BOOLEAN'; else if (type === 'Json') sqlType = 'JSON'; else if (type === 'DateTime') sqlType = 'DATETIME(3)'; else if (type === 'Decimal') { const precision = attributes.match(/@db\.Decimal\((\d+),\s*(\d+)\)/); sqlType = `DECIMAL(${precision[1]},${precision[2]})`; } else throw new Error('Unsupported type: ' + type);
    let definition = `${quote(name)} ${sqlType} ${modifier === '?' ? 'NULL' : 'NOT NULL'}`;
    if (attributes.includes('@default(autoincrement())')) definition += ' AUTO_INCREMENT';
    else if (attributes.includes('@default(now())')) definition += ' DEFAULT CURRENT_TIMESTAMP(3)';
    else if (enums.has(type) && attributes.match(/@default\((\w+)\)/)) definition += " DEFAULT '" + attributes.match(/@default\((\w+)\)/)[1] + "'";
    else { const value = attributes.match(/@default\((true|false|\d+|"[^"]*")\)/)?.[1]; if (value !== undefined) definition += ' DEFAULT ' + (value === 'true' ? '1' : value === 'false' ? '0' : value.startsWith('"') ? "'" + value.slice(1, -1) + "'" : value); }
    if (/@id\b/.test(attributes)) indexes.push(`PRIMARY KEY (${quote(name)})`);
    if (/@unique\b/.test(attributes)) indexes.push(`UNIQUE INDEX ${quote(indexName(model.table + '_' + name + '_key'))} (${quote(name)})`);
    columns.push(definition);
  }
  statements.push(`CREATE TABLE ${quote(model.table)} (\n  ${[...columns, ...indexes].join(',\n  ')}\n) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;`);
}
const folder = path.join(root, 'prisma/migrations/20261108000000_initial'); await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, 'migration.sql'), statements.join('\n\n') + '\n\n' + foreignKeys.join('\n') + '\n');
await fs.writeFile(path.join(root, 'prisma/migrations/migration_lock.toml'), 'provider = "mysql"\n');
console.log(`Generated ${models.length} related MySQL tables and ${foreignKeys.length} foreign keys.`);
