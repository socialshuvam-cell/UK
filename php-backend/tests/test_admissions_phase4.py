"""
Kingswell Institute Phase 4 — Admissions → Students → Enrollment backend tests.
Base URL: http://localhost:8090
"""
import io
import os
import subprocess
import time
import uuid
import pytest
import requests

BASE_URL = "http://localhost:8090"

ADMIN_EMAIL = "admin@kingswellinstitute.uk"
ADMIN_PASS = "oCP2yig7fNG50VF1r4CX"
OFFICER_EMAIL = "officer.test@kingswellinstitute.uk"
OFFICER_PASS = "OfficerPass123!"
STUDENT_TEST_EMAIL = "student.test@kingswellinstitute.uk"
STUDENT_TEST_PASS = "StudentPass123!"

# Fixture data (created by main agent)
FIX_INSTITUTION_ID = 11
FIX_COURSE_ID = 16          # CMS
FIX_COURSE_CODE = "CMS"
FIX_SESSION_ACTIVE = 4       # Autumn 2026
FIX_SESSION_UPCOMING = 5     # Spring 2027

# Track objects for cleanup
_created_admission_ids = []
_created_student_emails = []
_created_user_emails = []


def mysql(query):
    r = subprocess.run(
        ["mysql", "-u", "root", "kingswell", "-N", "-B", "-e", query],
        capture_output=True, text=True, timeout=10,
    )
    return r.stdout.strip()


def login(email, password):
    mysql("DELETE FROM login_attempts;")
    mysql(f"UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE email='{email}';")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s, r.json()["csrf_token"]


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def officer():
    return login(OFFICER_EMAIL, OFFICER_PASS)


@pytest.fixture(scope="module")
def student_test_acct():
    return login(STUDENT_TEST_EMAIL, STUDENT_TEST_PASS)


def _email(prefix):
    e = f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    _created_student_emails.append(e)
    _created_user_emails.append(e)
    return e


def _submit(email=None, session_id=FIX_SESSION_ACTIVE, first="Test", last="Person",
            course_id=FIX_COURSE_ID, institution_id=FIX_INSTITUTION_ID, phone="+441234567890",
            application_data=None):
    payload = {
        "first_name": first, "last_name": last, "course_id": course_id,
        "phone": phone,
    }
    if email is not None:
        payload["email"] = email
    if session_id is not None:
        payload["session_id"] = session_id
    if institution_id is not None:
        payload["institution_id"] = institution_id
    if application_data is not None:
        payload["application_data"] = application_data
    r = requests.post(f"{BASE_URL}/api/admissions", json=payload, timeout=10)
    return r


@pytest.fixture(scope="module", autouse=True)
def cleanup_after():
    yield
    # Best-effort teardown: nuke test-created admissions/students/enrollments/users.
    mysql("DELETE FROM audit_logs WHERE entity_type='student_documents' AND entity_id IN (SELECT id FROM student_documents WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'TEST_%'));")
    mysql("DELETE FROM student_documents WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'TEST_%');")
    mysql("DELETE FROM enrollments WHERE student_id IN (SELECT id FROM students WHERE email LIKE 'TEST_%');")
    mysql("DELETE FROM admissions WHERE applicant_email LIKE 'TEST_%';")
    mysql("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'TEST_%');")
    mysql("DELETE FROM users WHERE email LIKE 'TEST_%';")
    mysql("DELETE FROM students WHERE email LIKE 'TEST_%';")


# ---------------- 1. Public admission intake ----------------
class TestPublicAdmission:
    def test_missing_required_fields_422(self):
        r = requests.post(f"{BASE_URL}/api/admissions", json={})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "first_name" in errs and "last_name" in errs and "course_id" in errs

    def test_nonexistent_course_422(self):
        r = _submit(email=_email("nc"), course_id=9999999, session_id=None, institution_id=None)
        assert r.status_code == 422
        assert "course_id" in r.json().get("errors", {})

    def test_institution_not_offering_course_422(self, admin):
        # Create a fresh institution that doesn't link to CMS course
        s, csrf = admin
        code = f"TST_NOL_{uuid.uuid4().hex[:6].upper()}"
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": code, "name": "No link inst", "type": "centre"})
        iid = r.json()["institution"]["id"]
        rr = _submit(email=_email("noL"), institution_id=iid)
        assert rr.status_code == 422
        assert "institution_id" in rr.json().get("errors", {})
        # cleanup
        s.delete(f"{BASE_URL}/api/institutions/{iid}", headers={"X-CSRF-Token": csrf})

    def test_session_mismatch_422(self, admin):
        # Create another course with own session
        s, csrf = admin
        code = f"TST_OC_{uuid.uuid4().hex[:6].upper()}"
        rc = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": code, "name": "Other course"})
        other_cid = rc.json()["course"]["id"]
        rs = s.post(f"{BASE_URL}/api/courses/{other_cid}/sessions",
                    headers={"X-CSRF-Token": csrf},
                    json={"session_name": "OtherSess", "academic_year": "2026-27", "status": "active"})
        other_sid = rs.json()["session"]["id"]
        # Use other_sid with FIX_COURSE_ID -> mismatch
        rr = _submit(email=_email("sm"), course_id=FIX_COURSE_ID, session_id=other_sid,
                     institution_id=None)
        assert rr.status_code == 422
        assert "session_id" in rr.json().get("errors", {})
        # cleanup
        s.delete(f"{BASE_URL}/api/courses/{other_cid}/sessions/{other_sid}", headers={"X-CSRF-Token": csrf})
        s.delete(f"{BASE_URL}/api/courses/{other_cid}", headers={"X-CSRF-Token": csrf})

    def test_successful_submission_and_number_format(self):
        e = _email("ok")
        r = _submit(email=e, application_data={"prev_edu": "GCSE"})
        assert r.status_code == 201, r.text
        adm = r.json()["admission"]
        _created_admission_ids.append(adm["id"])
        # Format: KWI/ADM/YYYY/000NNN (6 digit padded)
        import re
        assert re.match(r"^KWI/ADM/\d{4}/\d{6}$", adm["admission_number"]), adm["admission_number"]
        assert adm["status"] == "submitted"
        assert adm["applicant_email"] == e

    def test_duplicate_same_email_course_session_409(self):
        e = _email("dup")
        r1 = _submit(email=e)
        assert r1.status_code == 201
        _created_admission_ids.append(r1.json()["admission"]["id"])
        r2 = _submit(email=e)
        assert r2.status_code == 409, r2.text

    def test_same_email_diff_session_allowed(self):
        e = _email("mult")
        r1 = _submit(email=e, session_id=FIX_SESSION_ACTIVE)
        assert r1.status_code == 201
        r2 = _submit(email=e, session_id=FIX_SESSION_UPCOMING)
        assert r2.status_code == 201, r2.text
        _created_admission_ids.append(r1.json()["admission"]["id"])
        _created_admission_ids.append(r2.json()["admission"]["id"])


# ---------------- 2. Review workflow ----------------
class TestReviewWorkflow:
    def _create(self, email_prefix="rev"):
        e = _email(email_prefix)
        r = _submit(email=e)
        assert r.status_code == 201, r.text
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        return aid, e

    def test_invalid_action_422(self, officer):
        s, csrf = officer
        aid, _ = self._create("ia")
        r = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                   headers={"X-CSRF-Token": csrf},
                   json={"action": "bogus"})
        assert r.status_code == 422

    def test_start_review_and_approve(self, officer):
        s, csrf = officer
        aid, _ = self._create("app")
        r1 = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                    headers={"X-CSRF-Token": csrf},
                    json={"action": "start_review", "review_notes": "starting"})
        assert r1.status_code == 200
        assert r1.json()["admission"]["status"] == "under_review"
        r2 = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                    headers={"X-CSRF-Token": csrf},
                    json={"action": "approve"})
        assert r2.status_code == 200
        assert r2.json()["admission"]["status"] == "approved"

    def test_reject_and_cannot_reject_again_409(self, officer):
        s, csrf = officer
        aid, _ = self._create("rej")
        r = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                   headers={"X-CSRF-Token": csrf}, json={"action": "reject"})
        assert r.status_code == 200
        r2 = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                    headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        assert r2.status_code == 409

    def test_cancel_from_approved(self, officer):
        s, csrf = officer
        aid, _ = self._create("can")
        s.post(f"{BASE_URL}/api/admissions/{aid}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        r = s.post(f"{BASE_URL}/api/admissions/{aid}/review",
                   headers={"X-CSRF-Token": csrf}, json={"action": "cancel"})
        assert r.status_code == 200
        assert r.json()["admission"]["status"] == "cancelled"

    def test_list_and_filter(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/admissions?status=submitted")
        assert r.status_code == 200
        for a in r.json()["admissions"]:
            assert a["status"] == "submitted"

    def test_show(self, officer):
        s, _ = officer
        aid, _ = self._create("sh")
        r = s.get(f"{BASE_URL}/api/admissions/{aid}")
        assert r.status_code == 200
        assert r.json()["admission"]["id"] == aid


# ---------------- 3. Enrollment ----------------
class TestEnrollment:
    def _approved(self, officer, email_prefix, session_id=FIX_SESSION_ACTIVE):
        s, csrf = officer
        e = _email(email_prefix)
        r = _submit(email=e, session_id=session_id)
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        s.post(f"{BASE_URL}/api/admissions/{aid}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        return aid, e

    def test_enroll_before_approval_409(self, officer):
        s, csrf = officer
        e = _email("noapp")
        r = _submit(email=e)
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        rr = s.post(f"{BASE_URL}/api/admissions/{aid}/enroll",
                    headers={"X-CSRF-Token": csrf}, json={})
        assert rr.status_code == 409

    def test_successful_enroll_creates_student_user_enrollment(self, officer):
        s, csrf = officer
        aid, e = self._approved(officer, "enr1")
        r = s.post(f"{BASE_URL}/api/admissions/{aid}/enroll",
                   headers={"X-CSRF-Token": csrf}, json={})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["student"] is not None
        assert body["enrollment"] is not None
        assert body["credentials"] is not None
        temp_pw = body["credentials"]["temporary_password"]
        assert len(temp_pw) > 0
        # format checks
        import re
        assert re.match(r"^KWI/REG/\d{4}/\d{6}$", body["student"]["registration_number"])
        assert re.match(r"^KWI/\d{2}/CMS/\d{4}$", body["enrollment"]["roll_number"]), body["enrollment"]["roll_number"]

        # verify temp password works
        s2 = requests.Session()
        lr = s2.post(f"{BASE_URL}/api/auth/login", json={"email": e, "password": temp_pw})
        assert lr.status_code == 200, f"temp pw login failed: {lr.text}"

        # admission status now enrolled
        adm = s.get(f"{BASE_URL}/api/admissions/{aid}").json()["admission"]
        assert adm["status"] == "enrolled"
        assert int(adm["student_id"]) == int(body["student"]["id"])

    def test_dedup_same_email_reuses_student(self, officer):
        s, csrf = officer
        # first admission - active session
        e = _email("dd")
        r1 = _submit(email=e, session_id=FIX_SESSION_ACTIVE)
        aid1 = r1.json()["admission"]["id"]
        _created_admission_ids.append(aid1)
        s.post(f"{BASE_URL}/api/admissions/{aid1}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        e1 = s.post(f"{BASE_URL}/api/admissions/{aid1}/enroll",
                    headers={"X-CSRF-Token": csrf}, json={}).json()
        student_id_1 = int(e1["student"]["id"])
        assert e1["credentials"] is not None
        roll_1 = e1["enrollment"]["roll_number"]

        # second admission — same email, different session
        r2 = _submit(email=e, session_id=FIX_SESSION_UPCOMING)
        aid2 = r2.json()["admission"]["id"]
        _created_admission_ids.append(aid2)
        s.post(f"{BASE_URL}/api/admissions/{aid2}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        e2 = s.post(f"{BASE_URL}/api/admissions/{aid2}/enroll",
                    headers={"X-CSRF-Token": csrf}, json={}).json()

        student_id_2 = int(e2["student"]["id"])
        assert student_id_1 == student_id_2, "should reuse same student record"
        assert e2["credentials"] is None, "no new credentials on dedup"
        assert e2["enrollment"]["roll_number"] != roll_1

        # DB verification
        count = mysql(f"SELECT COUNT(*) FROM students WHERE email='{e}';")
        assert count == "1", f"expected 1 student for {e}, got {count}"
        enroll_count = mysql(f"SELECT COUNT(*) FROM enrollments WHERE student_id={student_id_1};")
        assert enroll_count == "2", f"expected 2 enrollments, got {enroll_count}"

    def test_enroll_requires_session_id_when_admission_has_none(self, officer):
        s, csrf = officer
        # submit admission with NO session_id
        e = _email("nosess")
        r = _submit(email=e, session_id=None)
        assert r.status_code == 201, r.text
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        s.post(f"{BASE_URL}/api/admissions/{aid}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        # enroll without session_id -> 422
        rr = s.post(f"{BASE_URL}/api/admissions/{aid}/enroll",
                    headers={"X-CSRF-Token": csrf}, json={})
        assert rr.status_code == 422
        assert "session_id" in rr.json().get("errors", {})
        # enroll with session_id -> 201
        rr2 = s.post(f"{BASE_URL}/api/admissions/{aid}/enroll",
                     headers={"X-CSRF-Token": csrf},
                     json={"session_id": FIX_SESSION_ACTIVE})
        assert rr2.status_code == 201, rr2.text


# ---------------- 4. Student self-service /me/* ----------------
class TestStudentSelfService:
    @pytest.fixture(scope="class")
    def new_student(self, officer):
        s, csrf = officer
        e = _email("me")
        r = _submit(email=e)
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        s.post(f"{BASE_URL}/api/admissions/{aid}/review",
               headers={"X-CSRF-Token": csrf}, json={"action": "approve"})
        er = s.post(f"{BASE_URL}/api/admissions/{aid}/enroll",
                    headers={"X-CSRF-Token": csrf}, json={}).json()
        temp_pw = er["credentials"]["temporary_password"]
        sess, csrf2 = login(e, temp_pw)
        return sess, csrf2, er["student"]["id"], e

    def test_me_student(self, new_student):
        sess, _, sid, _ = new_student
        r = sess.get(f"{BASE_URL}/api/me/student")
        assert r.status_code == 200
        assert int(r.json()["student"]["id"]) == int(sid)

    def test_me_enrollments(self, new_student):
        sess, _, sid, _ = new_student
        r = sess.get(f"{BASE_URL}/api/me/enrollments")
        assert r.status_code == 200
        enrolls = r.json()["enrollments"]
        assert len(enrolls) >= 1
        for e in enrolls:
            assert int(e["student_id"]) == int(sid)

    def test_me_documents_empty(self, new_student):
        sess, _, _, _ = new_student
        r = sess.get(f"{BASE_URL}/api/me/documents")
        assert r.status_code == 200
        assert isinstance(r.json()["documents"], list)

    def test_me_document_upload_and_disk(self, new_student):
        sess, csrf, sid, _ = new_student
        # 1x1 PNG
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
               b"\x00\x00\x00\x03\x00\x01\xd3z\x92\xf5\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("myphoto.png", png, "image/png")}
        data = {"doc_type": "photo"}
        r = sess.post(f"{BASE_URL}/api/me/documents",
                      headers={"X-CSRF-Token": csrf}, files=files, data=data)
        assert r.status_code == 201, r.text
        doc = r.json()["document"]
        assert doc["file_path"] != "myphoto.png"
        assert "student_documents" in doc["file_path"]
        # verify disk existence (path is relative-under-uploads or absolute)
        candidates = [
            doc["file_path"],
            f"/app/php-backend/public_html/{doc['file_path']}",
            f"/app/php-backend/public_html/uploads/{doc['file_path']}",
        ]
        assert any(os.path.exists(p) for p in candidates), \
            f"uploaded file not found on disk. checked: {candidates}"

    def test_upload_rejects_txt(self, new_student):
        sess, csrf, _, _ = new_student
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        data = {"doc_type": "photo"}
        r = sess.post(f"{BASE_URL}/api/me/documents",
                      headers={"X-CSRF-Token": csrf}, files=files, data=data)
        assert r.status_code == 422, r.text

    def test_upload_invalid_doc_type(self, new_student):
        sess, csrf, _, _ = new_student
        png = b"\x89PNG\r\n\x1a\n" + b"\0" * 40
        files = {"file": ("x.png", png, "image/png")}
        data = {"doc_type": "bogus"}
        r = sess.post(f"{BASE_URL}/api/me/documents",
                      headers={"X-CSRF-Token": csrf}, files=files, data=data)
        assert r.status_code == 422
        assert "doc_type" in r.json().get("errors", {})

    def test_me_upload_missing_csrf_403(self, new_student):
        sess, _, _, _ = new_student
        png = b"\x89PNG\r\n\x1a\n" + b"\0" * 40
        files = {"file": ("x.png", png, "image/png")}
        r = sess.post(f"{BASE_URL}/api/me/documents",
                      files=files, data={"doc_type": "photo"})
        assert r.status_code == 403

    def test_student_test_acct_no_student_link_403(self, student_test_acct):
        sess, _ = student_test_acct
        for path in ["/api/me/student", "/api/me/enrollments", "/api/me/documents"]:
            r = sess.get(f"{BASE_URL}{path}")
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    def test_student_cannot_access_staff_endpoints(self, new_student):
        sess, _, _, _ = new_student
        for path in ["/api/admissions", "/api/students", "/api/enrollments", "/api/students/3"]:
            r = sess.get(f"{BASE_URL}{path}")
            assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"


# ---------------- 5. Staff student/enrollment mgmt ----------------
class TestStaffMgmt:
    def test_list_students(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/students")
        assert r.status_code == 200
        assert isinstance(r.json()["students"], list)

    def test_search_students(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/students?search=Wonder")
        assert r.status_code == 200
        names = [f"{x['first_name']} {x['last_name']}" for x in r.json()["students"]]
        assert any("Wonder" in n for n in names)

    def test_show_student_nested(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/students/3")
        assert r.status_code == 200
        b = r.json()
        assert "student" in b and "enrollments" in b and "documents" in b
        assert isinstance(b["enrollments"], list)

    def test_update_student(self, officer):
        s, csrf = officer
        r = s.put(f"{BASE_URL}/api/students/3",
                  headers={"X-CSRF-Token": csrf},
                  json={"city": "London", "guardian_name": "Guardian A"})
        assert r.status_code == 200, r.text
        assert r.json()["student"]["city"] == "London"
        assert r.json()["student"]["guardian_name"] == "Guardian A"

    def test_list_enrollments_filter(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/enrollments?student_id=3")
        assert r.status_code == 200
        for e in r.json()["enrollments"]:
            assert int(e["student_id"]) == 3

    def test_update_enrollment_invalid_status(self, officer):
        s, csrf = officer
        # get any enrollment
        r = s.get(f"{BASE_URL}/api/enrollments?student_id=3").json()
        eid = r["enrollments"][0]["id"]
        rr = s.put(f"{BASE_URL}/api/enrollments/{eid}",
                   headers={"X-CSRF-Token": csrf}, json={"status": "bogus"})
        assert rr.status_code == 422

    def test_update_enrollment_valid_status(self, officer):
        s, csrf = officer
        r = s.get(f"{BASE_URL}/api/enrollments?student_id=3").json()
        eid = r["enrollments"][0]["id"]
        rr = s.put(f"{BASE_URL}/api/enrollments/{eid}",
                   headers={"X-CSRF-Token": csrf}, json={"status": "active"})
        assert rr.status_code == 200


# ---------------- 6. CSRF ----------------
class TestCSRF:
    def test_review_missing_csrf(self, officer):
        s, csrf = officer
        # create an admission first
        r = _submit(email=_email("csrf1"))
        aid = r.json()["admission"]["id"]
        _created_admission_ids.append(aid)
        rr = s.post(f"{BASE_URL}/api/admissions/{aid}/review", json={"action": "approve"})
        assert rr.status_code == 403

    def test_update_student_missing_csrf(self, officer):
        s, _ = officer
        r = s.put(f"{BASE_URL}/api/students/3", json={"city": "X"})
        assert r.status_code == 403


# ---------------- 7. Audit ----------------
class TestAudit:
    def test_admission_audit_actions_present(self):
        actions = mysql(
            "SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'admission_%' OR action IN ('student_created','enrollment_created','student_updated','enrollment_updated','student_document_uploaded');"
        ).split("\n")
        expected = {
            "admission_submitted", "admission_approve", "admission_enrolled",
            "student_created", "enrollment_created", "student_updated",
            "enrollment_updated", "student_document_uploaded",
        }
        missing = expected - set(actions)
        assert not missing, f"missing audit actions: {missing}. actual: {actions}"

    def test_admission_submitted_user_id_null(self):
        # a public submission should have user_id NULL
        val = mysql("SELECT user_id FROM audit_logs WHERE action='admission_submitted' ORDER BY id DESC LIMIT 1;")
        assert val in ("NULL", ""), f"admission_submitted user_id should be NULL, got '{val}'"


# ---------------- 8. Regression smoke ----------------
class TestRegressionSmoke:
    def test_login_logout(self):
        s, csrf = login(ADMIN_EMAIL, ADMIN_PASS)
        r = s.post(f"{BASE_URL}/api/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200

    def test_institutions_list_still_works(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/institutions")
        assert r.status_code == 200

    def test_courses_list_still_works(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/courses")
        assert r.status_code == 200

    def test_sessions_still_work(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/courses/{FIX_COURSE_ID}/sessions")
        assert r.status_code == 200
