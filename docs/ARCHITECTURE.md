# Kingswell Institute — Phase 0 Architecture & Database Design

**Status:** Proposal for approval. No application code written yet.
**Production target:** Hostinger Premium shared hosting — Apache, PHP 8.2/8.3, MySQL/MariaDB, `.htaccess`, static React build.
**No** Node/Python server in production, no MongoDB/Redis/Docker/WebSockets/queues/VPS/object storage/mandatory Composer.

---

## 1. High-level Architecture

```
                           Hostinger Apache (public_html)
   ┌──────────────────────────────────────────────────────────────────┐
   │  Browser (React static build)                                      │
   │    index.html + /static/*  ── served directly by Apache            │
   │        │                                                           │
   │        │  fetch('/api/...')  (relative paths, same origin)         │
   │        ▼                                                           │
   │  /api/index.php  ── front controller (router)                      │
   │        │                                                           │
   │        ├── Auth (PHP session + HttpOnly cookie)                    │
   │        ├── RBAC authorization (server-side, per route)            │
   │        ├── Controllers → Services → PDO (prepared statements)     │
   │        └── MySQL / MariaDB                                         │
   │                                                                    │
   │  /verify/{token}  ── public verification (SPA route → /api/verify) │
   │  /uploads/*       ── student photos, signatures, generated PDFs    │
   │  /database/       ── schema.sql, migrations (NOT web-accessible)   │
   └──────────────────────────────────────────────────────────────────┘
```

**Same-origin, relative APIs.** React calls `/api/...`. No hard-coded host anywhere. Apache
serves the SPA for all non-`/api`, non-`/uploads` paths (client-side routing), so `/verify/{token}`
resolves to the React app which then calls `/api/verify/{token}`.

**No permanent process.** Every request is a normal PHP request handled by Apache's `mod_php`/PHP-FPM.
Nothing needs to "stay running". PDF generation, QR generation, numbering — all happen inside the
request that triggers them.

---

## 2. Technology Choices (all shared-hosting safe)

| Concern | Choice | Why it fits Hostinger |
|---|---|---|
| Web server | Apache + `.htaccess` | Default on Hostinger shared |
| Backend | Vanilla PHP 8.2+ front controller + PDO | No framework/Composer requirement |
| DB | MySQL/MariaDB (InnoDB, utf8mb4) | Transactions + FK + row locks available |
| Auth | PHP session, HttpOnly+Secure cookie, server session table | No external session store |
| PDF | HTML/CSS template → PDF (single-file lib bundled, or print-to-PDF) | No system binaries needed |
| QR codes | Pure-PHP QR generator (single bundled file) | No `imagick`/exec dependency |
| Frontend | React compiled to static build | Served as files by Apache |
| File storage | `public_html/uploads/` | Local disk, no S3 |

> PDF/QR: we bundle small **single-file** PHP libraries (copied into `/api/lib`, not installed via
> Composer) so there is zero build/runtime service dependency. Final library choice is confirmed in
> Phase 5 (Documents).

---

## 3. Database Design

Full DDL is in **`/app/database/schema.sql`**. ER diagram: **`/app/docs/er_diagram.png`**.
30 tables across 8 modules. Engine InnoDB, charset utf8mb4, all FKs enforced.

### 3.1 Table list by module

**Module 1 — Users, Roles & Permissions (RBAC + security)**
- `roles`, `permissions`, `role_permissions` (pivot)
- `users` — one row per login identity (staff or student); links to `role`, optional `institution`, optional `student`
- `user_sessions` — server-side sessions; cookie holds only a random token (sha256 stored)
- `login_attempts` — brute-force + rate-limit tracking (login / verify / password_reset)
- `audit_logs` — old/new JSON snapshots of sensitive actions

**Module 2 — Academics**
- `institutions` (centres), `courses`, `course_subjects`, `course_sessions`

**Module 3 — Students (single master record)**
- `students` — the ONE master record per person (uuid + unique registration_number)
- `student_documents` — uploaded supporting files (photo, ID proof, etc.)

**Module 4 — Admissions**
- `admissions` — application lifecycle; `student_id` linked after approval

**Module 5 — Enrollments**
- `enrollments` — student ↔ course ↔ session; holds `roll_number`; one per (student, course, session)

**Module 6 — Examinations**
- `examinations`, `examination_subjects`, `exam_registrations` (holds `hall_ticket_number`), `marks`, `results`

**Module 7 — Documents**
- `document_templates` — pluggable designs per doc_type (HTML/CSS + fields_config JSON)
- `documents` — **unified** issued-document table for ALL types; holds `verification_token`, `status`, `data_snapshot`, `superseded_by`
- `document_signatories` — signatories snapshot per document
- `document_verifications` — log of every public `/verify/{token}` lookup

**Module 8 — System**
- `counters` — collision-safe number sequences
- `settings` — configurable key/values (incl. numbering config, institute details)
- `notifications`, `payments` (manual — no gateway)

### 3.2 Key relationships (ER summary)

- `roles 1—* users`, `roles *—* permissions` via `role_permissions`.
- `users 0..1 students` (a student login points to its master record); `users 0..* institutions` (centre scoping).
- **Single master student:** `students 1—* enrollments`, `1—* exam_registrations`, `1—* results`, `1—* documents`, `1—* payments`. A student has many of everything but exactly one `students` row.
- `courses 1—* course_subjects`, `1—* course_sessions`.
- `admissions *—1 courses`, becomes `0..1 enrollments` on approval.
- `examinations 1—* examination_subjects` (built from `course_subjects`).
- `exam_registrations 1—* marks`; `exam_registrations 1—1 results`.
- `documents` references `students` (always) plus optional `result / enrollment / examination / exam_registration / template`. Self-reference `superseded_by` handles reissues without deletion.

### 3.3 Why a **unified `documents`** table

Hall tickets, marksheets, transcripts, certificates, diplomas, degrees, completion & admission letters
all share the same needs: unique number, verification token, QR, status lifecycle, template, signatories,
issue metadata, and a frozen `data_snapshot`. One table + `doc_type` + `template_id` avoids 8 near-identical
tables, gives one verification path, and lets new designs be added as templates (never hard-coded).

`data_snapshot` (JSON) freezes the exact values printed (name, photo path, marks, grade, course, session,
signatories) at issue time — so a later name/course correction never silently changes an already-issued
official document.

---

## 4. Identifier / Numbering Strategy (server-side only)

All identifiers are generated **server-side inside a DB transaction**. React never sends or influences a number.

**Storage:** `counters` table, one row per `(sequence_key, scope_key, year)` with `format_template` + `padding`.

**Collision-safe allocation (InnoDB):**
```
BEGIN;
  SELECT ... FROM counters
    WHERE sequence_key=? AND scope_key=? AND year=?
    FOR UPDATE;                       -- row lock, blocks concurrent allocs
  UPDATE counters SET current_value = current_value + 1 WHERE id=?;
  -- format using template + padding, e.g. seq=1 → '000001'
COMMIT;
```
Row-level `FOR UPDATE` makes concurrent requests serialize on that one counter row, so two
simultaneous admissions can never get the same number. The target column additionally has a
`UNIQUE` constraint as a hard backstop.

**Templates & examples**

| Key | Template | Example |
|---|---|---|
| `REG`  | `KWI/REG/{year}/{seq:6}`      | `KWI/REG/2026/000001` |
| `ADM`  | `KWI/ADM/{year}/{seq:6}`      | `KWI/ADM/2026/000001` |
| `ROLL` | `KWI/{yy}/{scope}/{seq:4}`    | `KWI/26/CMS/0001` (scope = course code) |
| `HT`   | `KWI/HT/{year}/{seq:6}`       | `KWI/HT/2026/000001` |
| `MS`   | `KWI/MS/{year}/{seq:6}`       | `KWI/MS/2026/000001` |
| `CERT` | `KWI/CERT/{year}/{seq:6}`     | `KWI/CERT/2026/000001` |
| `DIP`  | `KWI/DIP/{year}/{seq:6}`      | `KWI/DIP/2026/000001` |
| `DEG`  | `KWI/DEG/{year}/{seq:6}`      | `KWI/DEG/2026/000001` |

**Configurable:** prefix, padding, per-year reset, and scope (e.g. roll numbers reset per course/year)
are all data in `counters` + `settings` — changeable without code edits. Placeholders supported:
`{year}` (2026), `{yy}` (26), `{scope}`, `{seq:N}` (zero-padded).

---

## 5. Authentication & Authorization Strategy

**Authentication — PHP session + HttpOnly cookie (your choice):**
- Password hashing: `password_hash()` (bcrypt/argon2id) + `password_verify()`; `password_needs_rehash()` on login.
- On login success: create a random 32-byte token → store `sha256(token)` in `user_sessions` with `expires_at`; send it in an **HttpOnly, Secure, SameSite=Lax** cookie. The raw token never lives in the DB.
- Each request: look up session by token hash, check expiry, load user + role + permissions.
- Logout / expiry: delete session row. Old expired rows cleaned opportunistically per request (no cron needed).

**Brute-force protection:**
- Every attempt logged in `login_attempts`. After N failures per email/IP within a window → increment `users.failed_login_attempts` and set `users.locked_until`. Locked accounts rejected until the window passes.
- Same limiter guards the **public `/verify`** endpoint and password reset (per-IP).

**CSRF:** state-changing requests require a CSRF token (stored in `user_sessions.csrf_token`, sent to the SPA and echoed via header). Cookie is `SameSite=Lax` as defence-in-depth.

**Authorization — enforced 100% server-side:**
- Every `/api` route declares the permission slug it needs (e.g. `documents.revoke`).
- The router resolves the current user's role → permissions and rejects with 403 if missing. React only *hides* UI; it never *grants* access.
- **Institution scoping:** Institution/Centre Admins are restricted (in every query) to rows matching their `institution_id`.

**Role → capability matrix (initial):**

| Capability | Super Admin | Admission Off. | Exam Off. | Cert Off. | Inst. Admin | Finance | Student |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Manage users/roles | ✔ | | | | | | |
| Admissions review/approve | ✔ | ✔ | | | ✔ (own) | | |
| Students CRUD | ✔ | ✔ | | | ✔ (own) | | view self |
| Courses/sessions | ✔ | | ✔ | | | | |
| Exams / marks / results | ✔ | | ✔ | | | | view self |
| Issue documents | ✔ | | | ✔ | | | |
| Revoke/cancel documents | ✔ | | | ✔ | | | |
| Record payments | ✔ | | | | ✔ (own) | ✔ | view self |
| Public verification | anyone (no login) |

**Audit logging:** admissions approval, number issuance, mark entry/verification, result publish,
document issue/revoke/cancel, user/role changes, and payments all write to `audit_logs` with actor,
IP, and old/new JSON.

---

## 6. Document Verification Strategy

- Every issued document gets a **random, unguessable `verification_token`** (48 chars) — separate from the human-readable `document_number`.
- QR code encodes `https://kingswellinstitute.uk/verify/{token}`.
- Public page `/verify/{token}` (no login) → `GET /api/verify/{token}` returns a safe subset of `data_snapshot` plus status.
- **Status lifecycle (never delete to invalidate):**
  - `valid` — genuine and current.
  - `revoked` — withdrawn due to error/misconduct; page clearly shows **REVOKED** + reason/date.
  - `cancelled` — voided before/without effect; page shows **CANCELLED**.
  - `superseded` — replaced by a reissue; page shows **SUPERSEDED** and points to the replacement via `superseded_by`.
- A revoked/cancelled/superseded token **still resolves** to a verification page communicating that state — it does not 404. Only truly unknown tokens return "not found".
- Every lookup is logged in `document_verifications` (result + IP + UA); the `/verify` endpoint is rate-limited.
- Verification shows: document type, number, candidate name, **photo where applicable**, course, session, institution, issue date, and result/grade where relevant — driven by the template's `fields_config`.

---

## 7. Document Template Architecture

- `document_templates` stores per `doc_type`: `html_layout` (placeholders like `{{candidate_name}}`, `{{qr}}`), `css_styles`, `fields_config` (which fields show + labels), `paper_size`, `orientation`, `version`, `is_active`.
- Rendering: load active template → substitute placeholders from the document's `data_snapshot` → produce HTML → convert to PDF; QR embedded.
- New professional designs are added as **new template rows/versions** — never by editing code. Multiple versions can coexist; each document records which `template_id` produced it.
- Auto-populated fields available to every template: candidate name, candidate photo, registration number, roll number, course, session, institution, issue date, document number, result/grade, QR code, authorized signatories, plus any configurable extras.

---

## 8. Hostinger File & Deployment Architecture

```
public_html/
├── index.html                 # React build entry
├── static/                    # React JS/CSS/assets (hashed)
├── .htaccess                  # SPA rewrite + route /api to PHP + security headers
├── favicon.ico, manifest ...
├── api/
│   ├── index.php              # front controller / router
│   ├── config.php             # reads env (see below)
│   ├── .htaccess              # protect internals
│   ├── controllers/ services/ models/ lib/  # PHP code (PDO, QR, PDF)
├── uploads/                   # photos, signatures, generated PDFs (validated writes)
│   └── .htaccess              # deny script execution here
└── database/
    ├── schema.sql             # (kept OUTSIDE web root if possible, else denied via .htaccess)
    └── migrations/
```

**Routing (`.htaccess`, root):**
- `/api/...` → `api/index.php` (front controller parses the path).
- `/uploads/...` and real files → served directly.
- Everything else → `index.html` (React Router handles `/verify/{token}`, dashboards, etc.).

**Config & secrets:**
- DB credentials + app secrets come from an **environment file kept outside the web root** (e.g. `../private/.env` or `getenv()` set via hPanel), read by `api/config.php`. Never committed to Git; never inside `public_html` in a readable location.
- Dev vs prod cleanly separated: dev uses local MySQL creds; prod uses Hostinger creds. React always uses **relative `/api`**, so no URL swap between environments and **no Emergent preview URL is ever baked into the build**.

**Security hardening (`.htaccess`):**
- Deny direct access to `/api/*.php` internals except the front controller, deny `/database`, deny dotfiles.
- `/uploads`: disable PHP execution (`php_flag engine off` / `RemoveHandler`), force download for non-images.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (HTTPS via Hostinger SSL).

**Development in this workspace:** per your choice, we set up **real PHP 8.2+ + MySQL/MariaDB** locally so code is Hostinger-identical from day one (same PDO, same `.htaccess`-equivalent routing). Deploy = copy React build + `api/` + `.htaccess` to `public_html`, import `schema.sql`, set env in hPanel.

---

## 9. File Upload Handling

- Stored under `public_html/uploads/{type}/{yyyy}/{mm}/` with server-generated random filenames (never the user's name).
- Validation on every upload: **MIME sniff** (finfo) + **extension allowlist** + **max size** + sanitized filename. Images re-encoded/verified; non-images (PDF proofs) allowlisted explicitly.
- Executable/script types blocked; `uploads/.htaccess` disables any script execution as a second layer.
- Metadata (path, mime, size, original name, uploader) recorded in `student_documents` / `documents`.

---

## 10. Student Lifecycle (mapped to tables)

```
Admission application        → admissions (submitted)
Application review           → admissions (under_review)
Approval                     → admissions (approved)
Student account creation     → students (master) + users (role=student)
Registration number          → students.registration_number  (counter REG)
Roll number                  → enrollments.roll_number        (counter ROLL, scope=course)
Course enrollment            → enrollments (active)
Examination registration     → exam_registrations             (+ hall_ticket_number, counter HT)
Hall ticket                  → documents(doc_type=hall_ticket)
Marks                        → marks
Result                       → results (published)
Marksheet                    → documents(doc_type=marksheet, counter MS)
Certificate/Diploma/Degree   → documents(doc_type=..., counters CERT/DIP/DEG)
QR verification              → documents.verification_token → /verify/{token}
```

---

## 11. Phase-by-Phase Implementation Plan

> Build and **stop for approval after each phase**. No broad/expensive test runs unless you ask.

- **Phase 0 (this):** Architecture + schema + ER diagram. → *Awaiting approval.*
- **Phase 1 — Foundation:** Local PHP+MySQL env, front controller/router, PDO layer, config/env separation, `.htaccess` routing, apply `schema.sql`, seed roles/permissions/counters, health-check endpoint. React shell with relative `/api` config.
- **Phase 2 — Auth & RBAC:** Session login/logout, HttpOnly cookie, brute-force + rate limiting, CSRF, permission middleware, audit logging, user & role management UI. Super Admin bootstrap.
- **Phase 3 — Academics & Institutions:** Institutions, courses, subjects, sessions (CRUD + scoping).
- **Phase 4 — Admissions → Students → Enrollment:** Application intake, review/approve, student master creation, REG + ROLL number issuance, enrollments, student photo/doc uploads, student portal login.
- **Phase 5 — Examinations:** Exams, exam subjects, registrations + hall ticket numbers, marks entry/verification, result computation & publish.
- **Phase 6 — Documents & Verification:** Template engine, unified document issuance (hall ticket, marksheet, transcript, certificate, diploma, degree, letters), QR + tokens, PDF generation, public `/verify/{token}` with valid/revoked/cancelled/superseded, revoke/reissue flows.
- **Phase 7 — Finance & Notifications:** Manual payment recording + receipts, notifications, dashboards/reports.
- **Phase 8 — Hardening & Deployment:** Security headers, upload hardening review, Hostinger deployment guide/checklist, final build with relative APIs.

---

## 12. Priorities honored

Hostinger Premium compatibility (no persistent process, Apache+PHP+MySQL only) · security enforced
server-side · maintainable (unified documents + template architecture + configurable counters) ·
**no future backend migration** (vanilla PHP + MySQL is the final production stack from Phase 1).
