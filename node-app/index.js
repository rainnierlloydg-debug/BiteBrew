// Vercel entry: export the HTTP server so Socket.IO can handle upgrades.
import express from 'express';
import { waitUntil } from '@vercel/functions';
import { createApplication } from './server/app.js';
const application = await createApplication({ app: express(), jobs: false, background: waitUntil });
export default application.server;
