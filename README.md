# Bite & Brew Order and Sales Management System

The new application is in **[node-app](node-app/README.md)**: Node.js / Express, MySQL / Prisma and React, with a green glassmorphism staff interface. The root npm scripts delegate to it. The frontend uses React; Laravel is not used at runtime.

```powershell
cd node-app
npm install
npm run build
npm run setup:local
npm run import:legacy
npm start
```

Local setup creates separate Node databases, leaving the existing application database untouched. For a fresh installation, replace `import:legacy` with `npm run admin` and `npm run seed:menu`. Open **http://127.0.0.1:3000**, using the configured origin.

**Current status:** Node dependencies are installed. The automated suite passes all 35 tests, including real MySQL/API, role restrictions, payments/refunds, reports and authenticated WebSocket checks. Live push delivery, restore drills and deployment-specific checks remain outstanding. Installation, external requirements and exact limitations are documented in [node-app/README.md](node-app/README.md) and [verification](node-app/docs/VERIFICATION.md).

Laravel application source, entry points, Composer manifests, the Vite config and the old React/Vite npm packages have been removed. The preserved business media/attachments/backups and source database connection settings are private in `node-app/var/import`. The original MySQL database files remain unchanged in `.runtime/mysql-data`.

Automatic approval review blocked recursive directory deletion, so remaining PHP vendor/cache files and legacy directories are hidden in VS Code Explorer and search. The checked cleanup script is [node-app/scripts/remove-legacy.ps1](node-app/scripts/remove-legacy.ps1); run it in a local PowerShell environment that permits local scripts to finish permanent folder removal. It verifies preserved business files and refuses to delete Node source or MySQL storage. PowerShell script execution is also disabled in the agent environment, so that final directory cleanup has not run here.
