# Kingswell Institute — Student/Admissions/Examination/Document Management System

## Original problem statement
Complete Student, Admissions, Examination, and Document Management System for Kingswell
Institute. **Hard hosting constraint:** production MUST run on Hostinger Premium shared
hosting — vanilla PHP 8.2+ backend, MySQL/MariaDB, static React build. No Python, Node.js,
MongoDB, Redis, or Docker in the production application. Build strictly phase-by-phase; stop
for approval after each phase.

## Tech stack (final, production)
- Backend: Vanilla PHP 8.2+, PDO, front-controller router, no Composer, no framework.
- DB: MySQL/MariaDB, InnoDB, utf8mb4.
- Frontend: React compiled to a static build, relative `/api/...` calls only (no baked-in host).
- Auth: PHP session + HttpOnly/Secure cookie (custom, server-side `user_sessions` table).
- Payments: manual entry only, no gateway.
- The Emergent default scaffold (`/app/backend` FastAPI, `/app/frontend` CRA) is UNUSED —
  left untouched per user's explicit choice. Do not build features there.

## Where the real app lives
- `/app/database/schema.sql` — master/reference copy of the 29-table DDL (Phase 0 design record).
- `/app/docs/ARCHITECTURE.md` — approved master plan (13 sections: architecture, RBAC matrix,
  numbering strategy, document/verification design, Hostinger file layout, phase plan).
- `/app/docs/er_diagram.{dot,png,svg}` — ER diagram.
- `/app/php-backend/` — **the actual production PHP application** (Phase 1+). See its own
  `README.md` for local dev setup, directory layout, and Hostinger deployment notes.

## Local dev environment (this workspace only, mirrors Hostinger)
- PHP 8.2 (cli + apache2 mod_php) + Apache (mod_rewrite, mod_headers) + MariaDB, all installed
  in-container. Local vhost on **port 8090** (ports 8001/3000 stay reserved for the platform's
  own preview services and are untouched).
- DB: `kingswell` database, dedicated `kingswell_app` MySQL user (not root), full privileges
  scoped to that one database only (mirrors typical Hostinger shared-hosting DB user model).
  Credentials live in `/app/php-backend/.env` (gitignored) — see `/app/memory/test_credentials.md`.
- `/etc` is NOT persistent across pod restarts. Re-run `bash /app/php-backend/deploy/setup_local_env.sh`
  any time the local Apache/DB stops responding — it is idempotent and never drops data.
- `kingswell-apache` is registered as a supervisor program (separate from the protected
  backend/frontend/mongodb entries) running `apache2ctl -D FOREGROUND` on :8090.

## What's been implemented

### Phase 0 (complete, approved)
- 29-table schema, ER diagram, ARCHITECTURE.md. Unified `documents` table with immutability
  trigger (`trg_documents_immutable`), `document_results` pivot, two-way reissue chain
  (`replaces_document_id`/`superseded_by`), collision-safe `counters` table.

### Phase 1 — Foundation (complete 2026-09-01, awaiting user approval to start Phase 2)
- `/app/php-backend/app/Core/`: `Env` (.env parser), `Config` (get/required), `Database`
  (PDO singleton, `ATTR_EMULATE_PREPARES=false`), `Request` (JSON body + query + path params),
  `Response` (JSON helper), `Router` (method+path matching, `{param}` regex support, 404/405).
- `app/bootstrap.php`: PSR-4-style autoloader (`App\` → `app/`), `.env` load, error
  log → `storage/logs/app.log`, global exception handler → JSON 500, local-only permissive CORS.
- `public_html/api/index.php`: front controller; routes registered: `GET /api/health`,
  `GET /api/health/db` (DB connectivity + table/roles/permissions/counters counts).
- `.htaccess` at 3 levels: root (SPA fallback + security headers, passes `/api`+`/uploads`
  through), `api/` (rewrite-to-front-controller, denies any `.php` except `index.php`),
  `uploads/` (PHP execution disabled).
- `database/migrate.php` — parses and applies `schema.sql` (handles the custom-`DELIMITER`
  trigger block in original file order so `documents` exists before the trigger is created).
- `database/seed.php` — idempotent (`ON DUPLICATE KEY` / `INSERT IGNORE`) seed of 25
  `permissions` + role→permission mapping matching the RBAC matrix in `ARCHITECTURE.md` §5.
  Roles + counters are seeded by `schema.sql` itself.
- Deployment scaffolding: `deploy/apache-kingswell.conf`, `deploy/setup_local_env.sh`, `README.md`.

**Tested (2026-09-01, via curl + mysql CLI, all passing):**
- `php database/migrate.php` → 36 statements executed, 29 tables + trigger created cleanly.
- `php database/seed.php` → 25 permissions, 53 role_permission links.
- `GET /api/health` → 200 `{"status":"ok",...}`; `GET /api/health/db` → 200 with live counts
  (29 tables, 7 roles, 25 permissions, 12 counters) using the **non-root** `kingswell_app` user.
- `GET /api/unknown` → 404; `POST /api/health` → 405 (route exists, method doesn't).
- Immutability trigger: `UPDATE documents SET status='revoked'` succeeds; `UPDATE documents
  SET data_snapshot=...` fails with `ERROR 1644 (45000)` as designed.
- `/uploads/test.php` and `/api/secret.php` both return Apache 403 (script execution/direct
  access denied) — confirmed via error log (`AH01630: client denied by server configuration`).
- `/` and any unknown non-api path (e.g. `/dashboard/x`) correctly fall back to `index.html`
  (SPA rewrite working before any real React build exists).

No testing_agent used for Phase 1 (pure backend infra, no user-facing UI yet) — verified via
curl + mysql CLI per the quick-testing rules.

## Prioritized backlog (from ARCHITECTURE.md §11, unchanged)
- **P0 — Phase 2:** Auth & RBAC. Session login/logout, HttpOnly cookie, brute-force + rate
  limiting (`login_attempts`), CSRF, permission middleware, audit logging, user/role management,
  Super Admin bootstrap.
- **P1 — Phase 3:** Academics (institutions, courses, subjects, sessions CRUD + scoping).
- **P1 — Phase 4:** Admissions → Students → Enrollment (application intake, review/approve,
  student master creation, REG+ROLL numbering, uploads, student portal login).
- **P1 — Phase 5:** Examinations (exams, exam subjects, registrations + hall tickets, marks
  entry/verification, result computation & publish).
- **P1 — Phase 6:** Documents & Verification (template engine, unified issuance for all 8
  doc types, QR + tokens, PDF generation, public `/verify/{token}`, revoke/reissue flows).
- **P2 — Phase 7:** Finance (manual payments + receipts) & notifications, dashboards/reports.
- **P2 — Phase 8:** Hardening + Hostinger deployment guide/checklist, final relative-API build.

## Critical rules for next agent
- **Do not start Phase 2 or write further app code until the user explicitly approves** the
  Phase 1 report.
- Never use Python/Node/MongoDB/Redis/Docker/Composer in `/app/php-backend`. Leave
  `/app/backend` (FastAPI) and `/app/frontend` (CRA) untouched — they are not part of this project.
- Do not modify `/app/database/schema.sql` or `/app/php-backend/database/schema.sql` unless a
  genuine implementation blocker is found — stop and report before changing the schema.
- Keep all API paths relative `/api/...`; never bake an Emergent preview URL into anything.
- Local Apache runs on port **8090** — do not reuse 8001/3000/8080 (8080 is used by another
  platform process in this container).
