import './config.js';
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient({ log: ['error'] });
export const jsonValue = value => JSON.parse(JSON.stringify(value));
