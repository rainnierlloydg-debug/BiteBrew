# Installation, deployment and recovery

## Production operation

Use Node 22.12+ and MySQL 8 with utf8mb4, InnoDB and UTC time. Install dependencies on the target platform so Sharp and Prisma use compatible native binaries. After the first successful install, retain the generated `package-lock.json` and use `npm ci` for repeatable deployments. Exact top-level dependencies are pinned; a resolved Node lockfile could not be generated while registry downloads were blocked here.

Run `npm run db:generate`, `npm run db:deploy`, `npm run build`, then `npm start`. Provision credentials through private environment configuration. Do not expose `.env`, `var`, `data`, database backups or Prisma files as static website directories. Only `public` is publicly served. Product media requires a signed-in session. Persist the configured media directory across releases; ephemeral filesystem storage will lose uploads.

Run one supervised Node process initially. It hosts Express, Socket.IO, overdue notifications and the push delivery loop. Restart gracefully with SIGTERM; allow at least 10 seconds. Multiple processes require shared rate limiting, a Socket.IO adapter, scheduled-job coordination, and tests of the shared session/notification behavior. MySQL row transactions and durable idempotency remain authoritative.

Example Nginx reverse proxy (replace hostname/certificate paths):

```nginx
server {
    listen 443 ssl;
    server_name pizza.example.com;
    ssl_certificate /etc/ssl/pizza/fullchain.pem;
    ssl_certificate_key /etc/ssl/pizza/privkey.pem;
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
    }
}
```

Redirect HTTP to HTTPS separately. Set `NODE_ENV=production`, `APP_ORIGIN=https://pizza.example.com`, `TRUST_PROXY=1`. Restrict direct access to port 3000. The proxy must support WebSocket upgrades; the app intentionally does not fall back to Socket.IO polling. Keep browser and API on the same origin.

Check `/health`, login, a permitted menu request, a real order/payment workflow and an authenticated WebSocket connection after deployment. Avoid logging request cookies, passwords, push secrets or full payment/customer payloads. Keep dependencies patched and retain source/migration versions with each release.

## Encrypted application backup

Set a private `BACKUP_PASSPHRASE` of at least 20 characters in the process environment, then run:

```powershell
npm run backup
# Or choose a new destination; existing files are never overwritten.
npm run backup -- var/backups/selected.epbackup
```

The script reads a consistent MySQL snapshot and uploaded media, compresses and encrypts with AES-256-GCM using a scrypt-derived key, and writes a private `.epbackup`. It includes financial records, staff password hashes, idempotency and audit data. It excludes active sessions and environment credentials. Keep the passphrase, `.env`/VAPID keys, application source and release version in separate protected recovery storage. Rotate backups and retain offline copies. For a fully consistent database-and-media point in time, pause writes/uploads during backup.

The built-in backup is for a small shop: ≤100,000 rows per table and ≤200 MB JSON before compression. Larger installations should use MySQL `mysqldump --single-transaction` or provider snapshots plus a synchronized media snapshot and separate encrypted secret recovery. Test restores; a backup file alone is not proof of recoverability.

## Restore drill

1. Keep the active system intact. Create a **different empty database ending `_restore`** and a separate MySQL account.
2. On the matching source release, temporarily point `DATABASE_URL` to the restore database and run `npm run db:deploy`; restore the original `DATABASE_URL` afterwards. Do not migrate an older backup with an incompatible schema.
3. Set `RESTORE_DATABASE_URL` to the migrated empty restore database, `RESTORE_UPLOAD_DIR` to a new separate directory, and the original `BACKUP_PASSPHRASE` privately.
4. Run `npm run restore -- path/to/selected.epbackup`. Restore refuses a non-empty target, mismatched schema, invalid filenames, modified media or failed encryption authentication. Financial records insert in one transaction. Media is staged separately; an interrupted restore may leave harmless staged files, and a retry validates their checksums.
5. Start a separate verification instance using the restored database and media directory. Sign in again; sessions are intentionally excluded. Verify record counts, sample receipts, historical prices, payment/refund totals, reports and media.
6. Only after verification, switch production configuration during a controlled maintenance window. Keep the pre-switch backup until the replacement is confirmed.

The script disables FK checking only on its private connection during inserts and restores it afterwards. Never use these commands to replace live business tables in place. A restore drill has **not yet been executed** in the current agent environment.

## Legacy migration and rollback

Stop new writes to the prior app, back it up with its own supported process, then import into the new Node database. Source imports are read-only. The script reads preserved connection settings from `var/import/source.env` and preserved media from `var/import`; it does not rewrite the original database. Confirm old-to-new counts and financial totals and retain the preserved database/media backups. If setup/import is interrupted, preserve logs without secrets and use a fresh isolated target for a clean retry. Do not point Prisma at the Laravel schema.

After staff begin entering transactions in Node, switching back to the older app would omit those transactions unless a deliberate reconciliation is performed. Never run both systems for independent writes to the same business workflow during cutover.

## Browser and offline operations

- HTTPS is required off-loopback for service workers, install and push. Mobile devices connecting to a LAN HTTP address will not have a valid production PWA environment.
- Background Sync support varies. Foreground reconnect, app resume, periodic checks and Sync Now remain supported fallbacks. The browser may defer background execution; no guaranteed submission time is promised.
- Notification delivery requires connectivity, browser permission and working outbound HTTPS from the server. On denied permission, use in-app notifications. Push titles/bodies avoid customer and financial detail.
- No automatic update is forced while users have unsaved work. Apply an update after saving drafts.
- Shared devices should use separate OS/browser profiles. Logout clears private local data after warning about unsubmitted drafts. Browser deletion/eviction can remove local drafts; synchronize them when possible.
- Payments, refunds, authoritative reports, archive/restore, menu edits and chat delivery are always online-only.
