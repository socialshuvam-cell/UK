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

### Phase 4 — Admissions → Students → Enrollment (complete 2026-09-01, awaiting user
approval to start Phase 5)
- `app/Core/Counter.php` — collision-safe number allocator (`SELECT...FOR UPDATE` + `UPDATE`
  inside the caller's transaction if one is open, else its own); auto-bootstraps a counter row
  for a new year from an existing template row for that `sequence_key`. Used for `ADM`, `REG`,
  `ROLL` (scoped by course code) sequences — numbers are NEVER accepted from the client.
- `app/Core/FileUpload.php` — MIME-sniff (finfo) + JPEG/PNG/PDF allowlist + 5MB limit +
  random server-generated filename under `public_html/uploads/{type}/{yyyy}/{mm}/`.
- `app/Controllers/AdmissionController.php`:
  - `store()` — **public**, no auth. Validates course/institution-link/session, blocks
    duplicate open applications (same email+course+session), stores free-form
    previous-education/qualification info in `application_data` JSON, allocates `ADM` number.
  - `review()` — `start_review`/`approve`/`reject`/`cancel` state machine on `admissions.status`
    with strict from→to guards (409 on invalid transition), `admissions.review` permission.
  - `enroll()` — atomic (single DB transaction): dedupes by applicant email (reuses an
    existing `students` row + skips creating a second login instead of creating a duplicate
    master record — **one student, many enrollments**, per requirement), else creates
    `students` (REG number) + a `student`-role `users` login (random temp password returned
    ONCE in the response, never stored in plaintext), then `enrollments` (ROLL number scoped
    to course code). Requires `session_id` resolved (from the admission or the request body)
    before allocating a roll number, since `enrollments.session_id` is NOT NULL. Guards:
    duplicate enrollment (DB unique constraint → 409), email collision with an existing
    non-student `users` row → 409 (added after code review, not silently 500).
- `app/Controllers/StudentController.php` — staff CRUD (`students.view`/`students.manage`),
  nested enrollments+documents in detail view, document upload; **self-service** `/api/me/*`
  endpoints (`me`, `meEnrollments`, `meDocuments`, `meUploadDocument`) gated only by `auth` +
  an internal check that the caller's `users.student_id` is set — enforces "students only see
  their own records" without needing a dedicated permission slug.
- `app/Controllers/EnrollmentController.php` — staff list/show/update (`enrollments.manage`),
  status lifecycle (`active/completed/withdrawn/suspended`).
- `Validator::email()` added (used on admission applicant email).
- **Known bug pattern recurred + fixed** (3rd occurrence): PDO `EMULATE_PREPARES=false`
  rejects reusing one named placeholder twice — hit again in `AdmissionController`'s
  duplicate-check query and `StudentController`'s multi-field search; fixed with uniquely
  suffixed placeholders. Confirmed via repo-wide grep no other instances remain.
- File-permission fix: `public_html/uploads/` and `storage/logs/` must be owned/writable by
  the Apache worker user (`www-data`), not just root — added to `deploy/setup_local_env.sh`.

**Tested (2026-09-01, testing_agent, 41/41 pytest passed, 0 critical/minor issues):** public
intake + validation + duplicate protection, full review state machine incl. 409 on invalid
transitions, atomic enroll (number formats, temp-password login verified working end-to-end),
critical dedup test (2nd admission for same email reuses the same `students` row, 2nd
enrollment gets a new roll number, `credentials=null`), session_id-required-at-enroll-time,
`/me/*` self-scoping + 403 for unlinked accounts + cross-student denial, document upload
(success/reject-by-type/reject-by-doc_type/CSRF/random-filename-on-disk), staff CRUD +
search, audit logs for every action, Phase 2/3 regression smoke. Two low-risk code-review
follow-ups applied after the report (email format validation, users-email-collision guard)
and self-verified via curl. Regression suite: `tests/test_admissions_phase4.py` (combined
Phase 2+3+4: 94 tests).

### Phase 5 — Examinations & Results (complete 2026-09-01, awaiting user approval to start Phase 6)
- `app/Controllers/ExaminationController.php` — full CRUD; validates `course_id` exists and
  `session_id` belongs to that course; `exam_code` allocated via `Counter::next($pdo, 'EXAM')`
  (format `KWI/EXAM/{year}/{seq}`, client value ignored); delete blocked 409 if subjects or
  registrations exist.
- `app/Controllers/ExaminationSubjectController.php` — nested CRUD under an examination;
  `course_subject_id` must belong to the exam's course (422 otherwise); duplicate add blocked
  409; `pass_marks<=max_marks` enforced (falls back to the course_subject's own max/pass if
  omitted); delete blocked 409 if marks already recorded for that subject.
- `app/Controllers/ExamRegistrationController.php` — registers an `enrollment_id` for an
  exam; eligibility guard: enrollment must match the exam's `course_id`+`session_id` AND be
  `status='active'` (422 otherwise), duplicate student registration blocked 409;
  `hall_ticket_number` allocated via `Counter::next($pdo, 'HT')` (`KWI/HT/{year}/{seq}`);
  `hallTicket()`/`meHallTicket()` assemble exam+student+subjects into one response; student
  self-service `meIndex`/`meHallTicket` scoped to `Auth::requireStudentId()`.
- `app/Controllers/MarksController.php` — per-(registration, examination_subject) upsert via
  `ON DUPLICATE KEY UPDATE` (uses uniquely suffixed placeholders `:marks2`/`:absent2`/etc. —
  no HY093 risk); re-entering marks resets `verified_by`/`verified_at` to NULL;
  `marks_obtained` required 0..max_marks unless `is_absent=true`; `verify()` sets
  `verified_by`/`verified_at`.
- `app/Controllers/ResultController.php` — `compute()` requires marks for every
  `examination_subject` of the exam (409 if any missing), sums obtained/max, computes
  percentage + grade (`A+/A/B+/B/C/D/F` at 90/80/70/60/50/40 thresholds), pass/fail (fails on
  `is_absent` OR `obtained<pass_marks` on any subject); upsertable via
  `UNIQUE(exam_registration_id)` on `results`. `publish()` sets `published_at`/`published_by`,
  409 if already published or if `result_status` is still `pending` (never computed). Student
  self-service `meIndex`/`meShow` only return `published_at IS NOT NULL` rows for the caller's
  own `student_id`.
- Permissions added to `seed.php`: `exams.manage`, `exam_registrations.manage`, `marks.enter`,
  `marks.verify`, `results.publish` — all granted to `super_admin` (`*`) and
  `examination_officer`; `results.view_self` (already existed) covers student self-service.
- Routes added in `public_html/api/index.php` under the above permission slugs, `csrf` on all
  writes; `/api/me/exam-registrations`, `/api/me/exam-registrations/{id}/hall-ticket`,
  `/api/me/results`, `/api/me/results/{id}` for student self-service (`auth` only, ownership
  enforced in-controller).
- Fixture note: `course_subjects` table was empty going into Phase 5 (Phase 3 fixtures never
  added any) — main agent created 2 subjects (CMS101, CMS102) under course 16 via the existing
  Phase 3 API as test fixtures. These plus exam id=1 (`KWI/EXAM/2026/000001`), exam_registration
  id=1 (Alice Wonder, hall ticket `KWI/HT/2026/000001`), and result id=1 (published, fail) now
  exist permanently in the local DB — keep intact for Phase 6.

**Tested (2026-09-01, self-test via curl + testing_agent, 146/146 passing, 0 critical/minor
issues):** exam CRUD + auto exam_code, subject dup/wrong-course/pass>max 422/409s, delete
blocked by dependents (exam and subject level), registration eligibility (inactive/wrong
course-session 422, duplicate 409), hall-ticket assembly, marks range validation, upsert
clears verification, `is_absent` flow, marks verify, compute-result missing-marks 409,
grade/pass-fail calculation, publish idempotency 409, RBAC 403 for admission_officer/student
on all exam-management routes, 401 unauthenticated, 403 missing/wrong CSRF, `/me/*`
self-scoping (Alice sees only her own, unlinked student gets 403), full Phase 2-4 regression
(94 tests) all still passing. Regression suite: `tests/test_examinations_phase5.py`. Report:
`/app/test_reports/iteration_4.json`.

### Phase 6 — Documents & Verification (complete 2026-09-01, awaiting user approval to start Phase 7)
- `app/Controllers/DocumentTemplateController.php` — CRUD for `document_templates`; version
  auto-increments per `doc_type` on every `store()`; `is_active=1` deactivates other versions
  of the *same* `doc_type` only; delete blocked 409 if any `documents` row references the
  template; `fields_config` JSON drives the generic renderer (title, body_text with
  `{{placeholders}}`, show_photo/show_signatories, default_signatories) — no per-type PHP code
  needed to change wording/branding, just a new template version.
- `app/Controllers/DocumentController.php` — unified issuance (`POST /api/documents`) for all
  8 doc_types via `buildSnapshot()` dispatch to 5 anchor-specific builders
  (buildHallTicket/buildMarksheet/buildTranscript/buildCourseCompletion [shared by
  certificate/diploma/degree/completion_letter]/buildAdmissionLetter). Eligibility guards:
  certificate/diploma/degree/completion_letter require `enrollments.status='completed'` (422);
  marksheet/transcript require `results.published_at IS NOT NULL` (409); admission_letter
  requires `admissions.student_id` set + status not rejected/cancelled (409). `document_number`
  allocated via the existing `Counter` service (`CERT/DIP/DEG/MS/TR/CL/AL` sequence keys,
  `KWI/{PREFIX}/{year}/{6-digit-seq}`) — **except** hall_ticket, which reuses the
  `exam_registrations.hall_ticket_number` already allocated in Phase 5 (no new Counter call).
  `data_snapshot` (frozen JSON) + `snapshot_hash` (sha256) + `verification_token`
  (48 random hex) + `uuid` are written in one DB transaction along with
  `document_signatories` and (for transcripts) `document_results` pivot rows; QR PNG +
  rendered PDF are generated in a second step (outside the transaction, since file I/O can't
  be rolled back) and `qr_code_path`/`file_path` are updated afterward — both columns are
  outside the immutability trigger's protected list. `reissue()` rebuilds a fresh snapshot
  from **current** source data (not the old snapshot) into a brand-new document row
  (`revision+1`, `replaces_document_id`), then marks the old row `status='superseded'` +
  `superseded_by`; hall_ticket reissue is blocked 409 (number is 1:1 with the exam
  registration, can't be duplicated). `revoke()`/`cancel()` require a `reason`, only act on
  `status='valid'` (409 otherwise). Student self-service: `/api/me/issued-documents` +
  `/api/me/issued-documents/{id}/download`, scoped to `Auth::requireStudentId()`.
- `app/Controllers/VerificationController.php` — public `GET /api/verify/{token}`, **zero
  auth**, rate-limited via the existing `RateLimiter` (type=`verify`, 30 failed/15min → 429).
  Never 404s for a real lookup: valid/revoked/cancelled/superseded all return `found:true` +
  status (+ reason/superseded_by_document_number where relevant); only a syntactically unknown
  token returns `found:false, status:not_found`. Every lookup logged to
  `document_verifications`.
- `app/Core/DocumentRenderer.php` — generic single-layout PDF engine (FPDF) driven entirely by
  `data_snapshot` + template `fields_config`: outer border, institute name + title, doc
  number/issue date, photo box (top-right, falls back to a "No Photo" placeholder box —
  wrapped in try/catch so a bad/undecodable photo file can never 500 the whole issuance),
  label:value info block, per-doc_type body (marks table for marksheet, exams table for
  transcript, schedule table for hall_ticket, else a `{{placeholder}}`-substituted paragraph
  for letters/certificates), signatories row, QR image + "Scan to verify", footer with the
  verification URL. `app/Core/QrCode.php` wraps phpqrcode for PNG generation.
- **Vendored (no Composer, Hostinger-safe)**: `app/Vendor/fpdf/` (FPDF 1.86, pure PHP, needs
  its `/font` metrics dir even for core Arial/Helvetica) and `app/Vendor/phpqrcode/` (PNG QR
  via GD). **GD PHP extension is now a hard requirement** — installed locally via
  `apt install php8.2-gd` (standard/default on Hostinger shared hosting, no special request
  needed) and Apache restarted to load it.
- Permission added to `seed.php`: `documents.templates.manage`, granted to `super_admin` (`*`)
  and `certificate_officer` (which also already had `documents.issue`/`documents.revoke`).
  8 default active templates (one per doc_type, version=1) seeded idempotently.
- `StudentController::storeUploadedDocument()` — a `doc_type='photo'` upload now also syncs
  `students.photo_path` (the master candidate photo used by document rendering); validates via
  `getimagesize()` that the file is a real decodable JPEG/PNG first (422 otherwise) — added
  after the testing_agent found an uploaded-but-undecodable "photo" could 500 every future
  document issuance for that student.
- Routes added in `index.php`: `/api/document-templates*`, `/api/documents*`,
  `/api/me/issued-documents*`, public `/api/verify/{token}` (no middleware at all).

**Tested (2026-09-01, self-test via curl/pdftoppm/zbarimg + testing_agent, 200/200 passing —
54 new Phase 6 + 146 regression):** all 8 doc_types issued correctly with proper anchor
validation and document_number format (hall_ticket confirmed to NOT consume a new Counter
value); immutability trigger blocks direct SQL changes to
data_snapshot/document_number/verification_token (SQLSTATE 45000) while qr_code_path/
file_path/status/revoked_*/superseded_by updates succeed; QR PNG decodes (zbarimg) to exactly
`{APP_URL}/verify/{token}`; generated PDF is single-page valid `%PDF-`; reissue/revoke/cancel
lifecycle incl. hall_ticket-reissue-409 and already-superseded-reissue-409; template
versioning + per-doc_type is_active exclusivity + delete-referenced-409; default vs explicit
signatories; public verification for valid/revoked/cancelled/superseded/not_found + 429 rate
limit + logging; 5-concurrent-issuance numbering collision safety (all unique); RBAC 403 for
admission_officer/student on every Phase 6 staff route, 401 unauthenticated, 403 missing/wrong
CSRF; student self-service ownership scoping. **2 bugs found by testing_agent and fixed**: (1)
HIGH — undecodable student photo crashed PDF generation with 500, fixed with try/catch
fallback in DocumentRenderer + getimagesize() validation on photo upload; (2) LOW — phpqrcode
float→int deprecation log noise, fixed with explicit `(int)` casts in the vendored file.
New test account `certofficer.test@kingswellinstitute.uk` (see test_credentials.md). Report:
`/app/test_reports/iteration_5.json`.

### Phase 7 — Checkpoint 2 (Admin: Admissions/Students/Institutions/Courses/Enrollments), complete 2026-09-01
- All 5 modules already had full data-fetching/tables/forms/CRUD wired to Phase 3/4 PHP endpoints
  (built in a prior session before context ran out — handoff notes calling this "empty scaffolding"
  were inaccurate). This session's work was verification + bugfixing, not net-new UI.
- `app/Core/Validator.php` — added `Validator::nullifyEmpty(array $data, array $fields): array`
  static helper (converts `''` → `null` for named fields) to protect nullable/typed DB columns
  (DATE, ENUM, INT) from MariaDB strict-mode rejection of empty string.
- `StudentController::update` — applies `nullifyEmpty` to `dob`, `gender`, `email`, `phone`,
  `address`, `city`, `country`, `nationality`, `guardian_name`, `guardian_phone`, `id_proof_type`,
  `id_proof_number` before binding.
- `CourseController::store`/`update` — applies `nullifyEmpty` to `category`, `duration_months`,
  `total_credits`, `eligibility`, `description`.
- Frontend: added `DialogDescription` to institution create, course create, course-subject, and
  course-session dialogs (Radix a11y warning fix).

**Tested (2026-09-01, testing_agent x2 — iteration_7 then iteration_8 re-test, ~34+ checks):**
admissions list/filter/full review lifecycle (submitted→under_review→approved→enroll→one-time
credentials dialog), students list/search/filter, student detail 3 tabs (profile edit incl. blank
optional fields, enrollments read-only, document upload), institutions CRUD + course link/unlink +
delete-with-no-dependents, courses CRUD + subjects/sessions tabs inline add/edit/delete +
delete-with-no-dependents, enrollments list/filter/detail/change-status + view-student-record link,
RBAC (officer sees only permitted nav items, student redirected /admin/*→/portal), session
persistence on hard reload, a11y dialog warnings resolved. **2 bugs found in iteration_7, 1st fix
attempt incomplete (found by iteration_8 re-test), both now fully fixed and curl+UI verified**:
(1) `PUT /api/students/{id}` 500'd on empty-string `dob`/`gender` (ENUM/DATE strict-mode rejection)
— fixed by expanding `nullifyEmpty` field list; (2) `POST /api/courses` 500'd on empty-string
`duration_months`/`total_credits` (INT strict-mode rejection) — fixed same way. Reports:
`/app/test_reports/iteration_7.json`, `iteration_8.json`.
- Fixture data untouched: Alice Wonder (id=3, phone restored to 1234567890), KWI-MAIN (id=11),
  CMS course (id=16), admissions 1/51/52. Ephemeral test admission id=53 (submitted status, unique
  test email) left behind — harmless, safe to ignore/delete later.
- **User explicitly instructed: STOP after Checkpoint 2, do not start Checkpoint 3** until they
  review these results and give approval.

### Login/session bug fix — external preview URL, fixed 2026-09-01
- User reported "Invalid email or password" when logging in via the public preview URL (not localhost).
  RCA: Emergent's platform ingress hardcodes `/api/*` to port 8001 (the default FastAPI scaffold at
  `/app/backend`, otherwise unused by this PHP project); the real backend is PHP/Apache on port 8090.
  Previous testing was all done via `localhost:3000` (webpack devServer's own proxy → 8090), which
  masked this since the platform ingress was never exercised.
- Fix: added a catch-all reverse-proxy route in `/app/backend/server.py`
  (`proxy_to_php_backend`, `/api/{full_path:path}`) using `httpx.AsyncClient` that transparently
  forwards every `/api/*` request (method/headers/cookies/body/query) to `127.0.0.1:8090` and relays
  the response back including multiple `Set-Cookie` headers (session cookie). The two original stub
  routes (`/api/`, `/api/status`) are matched first by FastAPI and unaffected.
- Verified by `testing_agent` (iteration_9.json) against the real external URL: login/session
  persistence/role redirects/list pages/logout/CSRF-protected edits — all 6/6 PASS.
- Known follow-up (not fixed, out of scope for this fix): `StudentDetailPage.jsx`'s uploaded-document
  links (`/${file_path}`) have the same static-file routing problem on the external URL (static
  `/uploads/*` paths route to port 3000, not 8090). Checkpoint 4's new Documents module avoids this by
  using the working `/api/documents/{id}/download` endpoint and a text verification link instead of
  an inline QR `<img>`. The Checkpoint 2 student-upload link should be fixed later via a dedicated
  `/api/students/{id}/documents/{docId}/download` stream endpoint (small backend addition).

### Kingswell design system, applied 2026-09-01
- User requested a professional British/international-institute look to replace the generic shadcn
  default. Ran `design_agent`; guidelines saved at `/app/design_guidelines.json`.
- Tokens (in `/app/frontend/src/index.css` + `tailwind.config.js`): deep navy primary
  (`--navy-deep`/`--navy-surface`), warm ivory background/card, restrained gold accent
  (`--gold`/`--gold-hover`), Playfair Display for headings (serif), Inter for body, `--radius`
  tightened to 6px (no oversized rounded cards).
  Fonts loaded via Google Fonts in `public/index.html`.
- Shared components redesigned globally (cascades to every page automatically):
  `AppLayout.jsx` (navy sidebar with gold active-item border + crest, ivory topbar), `PageHeader.jsx`
  (gold rule + serif title), `StatusBadge.jsx` (semantic emerald/amber/rose/secondary chips replacing
  generic shadcn Badge), `ui/table.jsx` (uppercase tracked headers, ivory-tinted header row),
  `ui/card.jsx` (bordered sections, serif CardTitle), `ui/tabs.jsx` (gold underline active tab).
  `LoginPage.jsx` rebuilt as a navy/ivory split panel.
- Kingswell crest logo (user-uploaded) now used in the sidebar, login page and browser favicon/title
  (`/app/frontend/public/assets/kingswell-logo.png`).
- Rolled out across all admin pages (Dashboard, Admissions, Students, Institutions, Courses,
  Enrollments, Examinations, Documents, Templates, Login) since they all consume the same shared
  primitives — no per-page rewrites needed beyond the shared components above.

### Phase 7 — Checkpoint 3 (Admin: Examinations), complete 2026-09-01
- New files under `/app/frontend/src/pages/admin/examinations/`: `ExaminationsListPage.jsx` (list +
  status/course filters + create dialog), `ExaminationDetailPage.jsx` (editable fields + delete, 3
  tabs), `ExaminationSubjectsTab.jsx` (add/edit/delete subject with exam date/time/duration/max/pass
  marks, picks from the course's `course_subjects`), `ExaminationRegistrationsTab.jsx` (register an
  eligible active enrollment, per-row Hall Ticket/Marks/Compute Result/Status actions),
  `MarksEntryDialog.jsx` (per-subject marks entry + absent checkbox + verify), `HallTicketDialog.jsx`
  (read-only formatted hall ticket), `ExaminationResultsTab.jsx` (computed results + publish).
- Routes added: `/admin/examinations`, `/admin/examinations/:id`. Nav item added (permission
  `exams.manage`).
- **RBAC gap found + fixed**: `examination_officer` role lacked `enrollments.manage`, so
  `GET /api/enrollments` (needed to pick a student to register for an exam) 403'd for that role
  despite ARCHITECTURE.md's matrix giving Exam Officer full exam-workflow capability. Added
  `enrollments.manage` to the `examination_officer` seed in `/app/php-backend/database/seed.php`
  and re-ran the seed script (idempotent). Created test account
  `examofficer.test@kingswellinstitute.uk` for this role (see test_credentials.md).
- Tested by `testing_agent` (iteration_7/iteration_8, run before this fork's continuation) covering
  the full exam CRUD/subjects/registrations/marks/results/RBAC flow — all passed after 2 minor
  backend bugs (empty-string `dob`/`gender` and `duration_months`/`total_credits` breaking MariaDB
  strict mode) were fixed via a new `Validator::nullifyEmpty()` helper.

### Phase 7 — Checkpoint 4 (Admin: Documents), complete 2026-09-01
- New files under `/app/frontend/src/pages/admin/documents/`: `DocumentsListPage.jsx` (list, doc_type/
  status filters, client-side search by document #/student/registration #), `DocumentDetailPage.jsx`
  (candidate info, type-specific extra details renderer for all 8 doc types, verification token/link,
  signatories + add-signatory, Download PDF, Revoke/Cancel with required reason, Reissue with
  replaces/superseded-by navigation links), `IssueDocumentDialog.jsx` (dynamic issuance form per
  doc_type: hall_ticket via Examination→Registration picker, marksheet via Examination→published
  Result picker, transcript via Student search + multi-select of that student's published results
  across all exams, certificate/diploma/degree/completion_letter via Student search→completed
  Enrollment (+ optional linked result), admission_letter via approved/enrolled Admission picker;
  optional Institution selector on all types), `DocumentTemplatesPage.jsx` (list/create/edit/delete
  templates per doc_type, editing `name`/`paper_size`/`orientation`/`is_active`/`html_layout`/
  `css_styles`/`fields_config` — a JSON textarea, no new template engine).
- Routes added: `/admin/documents`, `/admin/documents/:id`, `/admin/document-templates`. Nav items
  added (`documents.issue`, `documents.templates.manage`). Dashboard already had a working
  "Documents Issued" stat tile (built in Checkpoint 3, now backed by this real page).
- No backend/API/DB changes were needed or made — all existing Phase 6 endpoints were sufficient once
  composed thoughtfully on the frontend (e.g. transcript's "all published results for a student" is
  built by fetching `/examinations` then `/examinations/{id}/results` per exam and filtering
  client-side, since no direct `results by student_id` endpoint exists — acceptable for this
  institute's small dataset).
- Design decision to avoid a routing trap: the QR PNG (`qr_code_path`) is a static file under
  `public_html/uploads/...` which is NOT reachable via the external preview URL (same root cause as
  the login bug — static paths route to port 3000, not 8090). Instead of rendering `<img src=.../qr.png>`,
  the detail page shows the verification URL as text/link; the QR itself is still embedded in the
  downloadable PDF (via the working `/api/documents/{id}/download` route), so no functionality is lost.
- Self-tested (lightweight, per user's explicit request — no testing_agent this checkpoint):
  screenshot-verified list+filters, full issuance flow (Certificate via student search → completed
  enrollment → issue, default template signatories applied automatically), `curl`-verified PDF
  download (valid `%PDF-` magic bytes), Reissue (correctly supersedes old doc, revision increments,
  bidirectional replaces/superseded-by links), Revoke with required reason (action buttons correctly
  hidden once non-valid), Templates edit dialog (fields_config JSON prefilled correctly). No console
  errors beyond expected pre-login 401s and sandbox HMR websocket noise.
- Left-over test fixtures: a few extra certificate documents for Alice Wonder (student id=3) from
  self-testing — harmless, cannot be deleted by design (documents are immutable audit records; only
  revoke/cancel/reissue are supported), safe to ignore.

### Public QR Verification Page, complete 2026-09-01
- User explicitly requested the public verification page while skipping the Student Portal expansion
  (Checkpoint 5 scope narrowed to just this).
- New file `/app/frontend/src/pages/VerifyPage.jsx`, routes `/verify` and `/verify/:token` added to
  `App.js` as fully public routes (outside `ProtectedRoute`/`AppLayout` — no login required, no
  sidebar). Calls the existing public `GET /api/verify/{token}` endpoint (`VerificationController.php`,
  already rate-limited and audit-logged from Phase 6) — no backend changes needed.
- Design: standalone navy header with Kingswell crest + "Document Verification" subtitle, manual
  token entry form (for typing a token directly, not just scanning a QR), and a status card with
  distinct visual treatment per state: emerald "Valid & Authentic", rose "Revoked"/"Cancelled" (shows
  reason + date), amber "Superseded" (shows the current document number to look up instead),
  neutral "Not Found", amber "rate limited" message for HTTP 429.
- Self-tested (screenshot_tool) all 5 states — empty/valid/revoked/superseded/not_found — rendering
  correctly, plus confirmed the underlying API works through the real external preview URL (important
  since real QR scans from printed documents will hit that exact URL, not localhost).

## Prioritized backlog (from ARCHITECTURE.md §11, unchanged)
- **P2 — Phase 7:** Finance (manual payments + receipts) & notifications, dashboards/reports.
- **P2 — Phase 8:** Hardening + Hostinger deployment guide/checklist, final relative-API build.

## Critical rules for next agent
- **Do not start Phase 7 Checkpoint 2 (Admin: Admissions/Students/Institutions/Courses/
  Enrollments) or write further frontend code until the user explicitly approves** this
  checkpoint 1 report.
- GD PHP extension is now a hard runtime dependency (document PDF/QR generation) — never
  disable/uninstall it; confirm it's in the Hostinger PHP configuration checklist for Phase 8.

### Phase 7 — Frontend (Admin Dashboard + Student Portal), Checkpoint 1/5 complete 2026-09-01
- User-approved plan: 5 checkpoints, no new backend endpoints unless a genuine gap is found.
  Explicit constraints: reuse Phase 2 PHP session-cookie + CSRF auth exactly (no JWT/
  localStorage), frontend calls the backend via **relative `/api`** path only (Hostinger
  same-origin in production) — never an Emergent preview URL. "Credit efficiency" — no
  cosmetic/animation work, functionality first.
- Reused the existing `/app/frontend` CRA+craco+shadcn scaffold (React 19, react-router-dom,
  @tanstack/react-query, axios, tailwind). Installed shadcn components via
  `npx shadcn add ...` (button/input/label/card/table/badge/dialog/select/tabs/dropdown-menu/
  avatar/separator/alert/skeleton/sheet/form/textarea + the pre-existing full set).
- `app/frontend/craco.config.js` — added a **dev-only** `devServer.proxy` (`/api`, `/uploads`
  → `http://localhost:8090`) so `yarn start` on port 3000 can use the exact same relative-path
  application code that will run unmodified on Hostinger; never touches `craco build`.
  **Important environment note**: the external Emergent preview ingress hardcodes
  `/api → port 8001` (the unused FastAPI scaffold) and cannot reach our PHP app on port 8090 —
  so all local frontend dev/testing in this sandbox must use `http://localhost:3000`
  (not the external preview URL) until Phase 8 deploys the real static-build-in-`public_html`
  Hostinger architecture.
- `src/lib/api.js` — axios instance, `baseURL: '/api'`, `withCredentials: true`, CSRF header
  interceptor (reads an in-memory token set by AuthContext, attaches `X-CSRF-Token` on
  POST/PUT/DELETE/PATCH).
- `src/context/AuthContext.jsx` — `login()`/`logout()`/`refresh()` wrapping
  `/api/auth/{login,logout,me}`; exposes `user`, `permissions[]`, `hasPermission(slug)`,
  `isStaff`/`isStudent`; restores session on mount via `GET /api/auth/me` (httpOnly cookie).
- `src/components/ProtectedRoute.jsx` + `src/components/layout/AppLayout.jsx` — role-gated
  route guards (`allow="staff"`/`"student"`, redirects to the correct home if the wrong role
  hits the other's route) and a permission-aware sidebar/topbar/mobile-sheet shell.
- `src/pages/LoginPage.jsx` (unified staff+student login, role-based redirect) +
  `src/pages/admin/DashboardPage.jsx` (4 permission-gated stat tiles: students/pending
  admissions/scheduled examinations/documents issued, each hidden if the user lacks that
  permission) + `src/pages/portal/DashboardPage.jsx` (registration number, status, enrollment
  count via `/api/me/student` + `/api/me/enrollments`).
- `src/constants/nav.js` — nav items are added **only as each checkpoint's pages exist**; no
  placeholder/dead routes.

**Tested (2026-09-01, testing_agent via Playwright at `http://localhost:3000`, 10/10 flows
passing):** super_admin login → `/admin` with all 4 tiles showing real counts;
admission_officer login → only 2 tiles render (students/admissions — permission gating
confirmed); Alice Wonder (student) login → `/portal` with her real registration number +
enrollment count; route guards correct in all 4 directions (logged-out, wrong-role×2,
already-authenticated); session persists across a hard reload (cookie-based); logout clears
the session server-side; wrong password shows an inline error; mobile 400px viewport collapses
to hamburger + slide-out sheet; CSRF token confirmed sent on the logout POST. **1 minor a11y
warning found and fixed**: added `SheetTitle`/`SheetDescription` (visually hidden) to the
mobile nav sheet. Report: `/app/test_reports/iteration_6.json`.
- Known code-review notes for later (non-blocking, flagged by testing_agent): admin dashboard
  tiles currently fetch full lists client-side just to show `.length` — fine at current data
  volume, revisit with lightweight count endpoints if a real perf issue appears.
- `DiagnosticsController` + `/api/diagnostics/*` routes are Phase-2-only scaffolding for RBAC
  testing — fine to leave, but don't build real features on top of them.
- Canonical test accounts (see `/app/memory/test_credentials.md`): super_admin, student.test
  (unlinked), officer.test, **plus now Alice Wonder** (student_id=3, alice.wonder@example.com,
  reg `KWI/REG/2026/000001`, 2 enrollments in course 16/CMS) — keep all intact for Phase 5.
- Fixture data for Phase 7 to build on: institution id=11 (KWI-MAIN) linked to course id=16
  (CMS), sessions id=4 (Autumn 2026) and id=5 (Spring 2027); course_subjects id=6/7 (CMS101,
  CMS102); examination id=1 (`KWI/EXAM/2026/000001`); exam_registration id=1 (Alice, hall
  ticket `KWI/HT/2026/000001`); result id=1 (published, grade C); Alice now has a real
  `students.photo_path` (candidate photo) set. Numerous Phase 6 test documents (all 8
  doc_types, some revoked/cancelled/superseded) exist for student_id=3 — safe to leave/ignore.
- PDO here has `ATTR_EMULATE_PREPARES=false` — never reuse the same named placeholder twice
  in one query (this bug pattern has recurred 3 times across phases — always grep for it
  after writing any multi-condition/multi-subquery SQL string).
- `public_html/uploads/` and `storage/logs/` must stay owned/writable by `www-data`; if
  permissions are lost after a pod restart, re-run `deploy/setup_local_env.sh`.
- If any future phase needs to modify the schema further, propose it via `ask_human` first
  (established pattern this project follows) rather than changing `schema.sql` silently.
- Never use Python/Node/MongoDB/Redis/Docker/Composer in `/app/php-backend`. Leave
  `/app/backend` (FastAPI) and `/app/frontend` (CRA) untouched — they are not part of this project.
- Do not modify `/app/database/schema.sql` or `/app/php-backend/database/schema.sql` unless a
  genuine implementation blocker is found — stop and report before changing the schema.
- Keep all API paths relative `/api/...`; never bake an Emergent preview URL into anything.
- Local Apache runs on port **8090** — do not reuse 8001/3000/8080 (8080 is used by another
  platform process in this container).
