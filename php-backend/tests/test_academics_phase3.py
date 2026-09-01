"""
Kingswell Institute Phase 3 — Academics & Institutions backend tests.
Base URL: http://localhost:8090 (local Apache PHP vhost).
"""
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
EXAM_EMAIL = "exam.qa@kingswellinstitute.uk"
EXAM_PASS = "ExamPass123!"


def mysql(query):
    r = subprocess.run(
        ["mysql", "-u", "root", "kingswell", "-N", "-B", "-e", query],
        capture_output=True, text=True, timeout=10,
    )
    return r.stdout.strip()


def login(email, password):
    mysql("DELETE FROM login_attempts;")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s, r.json()["csrf_token"]


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def admin():
    s, csrf = login(ADMIN_EMAIL, ADMIN_PASS)
    yield s, csrf


@pytest.fixture(scope="module")
def officer():
    s, csrf = login(OFFICER_EMAIL, OFFICER_PASS)
    yield s, csrf


@pytest.fixture(scope="module")
def exam_officer():
    # Create a throwaway examination_officer user
    subprocess.run(
        ["bash", "-c",
         "HASH=$(php -r \"echo password_hash('ExamPass123!', PASSWORD_DEFAULT);\") && "
         f"mysql -u root kingswell -e \"DELETE FROM users WHERE email='{EXAM_EMAIL}';\" && "
         f"mysql -u root kingswell -e \"INSERT INTO users (uuid, role_id, first_name, last_name, email, password_hash, status) "
         f"SELECT UUID(), (SELECT id FROM roles WHERE slug='examination_officer'), 'Test','Exam','{EXAM_EMAIL}','$HASH','active';\""],
        check=True, capture_output=True,
    )
    s, csrf = login(EXAM_EMAIL, EXAM_PASS)
    yield s, csrf
    # cleanup
    mysql(f"DELETE FROM users WHERE email='{EXAM_EMAIL}';")


@pytest.fixture(scope="module")
def cleanup_academics():
    # capture code prefixes for cleanup
    yield
    mysql("DELETE FROM institution_courses WHERE institution_id IN (SELECT id FROM institutions WHERE code LIKE 'TST_%') OR course_id IN (SELECT id FROM courses WHERE code LIKE 'TST_%');")
    mysql("DELETE FROM course_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE 'TST_%');")
    mysql("DELETE FROM course_subjects WHERE course_id IN (SELECT id FROM courses WHERE code LIKE 'TST_%');")
    mysql("DELETE FROM courses WHERE code LIKE 'TST_%';")
    mysql("DELETE FROM institutions WHERE code LIKE 'TST_%';")


def _code(prefix):
    return f"TST_{prefix}_{uuid.uuid4().hex[:6].upper()}"


# ---------------- 1. Institutions CRUD ----------------
class TestInstitutionsCrud:
    def test_create_requires_fields_422(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf}, json={})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "code" in errs and "name" in errs

    def test_create_invalid_enum_422(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("BOG"), "name": "Bogus", "type": "bogus", "status": "bogus"})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "type" in errs and "status" in errs

    def test_create_and_get_list_filter(self, admin, cleanup_academics):
        s, csrf = admin
        code = _code("INST")
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": code, "name": "Test Institution A", "type": "institution", "status": "active",
                         "city": "London", "country": "UK"})
        assert r.status_code == 201, r.text
        inst = r.json()["institution"]
        assert inst["code"] == code and inst["name"] == "Test Institution A"

        # Duplicate code -> 422
        r2 = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                    json={"code": code, "name": "Duplicate", "type": "centre"})
        assert r2.status_code == 422
        assert "code" in r2.json().get("errors", {})

        # Filter by status
        r3 = s.get(f"{BASE_URL}/api/institutions?status=active")
        assert r3.status_code == 200
        codes = [i["code"] for i in r3.json()["institutions"]]
        assert code in codes

        # Filter by type
        r4 = s.get(f"{BASE_URL}/api/institutions?type=institution")
        assert r4.status_code == 200
        assert code in [i["code"] for i in r4.json()["institutions"]]

    def test_show_includes_courses_array(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("SHOW"), "name": "Show Inst", "type": "centre"})
        iid = r.json()["institution"]["id"]
        r2 = s.get(f"{BASE_URL}/api/institutions/{iid}")
        assert r2.status_code == 200
        body = r2.json()
        assert "institution" in body and "courses" in body
        assert isinstance(body["courses"], list)

    def test_partial_update(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("UPD"), "name": "Orig", "type": "centre"})
        iid = r.json()["institution"]["id"]
        r2 = s.put(f"{BASE_URL}/api/institutions/{iid}", headers={"X-CSRF-Token": csrf},
                   json={"name": "Updated Name"})
        assert r2.status_code == 200
        assert r2.json()["institution"]["name"] == "Updated Name"

    def test_delete_success_when_no_deps(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("DEL"), "name": "Delete Me", "type": "centre"})
        iid = r.json()["institution"]["id"]
        r2 = s.delete(f"{BASE_URL}/api/institutions/{iid}", headers={"X-CSRF-Token": csrf})
        assert r2.status_code == 200
        # confirm gone
        r3 = s.get(f"{BASE_URL}/api/institutions/{iid}")
        assert r3.status_code == 404


# ---------------- 2. Courses CRUD ----------------
class TestCoursesCrud:
    def test_create_requires_fields_422(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf}, json={})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "code" in errs and "name" in errs

    def test_create_invalid_enum_and_type(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("BOGC"), "name": "Bogus", "level": "bogus",
                         "status": "bogus", "duration_months": "twelve"})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "level" in errs and "status" in errs and "duration_months" in errs

    def test_create_with_category_eligibility(self, admin):
        s, csrf = admin
        code = _code("CRS")
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": code, "name": "Diploma in Testing", "level": "diploma",
                         "category": "Health & Social Care", "eligibility": "GCSE English/Maths",
                         "duration_months": 12, "total_credits": 60, "status": "active"})
        assert r.status_code == 201, r.text
        c = r.json()["course"]
        assert c["category"] == "Health & Social Care"
        assert c["eligibility"] == "GCSE English/Maths"
        assert int(c["duration_months"]) == 12

        # Duplicate code
        r2 = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": code, "name": "Dup"})
        assert r2.status_code == 422
        assert "code" in r2.json().get("errors", {})

    def test_list_filters(self, admin):
        s, csrf = admin
        code = _code("FLT")
        s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
               json={"code": code, "name": "Filterable", "level": "certificate",
                     "category": "TestCategoryXYZ", "status": "active"})
        r = s.get(f"{BASE_URL}/api/courses?level=certificate&category=TestCategoryXYZ&status=active")
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()["courses"]]
        assert code in codes

    def test_show_nested_arrays(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("SHW"), "name": "Show Course"})
        cid = r.json()["course"]["id"]
        r2 = s.get(f"{BASE_URL}/api/courses/{cid}")
        assert r2.status_code == 200
        b = r2.json()
        assert "course" in b and "subjects" in b and "sessions" in b and "institutions" in b
        assert isinstance(b["subjects"], list)
        assert isinstance(b["sessions"], list)
        assert isinstance(b["institutions"], list)

    def test_partial_update(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("CUP"), "name": "Orig Name"})
        cid = r.json()["course"]["id"]
        r2 = s.put(f"{BASE_URL}/api/courses/{cid}", headers={"X-CSRF-Token": csrf},
                   json={"category": "Business"})
        assert r2.status_code == 200
        assert r2.json()["course"]["category"] == "Business"

    def test_delete_blocked_by_dependents_409(self, admin):
        s, csrf = admin
        # Create course + subject; delete should return 409
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("DEP"), "name": "Has Deps"})
        cid = r.json()["course"]["id"]
        s.post(f"{BASE_URL}/api/courses/{cid}/subjects", headers={"X-CSRF-Token": csrf},
               json={"subject_code": "SUB1", "subject_name": "Subject One"})
        rdel = s.delete(f"{BASE_URL}/api/courses/{cid}", headers={"X-CSRF-Token": csrf})
        assert rdel.status_code == 409
        # error string in body
        assert "error" in rdel.json()

    def test_delete_success_after_removing_deps(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("DELC"), "name": "Delete Me"})
        cid = r.json()["course"]["id"]
        rdel = s.delete(f"{BASE_URL}/api/courses/{cid}", headers={"X-CSRF-Token": csrf})
        assert rdel.status_code == 200


# ---------------- 3. Course Subjects ----------------
class TestCourseSubjects:
    @pytest.fixture(scope="class")
    def course_id(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("SUBC"), "name": "For Subjects"})
        return r.json()["course"]["id"]

    def test_create_defaults(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/subjects", headers={"X-CSRF-Token": csrf},
                   json={"subject_code": "S001", "subject_name": "First Subject"})
        assert r.status_code == 201, r.text
        sub = r.json()["subject"]
        assert int(sub["max_marks"]) == 100
        assert int(sub["pass_marks"]) == 40

    def test_pass_gt_max_rejected(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/subjects", headers={"X-CSRF-Token": csrf},
                   json={"subject_code": "S002", "subject_name": "Bad", "max_marks": 50, "pass_marks": 90})
        assert r.status_code == 422
        assert "pass_marks" in r.json().get("errors", {})

    def test_missing_required_422(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/subjects", headers={"X-CSRF-Token": csrf},
                   json={"subject_code": "S003"})
        assert r.status_code == 422
        assert "subject_name" in r.json().get("errors", {})

    def test_list_and_update_and_delete(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/subjects", headers={"X-CSRF-Token": csrf},
                   json={"subject_code": "S010", "subject_name": "Ten"})
        sid = r.json()["subject"]["id"]

        lst = s.get(f"{BASE_URL}/api/courses/{course_id}/subjects")
        assert lst.status_code == 200
        assert any(x["id"] == sid for x in lst.json()["subjects"])

        # Update with just pass_marks - validation should use existing max_marks
        upd = s.put(f"{BASE_URL}/api/courses/{course_id}/subjects/{sid}",
                    headers={"X-CSRF-Token": csrf}, json={"pass_marks": 50})
        assert upd.status_code == 200
        assert int(upd.json()["subject"]["pass_marks"]) == 50

        # Update violating rule
        upd_bad = s.put(f"{BASE_URL}/api/courses/{course_id}/subjects/{sid}",
                        headers={"X-CSRF-Token": csrf}, json={"pass_marks": 500})
        assert upd_bad.status_code == 422

        # Delete succeeds (no examination_subjects yet)
        d = s.delete(f"{BASE_URL}/api/courses/{course_id}/subjects/{sid}",
                     headers={"X-CSRF-Token": csrf})
        assert d.status_code == 200


# ---------------- 4. Course Sessions ----------------
class TestCourseSessions:
    @pytest.fixture(scope="class")
    def course_id(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                   json={"code": _code("SESC"), "name": "For Sessions"})
        return r.json()["course"]["id"]

    def test_create_requires_fields(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/sessions",
                   headers={"X-CSRF-Token": csrf}, json={})
        assert r.status_code == 422
        errs = r.json().get("errors", {})
        assert "session_name" in errs and "academic_year" in errs

    def test_invalid_status_422(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/sessions",
                   headers={"X-CSRF-Token": csrf},
                   json={"session_name": "S1", "academic_year": "2025-26", "status": "bogus"})
        assert r.status_code == 422
        assert "status" in r.json().get("errors", {})

    def test_create_list_update_delete(self, admin, course_id):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/courses/{course_id}/sessions",
                   headers={"X-CSRF-Token": csrf},
                   json={"session_name": "Autumn 2025", "academic_year": "2025-26",
                         "start_date": "2025-09-01", "end_date": "2026-01-31", "status": "upcoming"})
        assert r.status_code == 201, r.text
        sid = r.json()["session"]["id"]

        lst = s.get(f"{BASE_URL}/api/courses/{course_id}/sessions")
        assert lst.status_code == 200
        assert any(x["id"] == sid for x in lst.json()["sessions"])

        upd = s.put(f"{BASE_URL}/api/courses/{course_id}/sessions/{sid}",
                    headers={"X-CSRF-Token": csrf}, json={"status": "active"})
        assert upd.status_code == 200
        assert upd.json()["session"]["status"] == "active"

        d = s.delete(f"{BASE_URL}/api/courses/{course_id}/sessions/{sid}",
                     headers={"X-CSRF-Token": csrf})
        assert d.status_code == 200


# ---------------- 5. Institution<->Course linking ----------------
class TestInstitutionCourseLinking:
    def test_link_unlink_flow(self, admin):
        s, csrf = admin
        r1 = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("LNKI"), "name": "Link Inst", "type": "centre"})
        iid = r1.json()["institution"]["id"]
        r2 = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("LNKC"), "name": "Link Course"})
        cid = r2.json()["course"]["id"]

        # Link
        rl = s.post(f"{BASE_URL}/api/institutions/{iid}/courses",
                    headers={"X-CSRF-Token": csrf}, json={"course_id": cid})
        assert rl.status_code == 200, rl.text

        # Idempotent (link again)
        rl2 = s.post(f"{BASE_URL}/api/institutions/{iid}/courses",
                     headers={"X-CSRF-Token": csrf}, json={"course_id": cid})
        assert rl2.status_code == 200

        # Verify from institution side
        gi = s.get(f"{BASE_URL}/api/institutions/{iid}")
        assert cid in [c["id"] for c in gi.json()["courses"]]

        # Verify from course side
        gc = s.get(f"{BASE_URL}/api/courses/{cid}")
        assert iid in [i["id"] for i in gc.json()["institutions"]]

        # Non-existent course -> 404
        rn = s.post(f"{BASE_URL}/api/institutions/{iid}/courses",
                    headers={"X-CSRF-Token": csrf}, json={"course_id": 9999999})
        assert rn.status_code == 404

        # Unlink
        ru = s.delete(f"{BASE_URL}/api/institutions/{iid}/courses/{cid}",
                      headers={"X-CSRF-Token": csrf})
        assert ru.status_code == 200
        gi2 = s.get(f"{BASE_URL}/api/institutions/{iid}")
        assert cid not in [c["id"] for c in gi2.json()["courses"]]

    def test_institution_delete_cascades_link(self, admin):
        s, csrf = admin
        ri = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("CASI"), "name": "Cas Inst", "type": "centre"})
        iid = ri.json()["institution"]["id"]
        rc = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("CASC"), "name": "Cas Course"})
        cid = rc.json()["course"]["id"]
        s.post(f"{BASE_URL}/api/institutions/{iid}/courses",
               headers={"X-CSRF-Token": csrf}, json={"course_id": cid})
        # institution deletion should NOT be blocked by pivot rows
        rd = s.delete(f"{BASE_URL}/api/institutions/{iid}", headers={"X-CSRF-Token": csrf})
        assert rd.status_code == 200, rd.text


# ---------------- 6. RBAC ----------------
class TestRBAC:
    def test_admin_officer_get_institutions(self, admin, officer):
        s_a, _ = admin
        s_o, _ = officer
        r1 = s_a.get(f"{BASE_URL}/api/institutions")
        assert r1.status_code == 200
        r2 = s_o.get(f"{BASE_URL}/api/institutions")
        assert r2.status_code == 403

    def test_officer_forbidden_courses(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/courses")
        assert r.status_code == 403

    def test_officer_forbidden_sessions(self, admin, officer):
        s_a, csrf_a = admin
        # need a course to hit sessions route
        r = s_a.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf_a},
                     json={"code": _code("RBCS"), "name": "For RBAC"})
        cid = r.json()["course"]["id"]
        s_o, _ = officer
        r2 = s_o.get(f"{BASE_URL}/api/courses/{cid}/sessions")
        assert r2.status_code == 403

    def test_examination_officer_courses_and_sessions_ok_but_institutions_forbidden(self, admin, exam_officer):
        s_a, csrf_a = admin
        r = s_a.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf_a},
                     json={"code": _code("EXMC"), "name": "For ExamOfficer"})
        cid = r.json()["course"]["id"]

        s_e, _ = exam_officer
        r1 = s_e.get(f"{BASE_URL}/api/courses")
        assert r1.status_code == 200, r1.text
        r2 = s_e.get(f"{BASE_URL}/api/courses/{cid}/sessions")
        assert r2.status_code == 200, r2.text
        r3 = s_e.get(f"{BASE_URL}/api/institutions")
        assert r3.status_code == 403


# ---------------- 7. CSRF ----------------
class TestCSRF:
    def test_missing_csrf_on_write_403(self, admin):
        s, _ = admin
        r = s.post(f"{BASE_URL}/api/institutions",
                   json={"code": _code("CSR"), "name": "No CSRF", "type": "centre"})
        assert r.status_code == 403
        assert "csrf" in r.text.lower()

    def test_wrong_csrf_on_write_403(self, admin):
        s, _ = admin
        r = s.post(f"{BASE_URL}/api/courses",
                   headers={"X-CSRF-Token": "wrong-token-abc"},
                   json={"code": _code("CSR2"), "name": "Wrong CSRF"})
        assert r.status_code == 403

    def test_missing_csrf_on_subject_write_403(self, admin):
        s, csrf = admin
        r0 = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("CSR3"), "name": "For CSRF sub"})
        cid = r0.json()["course"]["id"]
        r = s.post(f"{BASE_URL}/api/courses/{cid}/subjects",
                   json={"subject_code": "X1", "subject_name": "no csrf"})
        assert r.status_code == 403

    def test_missing_csrf_on_link_403(self, admin):
        s, csrf = admin
        r0 = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("CSR4"), "name": "For CSRF link", "type": "centre"})
        iid = r0.json()["institution"]["id"]
        r = s.post(f"{BASE_URL}/api/institutions/{iid}/courses",
                   json={"course_id": 1})
        assert r.status_code == 403


# ---------------- 8. Audit logging ----------------
class TestAuditLog:
    def test_actions_recorded(self, admin):
        s, csrf = admin
        # Perform a full sequence
        ri = s.post(f"{BASE_URL}/api/institutions", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("AUDI"), "name": "Audit Inst", "type": "centre"})
        iid = ri.json()["institution"]["id"]
        s.put(f"{BASE_URL}/api/institutions/{iid}", headers={"X-CSRF-Token": csrf},
              json={"name": "Audit Inst Renamed"})
        rc = s.post(f"{BASE_URL}/api/courses", headers={"X-CSRF-Token": csrf},
                    json={"code": _code("AUDC"), "name": "Audit Course"})
        cid = rc.json()["course"]["id"]
        s.put(f"{BASE_URL}/api/courses/{cid}", headers={"X-CSRF-Token": csrf},
              json={"category": "Audit"})
        rs = s.post(f"{BASE_URL}/api/courses/{cid}/subjects", headers={"X-CSRF-Token": csrf},
                    json={"subject_code": "AS1", "subject_name": "Audit Sub"})
        sid = rs.json()["subject"]["id"]
        s.delete(f"{BASE_URL}/api/courses/{cid}/subjects/{sid}", headers={"X-CSRF-Token": csrf})
        rsess = s.post(f"{BASE_URL}/api/courses/{cid}/sessions", headers={"X-CSRF-Token": csrf},
                       json={"session_name": "AS", "academic_year": "2025-26"})
        sess_id = rsess.json()["session"]["id"]
        s.post(f"{BASE_URL}/api/institutions/{iid}/courses", headers={"X-CSRF-Token": csrf},
               json={"course_id": cid})
        s.delete(f"{BASE_URL}/api/institutions/{iid}/courses/{cid}", headers={"X-CSRF-Token": csrf})

        time.sleep(0.2)
        actions = mysql("SELECT action FROM audit_logs ORDER BY id DESC LIMIT 30;").split("\n")
        expected = {
            "institution_created", "institution_updated",
            "course_created", "course_updated",
            "course_subject_created", "course_subject_deleted",
            "course_session_created",
            "institution_course_linked", "institution_course_unlinked",
        }
        missing = expected - set(actions)
        assert not missing, f"Missing audit actions: {missing}. Got: {actions}"

        # Verify entity_type/entity_id for one row
        row = mysql(
            f"SELECT entity_type, entity_id FROM audit_logs WHERE action='institution_created' AND entity_id='{iid}' LIMIT 1;"
        )
        assert row.startswith("institutions\t")
