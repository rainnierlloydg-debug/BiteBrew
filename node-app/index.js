// Vercel entry: export the HTTP server so Socket.IO can handle upgrades.
import { waitUntil } from '@vercel/functions';
import { createApplication } from './server/app.js';
const application = await createApplication({ jobs: false, background: waitUntil });
export default application.server;
