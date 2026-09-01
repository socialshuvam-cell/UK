-- =====================================================================
-- KINGSWELL INSTITUTE — MASTER RELATIONAL SCHEMA (PHASE 0 / DESIGN ONLY)
-- Target: Hostinger Premium shared hosting — MySQL 8 / MariaDB 10.4+
-- Engine: InnoDB (transactions + FK + row locking for collision-safe counters)
-- Charset: utf8mb4 (full unicode, names in any language)
-- NOTE: This is the PROPOSED schema for review. Do not run in production yet.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- MODULE 1: USERS, ROLES & PERMISSIONS (RBAC)
-- =====================================================================

CREATE TABLE roles (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug            VARCHAR(50)  NOT NULL,             -- super_admin, admission_officer...
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(255) NULL,
  is_system       TINYINT(1)   NOT NULL DEFAULT 0,   -- system roles cannot be deleted
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permissions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug            VARCHAR(100) NOT NULL,             -- students.create, exams.publish...
  name            VARCHAR(150) NOT NULL,
  module          VARCHAR(50)  NOT NULL,             -- students, exams, documents...
  description     VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_slug (slug),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permissions (
  role_id         INT UNSIGNED NOT NULL,
  permission_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_rp_permission (permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE institutions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(20)  NOT NULL,             -- used in roll no e.g. CMS
  name            VARCHAR(200) NOT NULL,
  type            ENUM('institution','centre') NOT NULL DEFAULT 'centre',
  address         VARCHAR(255) NULL,
  city            VARCHAR(100) NULL,
  country         VARCHAR(100) NULL,
  contact_email   VARCHAR(150) NULL,
  contact_phone   VARCHAR(30)  NULL,
  logo_path       VARCHAR(255) NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_institutions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                  CHAR(36)     NOT NULL,       -- public-safe id
  role_id               INT UNSIGNED NOT NULL,
  institution_id        INT UNSIGNED NULL,           -- for Institution/Centre Admin scoping
  student_id            BIGINT UNSIGNED NULL,        -- set when the user IS a student
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  email                 VARCHAR(150) NOT NULL,
  phone                 VARCHAR(30)  NULL,
  password_hash         VARCHAR(255) NOT NULL,       -- PHP password_hash (bcrypt/argon2)
  status                ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  email_verified_at     DATETIME     NULL,
  last_login_at         DATETIME     NULL,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME     NULL,           -- brute-force lockout
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role_id),
  KEY idx_users_institution (institution_id),
  KEY idx_users_student (student_id),
  CONSTRAINT fk_users_role        FOREIGN KEY (role_id)        REFERENCES roles(id),
  CONSTRAINT fk_users_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL
  -- fk_users_student added after students table (circular ref) below
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Server-side session store (HttpOnly/Secure cookie carries only the token)
CREATE TABLE user_sessions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  token_hash      CHAR(64)     NOT NULL,             -- sha256 of random session token
  ip_address      VARCHAR(45)  NULL,
  user_agent      VARCHAR(255) NULL,
  csrf_token      CHAR(64)     NULL,
  expires_at      DATETIME     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Brute-force / rate-limit tracking for auth + public verification
CREATE TABLE login_attempts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identifier      VARCHAR(150) NOT NULL,             -- email or endpoint key
  ip_address      VARCHAR(45)  NOT NULL,
  attempt_type    ENUM('login','verify','password_reset') NOT NULL DEFAULT 'login',
  success         TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_ip_time (ip_address, attempted_at),
  KEY idx_attempts_ident_time (identifier, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit trail for sensitive administrative actions
CREATE TABLE audit_logs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NULL,              -- null = system/anonymous
  action          VARCHAR(100) NOT NULL,             -- created, updated, revoked, login...
  entity_type     VARCHAR(100) NULL,                 -- students, documents...
  entity_id       VARCHAR(64)  NULL,
  old_values      JSON         NULL,
  new_values      JSON         NULL,
  ip_address      VARCHAR(45)  NULL,
  user_agent      VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 2: ACADEMICS (courses, subjects, sessions)
-- =====================================================================

CREATE TABLE courses (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(20)  NOT NULL,             -- CMS, BBA... used in roll no
  name            VARCHAR(200) NOT NULL,
  level           ENUM('certificate','diploma','degree','other') NOT NULL DEFAULT 'certificate',
  category        VARCHAR(100) NULL,                 -- free-text grouping, e.g. "Science", "Vocational"
  duration_months SMALLINT UNSIGNED NULL,
  total_credits   SMALLINT UNSIGNED NULL,
  eligibility     TEXT         NULL,                 -- admission eligibility criteria (free text)
  description     TEXT         NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE course_subjects (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id       INT UNSIGNED NOT NULL,
  subject_code    VARCHAR(30)  NOT NULL,
  subject_name    VARCHAR(200) NOT NULL,
  credits         SMALLINT UNSIGNED NULL,
  max_marks       SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  pass_marks      SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  is_elective     TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  PRIMARY KEY (id),
  UNIQUE KEY uq_subject_course_code (course_id, subject_code),
  KEY idx_subjects_course (course_id),
  CONSTRAINT fk_subjects_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE course_sessions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id       INT UNSIGNED NOT NULL,
  session_name    VARCHAR(100) NOT NULL,             -- "Spring 2026"
  academic_year   VARCHAR(20)  NOT NULL,             -- "2026" / "2026-27"
  start_date      DATE         NULL,
  end_date        DATE         NULL,
  status          ENUM('upcoming','active','completed','archived') NOT NULL DEFAULT 'upcoming',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_course (course_id),
  CONSTRAINT fk_sessions_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Many-to-many: which institutions/centres offer which courses.
CREATE TABLE institution_courses (
  institution_id  INT UNSIGNED NOT NULL,
  course_id       INT UNSIGNED NOT NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (institution_id, course_id),
  KEY idx_instcourses_course (course_id),
  CONSTRAINT fk_instcourses_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_instcourses_course      FOREIGN KEY (course_id)      REFERENCES courses(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 3: STUDENTS (single master record)
-- =====================================================================

CREATE TABLE students (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                CHAR(36)     NOT NULL,
  registration_number VARCHAR(50)  NULL,             -- KWI/REG/2026/000001 (post-approval)
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  dob                 DATE         NULL,
  gender              ENUM('male','female','other','undisclosed') NULL,
  email               VARCHAR(150) NULL,
  phone               VARCHAR(30)  NULL,
  address             VARCHAR(255) NULL,
  city                VARCHAR(100) NULL,
  country             VARCHAR(100) NULL,
  nationality         VARCHAR(100) NULL,
  guardian_name       VARCHAR(150) NULL,
  guardian_phone      VARCHAR(30)  NULL,
  photo_path          VARCHAR(255) NULL,             -- master candidate photo
  id_proof_type       VARCHAR(50)  NULL,
  id_proof_number     VARCHAR(80)  NULL,
  status              ENUM('prospective','active','graduated','inactive') NOT NULL DEFAULT 'prospective',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_uuid (uuid),
  UNIQUE KEY uq_students_regno (registration_number),
  KEY idx_students_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Now safe to add the circular user->student FK
ALTER TABLE users
  ADD CONSTRAINT fk_users_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;

CREATE TABLE student_documents (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id      BIGINT UNSIGNED NOT NULL,
  doc_type        VARCHAR(50)  NOT NULL,             -- photo, id_proof, transcript_upload...
  file_path       VARCHAR(255) NOT NULL,
  original_name   VARCHAR(255) NULL,
  mime_type       VARCHAR(100) NULL,
  file_size       INT UNSIGNED NULL,
  is_verified     TINYINT(1)   NOT NULL DEFAULT 0,
  uploaded_by     BIGINT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_studocs_student (student_id),
  CONSTRAINT fk_studocs_student  FOREIGN KEY (student_id)  REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_studocs_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 4: ADMISSIONS
-- =====================================================================

CREATE TABLE admissions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admission_number     VARCHAR(50)  NOT NULL,        -- KWI/ADM/2026/000001
  student_id           BIGINT UNSIGNED NULL,         -- linked after approval
  course_id            INT UNSIGNED NOT NULL,
  session_id           INT UNSIGNED NULL,
  institution_id       INT UNSIGNED NULL,
  applicant_first_name VARCHAR(100) NOT NULL,
  applicant_last_name  VARCHAR(100) NOT NULL,
  applicant_email      VARCHAR(150) NULL,
  applicant_phone      VARCHAR(30)  NULL,
  application_data     JSON         NULL,            -- flexible extra fields
  status               ENUM('submitted','under_review','approved','rejected','enrolled','cancelled')
                         NOT NULL DEFAULT 'submitted',
  reviewed_by          BIGINT UNSIGNED NULL,
  reviewed_at          DATETIME     NULL,
  review_notes         TEXT         NULL,
  submitted_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admissions_number (admission_number),
  KEY idx_admissions_student (student_id),
  KEY idx_admissions_course (course_id),
  KEY idx_admissions_status (status),
  CONSTRAINT fk_admissions_student     FOREIGN KEY (student_id)     REFERENCES students(id)     ON DELETE SET NULL,
  CONSTRAINT fk_admissions_course      FOREIGN KEY (course_id)      REFERENCES courses(id),
  CONSTRAINT fk_admissions_session     FOREIGN KEY (session_id)     REFERENCES course_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_admissions_institution FOREIGN KEY (institution_id) REFERENCES institutions(id)  ON DELETE SET NULL,
  CONSTRAINT fk_admissions_reviewer    FOREIGN KEY (reviewed_by)    REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 5: ENROLLMENTS (student <-> course/session, roll number)
-- =====================================================================

CREATE TABLE enrollments (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id      BIGINT UNSIGNED NOT NULL,
  course_id       INT UNSIGNED NOT NULL,
  session_id      INT UNSIGNED NOT NULL,
  institution_id  INT UNSIGNED NULL,
  admission_id    BIGINT UNSIGNED NULL,
  roll_number     VARCHAR(50)  NULL,                 -- KWI/26/CMS/0001
  enrollment_date DATE         NULL,
  status          ENUM('active','completed','withdrawn','suspended') NOT NULL DEFAULT 'active',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enrollments_roll (roll_number),
  UNIQUE KEY uq_enrollment_unique (student_id, course_id, session_id),
  KEY idx_enrollments_course (course_id),
  KEY idx_enrollments_session (session_id),
  CONSTRAINT fk_enroll_student     FOREIGN KEY (student_id)     REFERENCES students(id)        ON DELETE CASCADE,
  CONSTRAINT fk_enroll_course      FOREIGN KEY (course_id)      REFERENCES courses(id),
  CONSTRAINT fk_enroll_session     FOREIGN KEY (session_id)     REFERENCES course_sessions(id),
  CONSTRAINT fk_enroll_institution FOREIGN KEY (institution_id) REFERENCES institutions(id)    ON DELETE SET NULL,
  CONSTRAINT fk_enroll_admission   FOREIGN KEY (admission_id)   REFERENCES admissions(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 6: EXAMINATIONS
-- =====================================================================

CREATE TABLE examinations (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_code       VARCHAR(40)  NOT NULL,
  name            VARCHAR(200) NOT NULL,
  course_id       INT UNSIGNED NOT NULL,
  session_id      INT UNSIGNED NOT NULL,
  exam_type       ENUM('regular','supplementary','improvement') NOT NULL DEFAULT 'regular',
  start_date      DATE         NULL,
  end_date        DATE         NULL,
  status          ENUM('scheduled','ongoing','completed','results_published','cancelled')
                    NOT NULL DEFAULT 'scheduled',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_code (exam_code),
  KEY idx_exam_course (course_id),
  KEY idx_exam_session (session_id),
  CONSTRAINT fk_exam_course  FOREIGN KEY (course_id)  REFERENCES courses(id),
  CONSTRAINT fk_exam_session FOREIGN KEY (session_id) REFERENCES course_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE examination_subjects (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  examination_id     BIGINT UNSIGNED NOT NULL,
  course_subject_id  INT UNSIGNED NOT NULL,
  exam_date          DATE         NULL,
  start_time         TIME         NULL,
  duration_minutes   SMALLINT UNSIGNED NULL,
  max_marks          SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  pass_marks         SMALLINT UNSIGNED NOT NULL DEFAULT 40,
  PRIMARY KEY (id),
  UNIQUE KEY uq_examsub (examination_id, course_subject_id),
  KEY idx_examsub_subject (course_subject_id),
  CONSTRAINT fk_examsub_exam    FOREIGN KEY (examination_id)    REFERENCES examinations(id)    ON DELETE CASCADE,
  CONSTRAINT fk_examsub_subject FOREIGN KEY (course_subject_id) REFERENCES course_subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE exam_registrations (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  examination_id       BIGINT UNSIGNED NOT NULL,
  student_id           BIGINT UNSIGNED NOT NULL,
  enrollment_id        BIGINT UNSIGNED NOT NULL,
  hall_ticket_number   VARCHAR(50)  NULL,            -- KWI/HT/2026/000001
  seat_number          VARCHAR(30)  NULL,
  exam_center          VARCHAR(200) NULL,
  registration_date    DATE         NULL,
  status               ENUM('registered','admitted','appeared','absent','debarred')
                          NOT NULL DEFAULT 'registered',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_examreg_hallticket (hall_ticket_number),
  UNIQUE KEY uq_examreg_unique (examination_id, student_id),
  KEY idx_examreg_student (student_id),
  KEY idx_examreg_enrollment (enrollment_id),
  CONSTRAINT fk_examreg_exam       FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_examreg_student    FOREIGN KEY (student_id)     REFERENCES students(id),
  CONSTRAINT fk_examreg_enrollment FOREIGN KEY (enrollment_id)  REFERENCES enrollments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE marks (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_registration_id   BIGINT UNSIGNED NOT NULL,
  examination_subject_id BIGINT UNSIGNED NOT NULL,
  marks_obtained         DECIMAL(6,2) NULL,
  is_absent              TINYINT(1)   NOT NULL DEFAULT 0,
  grade                  VARCHAR(5)   NULL,
  entered_by             BIGINT UNSIGNED NULL,
  verified_by            BIGINT UNSIGNED NULL,
  verified_at            DATETIME     NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marks (exam_registration_id, examination_subject_id),
  KEY idx_marks_subject (examination_subject_id),
  CONSTRAINT fk_marks_examreg  FOREIGN KEY (exam_registration_id)   REFERENCES exam_registrations(id)   ON DELETE CASCADE,
  CONSTRAINT fk_marks_examsub  FOREIGN KEY (examination_subject_id) REFERENCES examination_subjects(id),
  CONSTRAINT fk_marks_entered  FOREIGN KEY (entered_by)             REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_marks_verified FOREIGN KEY (verified_by)            REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE results (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exam_registration_id BIGINT UNSIGNED NOT NULL,
  examination_id       BIGINT UNSIGNED NOT NULL,
  student_id           BIGINT UNSIGNED NOT NULL,
  total_max_marks      DECIMAL(8,2) NULL,
  total_obtained_marks DECIMAL(8,2) NULL,
  percentage           DECIMAL(5,2) NULL,
  grade                VARCHAR(5)   NULL,
  gpa                  DECIMAL(4,2) NULL,
  result_status        ENUM('pass','fail','withheld','pending') NOT NULL DEFAULT 'pending',
  published_at         DATETIME     NULL,
  published_by         BIGINT UNSIGNED NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_result_examreg (exam_registration_id),
  KEY idx_result_exam (examination_id),
  KEY idx_result_student (student_id),
  CONSTRAINT fk_result_examreg   FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE CASCADE,
  CONSTRAINT fk_result_exam      FOREIGN KEY (examination_id)       REFERENCES examinations(id),
  CONSTRAINT fk_result_student   FOREIGN KEY (student_id)           REFERENCES students(id),
  CONSTRAINT fk_result_publisher FOREIGN KEY (published_by)         REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 7: DOCUMENTS (unified issued documents + templates + verification)
-- =====================================================================

CREATE TABLE document_templates (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  doc_type        ENUM('hall_ticket','marksheet','transcript','certificate',
                       'diploma','degree','completion_letter','admission_letter') NOT NULL,
  name            VARCHAR(150) NOT NULL,
  version         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  html_layout     MEDIUMTEXT   NULL,                 -- template markup w/ placeholders
  css_styles      MEDIUMTEXT   NULL,
  fields_config   JSON         NULL,                 -- which fields render + labels
  paper_size      VARCHAR(20)  NOT NULL DEFAULT 'A4',
  orientation     ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_templates_type (doc_type),
  CONSTRAINT fk_templates_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE documents (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid               CHAR(36)     NOT NULL,
  document_number    VARCHAR(60)  NOT NULL,          -- KWI/CERT/2026/000001 etc.
  doc_type           ENUM('hall_ticket','marksheet','transcript','certificate',
                          'diploma','degree','completion_letter','admission_letter') NOT NULL,
  template_id        INT UNSIGNED NULL,
  student_id         BIGINT UNSIGNED NOT NULL,
  admission_id       BIGINT UNSIGNED NULL,           -- anchor for admission_letter
  enrollment_id      BIGINT UNSIGNED NULL,           -- anchor for completion_letter/degree
  examination_id     BIGINT UNSIGNED NULL,
  result_id          BIGINT UNSIGNED NULL,           -- primary result (marksheet); transcripts use document_results
  exam_registration_id BIGINT UNSIGNED NULL,         -- anchor for hall_ticket
  course_id          INT UNSIGNED NULL,
  session_id         INT UNSIGNED NULL,
  institution_id     INT UNSIGNED NULL,
  verification_token CHAR(48)     NOT NULL,          -- random, indexed for /verify/{token}
  qr_code_path       VARCHAR(255) NULL,
  file_path          VARCHAR(255) NULL,              -- generated PDF in /uploads
  data_snapshot      JSON         NULL,              -- frozen field values at issue time (immutable)
  snapshot_hash      CHAR(64)     NULL,              -- sha256 of data_snapshot for tamper detection
  status             ENUM('valid','revoked','cancelled','superseded') NOT NULL DEFAULT 'valid',
  revision           SMALLINT UNSIGNED NOT NULL DEFAULT 1,  -- reissue version number
  replaces_document_id BIGINT UNSIGNED NULL,         -- new->old (the doc this reissue replaces)
  superseded_by      BIGINT UNSIGNED NULL,           -- old->new (the reissue that replaced this)
  issue_date         DATE         NOT NULL,
  issued_by          BIGINT UNSIGNED NULL,
  revoked_by         BIGINT UNSIGNED NULL,
  revoked_at         DATETIME     NULL,
  status_reason      VARCHAR(255) NULL,              -- reason for revoke/cancel
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_documents_uuid (uuid),
  UNIQUE KEY uq_documents_number (document_number),
  UNIQUE KEY uq_documents_token (verification_token),
  KEY idx_documents_student (student_id),
  KEY idx_documents_type (doc_type),
  KEY idx_documents_status (status),
  KEY idx_documents_admission (admission_id),
  KEY idx_documents_result (result_id),
  KEY idx_documents_replaces (replaces_document_id),
  CONSTRAINT fk_docs_template     FOREIGN KEY (template_id)          REFERENCES document_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_student      FOREIGN KEY (student_id)           REFERENCES students(id),
  CONSTRAINT fk_docs_admission    FOREIGN KEY (admission_id)         REFERENCES admissions(id)         ON DELETE SET NULL,
  CONSTRAINT fk_docs_enrollment   FOREIGN KEY (enrollment_id)        REFERENCES enrollments(id)        ON DELETE SET NULL,
  CONSTRAINT fk_docs_exam         FOREIGN KEY (examination_id)       REFERENCES examinations(id)       ON DELETE SET NULL,
  CONSTRAINT fk_docs_result       FOREIGN KEY (result_id)            REFERENCES results(id)            ON DELETE SET NULL,
  CONSTRAINT fk_docs_examreg      FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_course       FOREIGN KEY (course_id)            REFERENCES courses(id)            ON DELETE SET NULL,
  CONSTRAINT fk_docs_session      FOREIGN KEY (session_id)           REFERENCES course_sessions(id)    ON DELETE SET NULL,
  CONSTRAINT fk_docs_institution  FOREIGN KEY (institution_id)       REFERENCES institutions(id)       ON DELETE SET NULL,
  CONSTRAINT fk_docs_issuer       FOREIGN KEY (issued_by)            REFERENCES users(id)              ON DELETE SET NULL,
  CONSTRAINT fk_docs_revoker      FOREIGN KEY (revoked_by)           REFERENCES users(id)              ON DELETE SET NULL,
  CONSTRAINT fk_docs_replaces     FOREIGN KEY (replaces_document_id) REFERENCES documents(id)          ON DELETE SET NULL,
  CONSTRAINT fk_docs_superseded   FOREIGN KEY (superseded_by)        REFERENCES documents(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pivot: documents that aggregate MANY results (transcripts, degrees).
-- Keeps the immutable data_snapshot authoritative for printing while
-- recording exactly which results were included at issue time.
CREATE TABLE document_results (
  document_id     BIGINT UNSIGNED NOT NULL,
  result_id       BIGINT UNSIGNED NOT NULL,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (document_id, result_id),
  KEY idx_docresults_result (result_id),
  CONSTRAINT fk_docresults_doc    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_docresults_result FOREIGN KEY (result_id)   REFERENCES results(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Immutability guard: once a document row exists, its snapshot/number/token
-- can never be altered by any code path. Lifecycle fields (status, revoke,
-- supersede) remain editable. Enforced at DB level, not just in the app.
DELIMITER //
CREATE TRIGGER trg_documents_immutable
BEFORE UPDATE ON documents
FOR EACH ROW
BEGIN
  IF NOT (NEW.data_snapshot <=> OLD.data_snapshot)
     OR NEW.document_number    <> OLD.document_number
     OR NEW.verification_token <> OLD.verification_token
     OR NOT (NEW.snapshot_hash <=> OLD.snapshot_hash) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Immutable document fields (snapshot/number/token) cannot be modified';
  END IF;
END//
DELIMITER ;

-- Authorised signatories (per document, snapshot of who signed)
CREATE TABLE document_signatories (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id     BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(150) NOT NULL,
  designation     VARCHAR(150) NULL,
  signature_path  VARCHAR(255) NULL,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_signatories_doc (document_id),
  CONSTRAINT fk_signatories_doc FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Public verification lookups log (each scan/visit to /verify/{token})
CREATE TABLE document_verifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id     BIGINT UNSIGNED NULL,              -- null if token not found
  token_used      CHAR(48)     NOT NULL,
  result          ENUM('valid','revoked','cancelled','superseded','not_found') NOT NULL,
  ip_address      VARCHAR(45)  NULL,
  user_agent      VARCHAR(255) NULL,
  verified_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_verifications_doc (document_id),
  KEY idx_verifications_time (verified_at),
  CONSTRAINT fk_verifications_doc FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- MODULE 8: SYSTEM (counters, notifications, payments, settings)
-- =====================================================================

-- Collision-safe number sequences. One row per (sequence_key, scope_key, year).
CREATE TABLE counters (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sequence_key    VARCHAR(30)  NOT NULL,             -- REG, ROLL, CERT, DIP, DEG, MS, HT, ADM
  scope_key       VARCHAR(40)  NOT NULL DEFAULT '',  -- e.g. course code for roll numbers
  year            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  current_value   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  padding         TINYINT UNSIGNED NOT NULL DEFAULT 6,
  format_template VARCHAR(120) NOT NULL,             -- 'KWI/REG/{year}/{seq}'
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_counter_scope (sequence_key, scope_key, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_name      VARCHAR(50)  NOT NULL DEFAULT 'general',
  setting_key     VARCHAR(100) NOT NULL,
  setting_value   TEXT         NULL,
  value_type      ENUM('string','int','bool','json') NOT NULL DEFAULT 'string',
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  type            VARCHAR(50)  NOT NULL,
  title           VARCHAR(200) NOT NULL,
  message         TEXT         NULL,
  data            JSON         NULL,
  read_at         DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, read_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Manual fee/payment recording (NO gateway — admin enters method used)
CREATE TABLE payments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_number   VARCHAR(50)  NULL,                -- optional KWI/RCP/2026/000001
  student_id       BIGINT UNSIGNED NOT NULL,
  enrollment_id    BIGINT UNSIGNED NULL,
  admission_id     BIGINT UNSIGNED NULL,
  fee_type         VARCHAR(80)  NOT NULL,            -- admission, exam, certificate...
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(10)  NOT NULL DEFAULT 'GBP',
  payment_method   ENUM('cash','bank_transfer','cheque','card','upi','online','other') NOT NULL,
  reference_number VARCHAR(120) NULL,                -- txn/cheque ref entered manually
  paid_at          DATETIME     NULL,
  status           ENUM('paid','pending','partial','refunded','cancelled') NOT NULL DEFAULT 'paid',
  notes            VARCHAR(255) NULL,
  recorded_by      BIGINT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt (receipt_number),
  KEY idx_payments_student (student_id),
  KEY idx_payments_status (status),
  CONSTRAINT fk_payments_student    FOREIGN KEY (student_id)    REFERENCES students(id)    ON DELETE CASCADE,
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_admission  FOREIGN KEY (admission_id)  REFERENCES admissions(id)  ON DELETE SET NULL,
  CONSTRAINT fk_payments_recorder   FOREIGN KEY (recorded_by)   REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED REFERENCE DATA (roles + counter definitions) — for review
-- =====================================================================

INSERT INTO roles (slug, name, is_system, description) VALUES
 ('super_admin',        'Super Admin',            1, 'Full system access'),
 ('admission_officer',  'Admission Officer',      1, 'Manage admissions & approvals'),
 ('examination_officer','Examination Officer',    1, 'Manage exams, marks, results'),
 ('certificate_officer','Certificate Officer',    1, 'Issue/revoke academic documents'),
 ('institution_admin',  'Institution/Centre Admin',1,'Manage own centre students & data'),
 ('finance',            'Finance',                1, 'Record & manage payments'),
 ('student',            'Student',                1, 'Student self-service portal');

INSERT INTO counters (sequence_key, scope_key, year, current_value, padding, format_template) VALUES
 ('REG',  '',   2026, 0, 6, 'KWI/REG/{year}/{seq}'),
 ('ADM',  '',   2026, 0, 6, 'KWI/ADM/{year}/{seq}'),
 ('EXAM', '',   2026, 0, 6, 'KWI/EXAM/{year}/{seq}'),
 ('CERT', '',   2026, 0, 6, 'KWI/CERT/{year}/{seq}'),
 ('DIP',  '',   2026, 0, 6, 'KWI/DIP/{year}/{seq}'),
 ('DEG',  '',   2026, 0, 6, 'KWI/DEG/{year}/{seq}'),
 ('MS',   '',   2026, 0, 6, 'KWI/MS/{year}/{seq}'),
 ('HT',   '',   2026, 0, 6, 'KWI/HT/{year}/{seq}'),
 ('TR',   '',   2026, 0, 6, 'KWI/TR/{year}/{seq}'),
 ('CL',   '',   2026, 0, 6, 'KWI/CL/{year}/{seq}'),
 ('AL',   '',   2026, 0, 6, 'KWI/AL/{year}/{seq}'),
 ('RCP',  '',   2026, 0, 6, 'KWI/RCP/{year}/{seq}'),
 ('ROLL', 'CMS',2026, 0, 4, 'KWI/{yy}/{scope}/{seq}');
