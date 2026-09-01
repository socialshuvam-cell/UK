# Kingswell Institute — PHP Backend (Phase 1: Foundation)

Vanilla PHP 8.2 + PDO + MySQL/MariaDB. No Composer, no framework, no persistent process —
built to run unmodified on Hostinger Premium shared hosting.

## Local development (this workspace)

PHP 8.2, Apache (mod_php, mod_rewrite, mod_headers) and MariaDB are installed in this
container. The local vhost listens on **port 8090** (ports 8001/3000 are reserved by the
platform's own preview services and are untouched).

`/etc` is not persistent across pod restarts. If `curl http://localhost:8090/api/health`
stops responding after a restart, re-run:

```bash
bash /app/php-backend/deploy/setup_local_env.sh
```

This recreates the Apache vhost, enables required modules, ensures the `kingswell` database
and `kingswell_app` MySQL user exist (grants scoped to that one database only — mirrors a
typical Hostinger shared-hosting DB user), and registers `kingswell-apache` with supervisor
so Apache runs in the foreground and auto-restarts. It never drops existing data.

## Apply schema / seed reference data

```bash
cd /app/php-backend
php database/migrate.php   # imports database/schema.sql (idempotent CREATE-only; run once per fresh DB)
php database/seed.php      # idempotent: upserts permissions + role_permissions mapping
```

Roles and counters are seeded by `schema.sql` itself. `seed.php` only adds `permissions` and
`role_permissions` (kept separate so it can be re-run safely any time without re-importing DDL).

## Directory layout

```
php-backend/
├── public_html/        # Apache DocumentRoot — everything else is OUTSIDE the web root
│   ├── index.html       # placeholder; Phase 8 replaces with the React static build
│   ├── .htaccess         # SPA fallback + security headers, passes /api and /uploads through
│   ├── api/
│   │   ├── index.php     # front controller (only PHP file reachable directly)
│   │   └── .htaccess      # rewrites everything to index.php, denies any other .php
│   └── uploads/
│       └── .htaccess      # PHP execution disabled (student photos, generated PDFs go here)
├── app/                 # PHP source, NOT web-accessible
│   ├── bootstrap.php     # autoload, .env load, error/log setup, CORS (local only)
│   ├── Core/             # Env, Config, Database (PDO), Request, Response, Router
│   └── Controllers/       # HealthController (Phase 1); more added per phase
├── database/
│   ├── schema.sql         # deployable copy of /app/database/schema.sql
│   ├── migrate.php        # CLI: applies schema.sql
│   └── seed.php           # CLI: permissions + role_permissions
├── storage/logs/          # app.log (PHP errors), not web-accessible
├── deploy/                # apache vhost + local env setup script (see above)
├── .env                   # local secrets, gitignored
└── .env.example
```

## Hostinger deployment (Phase 8 will finalize this)

- Upload `public_html/*` into the account's `public_html/`.
- Upload `app/`, `database/`, `storage/` **outside** `public_html` (Hostinger SSH/File Manager
  home directory), e.g. `~/kingswell-app/app`, and change the two `require`/`dirname()` paths
  in `public_html/api/index.php` and `database/migrate.php` accordingly if the relative depth
  differs from this workspace.
- Create the MySQL database + user in hPanel, copy `.env.example` to `.env` next to `app/`
  (outside `public_html`) with those credentials, run `php database/migrate.php` and
  `php database/seed.php` once via SSH.
- Set `APP_ENV=production`, `APP_DEBUG=false` in the production `.env` — this also disables the
  permissive local CORS headers in `bootstrap.php` (same-origin in production, so none needed).
- `storage/logs` and `public_html/uploads` must be writable by the PHP process.
