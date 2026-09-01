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

### Phase 2 — Auth & RBAC (complete 2026-09-01, awaiting user approval to start Phase 3)
- `app/Core/Auth.php` — session token (random 64-hex) + CSRF token (random 64-hex) creation,
  cookie set/clear (`HttpOnly`, `SameSite=Lax`, `Secure` when `APP_ENV!=local`), opportunistic
  cleanup of expired `user_sessions` rows on every login.
- `app/Core/RateLimiter.php` — `login_attempts` based check, blocks by **email OR IP** (either
  hitting the threshold blocks), 5 attempts / 15 min window → 429.
- `app/Core/AuditLog.php` — writes `audit_logs` rows (action, entity, old/new JSON, ip, UA).
- `app/Middleware/AuthMiddleware.php` — cookie → `user_sessions` lookup (sha256 token hash),
  expiry check (deletes + 401 if expired), sliding renewal (`expires_at` extended each request
  = inactivity timeout), loads role permissions onto `$request->permissions`.
- `app/Middleware/CsrfMiddleware.php` — `X-CSRF-Token` header vs `user_sessions.csrf_token`,
  `hash_equals`, 403 on mismatch/missing. Applied to all state-changing routes except login.
- `app/Middleware/PermissionMiddleware.php` — declarative `permission:<slug>` middleware, 403
  if the role's permission set (loaded by AuthMiddleware) doesn't include the slug.
- `Router` extended: `get/post/put/delete($path, $handler, $middleware = [])`, runs
  `auth` → `csrf` → `permission:*` in order before the controller.
- `app/Controllers/AuthController.php` — `login` (rate-limit → lockout check → verify →
  rehash-if-needed → destroy-any-existing-session-then-create-new [session-fixation defense]
  → set cookie → audit log), `logout` (destroy session, clear cookie, audit log; requires
  `auth`+`csrf`), `me` (returns user + permissions + csrf_token; requires `auth`).
- `app/Controllers/DiagnosticsController.php` — **temporary** Phase-2-only endpoints
  (`/api/diagnostics/admin-only` needs `users.manage`, `/api/diagnostics/students-view` needs
  `students.view`) purely to exercise RBAC before any real feature module exists; safe to
  remove/ignore once Phase 3+ adds real permission-gated endpoints.
- `database/bootstrap_admin.php` — idempotent CLI-only Super Admin creation (never an HTTP
  endpoint), reads `SUPER_ADMIN_EMAIL`/`PASSWORD`/`FIRST_NAME`/`LAST_NAME` from `.env`.
- `bootstrap.php` CORS fixed to reflect `Origin` + `Access-Control-Allow-Credentials: true`
  (local only) so cookies work once a React dev server is added in a later phase.

**Tested (2026-09-01, testing_agent, 21/21 pytest cases passed, 0 critical/minor issues):**
login success/failure (generic error, no user enumeration), rate limiting (429), account
lockout (`users.locked_until` set + 423), `/api/auth/me` 200/401, session regeneration on
login, session expiry (manual DB expire → 401 + row cleanup) + sliding renewal, logout CSRF
enforcement (403 without/wrong token, 200 + session destroyed with correct token), RBAC
403/200 across super_admin/student/admission_officer on both diagnostic endpoints, audit_logs
rows for login/login_failed/logout, bootstrap script idempotency. Regression suite saved at
`/app/php-backend/tests/test_auth_phase2.py`.

### Phase 3 — Academics & Institutions (complete 2026-09-01, awaiting user approval to start Phase 4)
- **Schema additions (user-approved before implementation, additive only):** `courses.category`
  VARCHAR(100) NULL, `courses.eligibility` TEXT NULL; new pivot table `institution_courses`
  (institution_id, course_id, status, `ON DELETE CASCADE` both sides) for many-to-many
  course↔centre offering. Applied to both `/app/database/schema.sql` and
  `/app/php-backend/database/schema.sql` plus the live local DB (30 tables now).
- `app/Core/Validator.php` — small reusable fluent validator (`required/maxLength/in/integer`,
  `fails()/errors()`) now used by all Phase 3 controllers; will be reused in future phases.
- `app/Controllers/InstitutionController.php` — full CRUD + `linkCourse`/`unlinkCourse`
  (pivot management), delete blocked 409 if `admissions`/`enrollments` reference it.
- `app/Controllers/CourseController.php` — full CRUD (code/name/level/category/duration/
  credits/eligibility/description/status), detail response nests `subjects`, `sessions`,
  `institutions`; delete blocked 409 if subjects/sessions/institution_courses/admissions/
  enrollments reference it.
- `app/Controllers/CourseSubjectController.php` — nested CRUD under a course; subject_code
  unique per course; enforces `pass_marks <= max_marks`; delete blocked 409 if referenced by
  `examination_subjects`.
- `app/Controllers/CourseSessionController.php` — nested CRUD under a course; delete blocked
  409 if referenced by enrollments/examinations/admissions.
- Routes added in `public_html/api/index.php` under `permission:institutions.manage` /
  `permission:courses.manage` / `permission:sessions.manage`, `csrf` on all writes.
- **RBAC gap fixed:** Phase 2's `seed.php` had NOT granted `examination_officer` the
  `courses.manage`/`sessions.manage` permissions that `ARCHITECTURE.md` §5's matrix requires
  ("Courses/sessions" row includes Exam Officer). Corrected in `seed.php` and re-seeded
  (idempotent `INSERT IGNORE`, no data loss).
- Audit logging on every create/update/delete/link/unlink (`institution_created`,
  `course_updated`, `course_subject_deleted`, `institution_course_linked`, etc.).
- **Known bug found + fixed during self-test:** PDO with `ATTR_EMULATE_PREPARES=false`
  rejects reusing the same named placeholder twice in one query (`SQLSTATE[HY093]`). All
  "dependents count" queries (used before allowing a delete) were rewritten to use uniquely
  numbered placeholders (`:id1`, `:id2`, ...) bound to the same value. Watch for this same
  pattern in any future multi-subquery statement.

**Tested (2026-09-01, testing_agent, 32/32 pytest passed, 0 critical/minor issues):**
Institutions/Courses/Subjects/Sessions CRUD, validation (required fields, unique codes,
enum values, pass_marks<=max_marks) returning 422 with field-keyed errors, institution↔course
linking/unlinking visible from both sides, delete-blocked-by-dependents 409 + delete-succeeds
after removing dependents, RBAC (super_admin all-access, admission_officer 403 on all
academics routes, examination_officer 200 on courses/sessions but 403 on institutions), CSRF
enforcement on every write route, audit log rows for every mutation. Regression suite at
`/app/php-backend/tests/test_academics_phase3.py` (combined with Phase 2's suite: 53 tests
total via `python -m pytest tests/ -v`).

**Minor hardening notes from code review (not bugs, optional future polish):** enum fields on
PUT accept empty string without explicit rejection; no dedicated date-format validator for
`start_date`/`end_date` yet — low risk for an internal admin API, can be added in Phase 8
hardening if desired.

## Prioritized backlog (from ARCHITECTURE.md §11, unchanged)
- **P1 — Phase 4:** Admissions → Students → Enrollment (application intake, review/approve,
  student master creation, REG+ROLL numbering, uploads, student portal login).
- **P1 — Phase 5:** Examinations (exams, exam subjects, registrations + hall tickets, marks
  entry/verification, result computation & publish).
- **P1 — Phase 6:** Documents & Verification (template engine, unified issuance for all 8
  doc types, QR + tokens, PDF generation, public `/verify/{token}`, revoke/reissue flows).
- **P2 — Phase 7:** Finance (manual payments + receipts) & notifications, dashboards/reports.
- **P2 — Phase 8:** Hardening + Hostinger deployment guide/checklist, final relative-API build.

## Critical rules for next agent
- **Do not start Phase 4 or write further app code until the user explicitly approves** the
  Phase 3 report.
- `DiagnosticsController` + `/api/diagnostics/*` routes are Phase-2-only scaffolding for RBAC
  testing — fine to leave, but don't build real features on top of them.
- 3 test accounts must stay in `users` table for future phases: super_admin, student.test,
  officer.test (see `/app/memory/test_credentials.md`).
- Academics tables (`institutions`, `courses`, `course_subjects`, `course_sessions`,
  `institution_courses`) are intentionally EMPTY after Phase 3 testing — Phase 4 will create
  real admissions/students/enrollments against them; don't assume any seeded rows exist.
- PDO here has `ATTR_EMULATE_PREPARES=false` — never reuse the same named placeholder twice
  in one query (use `:x1`, `:x2`, ... for repeated values).
- If any future phase needs to modify the schema further, propose it via `ask_human` first
  (established pattern this project follows) rather than changing `schema.sql` silently.
- Never use Python/Node/MongoDB/Redis/Docker/Composer in `/app/php-backend`. Leave
  `/app/backend` (FastAPI) and `/app/frontend` (CRA) untouched — they are not part of this project.
- Do not modify `/app/database/schema.sql` or `/app/php-backend/database/schema.sql` unless a
  genuine implementation blocker is found — stop and report before changing the schema.
- Keep all API paths relative `/api/...`; never bake an Emergent preview URL into anything.
- Local Apache runs on port **8090** — do not reuse 8001/3000/8080 (8080 is used by another
  platform process in this container).
