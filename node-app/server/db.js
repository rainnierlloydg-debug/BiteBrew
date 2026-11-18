import './config.js';
import { prismaDatabaseUrl } from './lib/postgres.js';
export const postgres = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '');
const client = postgres ? await import('../generated/postgres-client/index.js') : await import('@prisma/client');
const { PrismaClient } = client;
export const Prisma = client.Prisma;
export const db = new PrismaClient({ log: ['error'], ...(postgres ? { datasources: { db: { url: prismaDatabaseUrl(process.env.DATABASE_URL) } } } : {}) });
export const jsonValue = value => JSON.parse(JSON.stringify(value));
export const textSearch = contains => ({ contains, ...(postgres ? { mode: 'insensitive' } : {}) });
