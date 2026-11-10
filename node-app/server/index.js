import { createApplication } from './app.js';
import { config } from './config.js';
try {
  const application = await createApplication();
  application.server.listen(config.port, config.host, () => console.log(`Bite & Brew is running at ${config.origin}`));
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; const timeout = setTimeout(() => process.exit(1), 10000); timeout.unref(); await application.close(); clearTimeout(timeout); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch (error) { console.error('Startup failed. Check the Node environment, installed dependencies and MySQL migrations. Error:', error.code || error.name); process.exitCode = 1; }
