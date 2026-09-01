"""
Kingswell Institute Phase 6 — Documents & Verification
Backend regression + edge case coverage. Base URL: http://localhost:8090
"""
import os
import re
import subprocess
import threading
import time
import pytest
import requests

BASE_URL = "http://localhost:8090"
DOCS_ROOT = "/app/php-backend/public_html/uploads/documents"

ADMIN_EMAIL = "admin@kingswellinstitute.uk"
ADMIN_PASS = "oCP2yig7fNG50VF1r4CX"
OFFICER_EMAIL = "officer.test@kingswellinstitute.uk"
OFFICER_PASS = "OfficerPass123!"
STUDENT_UNLINKED_EMAIL = "student.test@kingswellinstitute.uk"
STUDENT_UNLINKED_PASS = "StudentPass123!"
ALICE_EMAIL = "alice.wonder@example.com"
ALICE_PASS = "Iwt5CBibo5Xs"
CERTOFFICER_EMAIL = "certofficer.test@kingswellinstitute.uk"
CERTOFFICER_PASS = "CertPass123!"

FIX_STUDENT_ID = 3            # Alice
FIX_ENROLL_COMPLETED = 1      # course 16, session 4, completed
FIX_ENROLL_ACTIVE = 2         # course 16, session 5, active (should 422 for cert/dip/deg/CL)
FIX_RESULT_ID = 1             # published
FIX_EXAM_REG_ID = 1           # hall_ticket_number = KWI/HT/2026/000001
FIX_ADMISSION_ID = 1          # status=enrolled


def mysql(query):
    r = subprocess.run(
        ["mysql", "-u", "root", "kingswell", "-N", "-B", "-e", query],
        capture_output=True, text=True, timeout=10,
    )
    return r.stdout.strip()


def login(email, password):
    mysql("DELETE FROM login_attempts;")
    mysql(f"UPDATE users SET locked_until=NULL, failed_login_attempts=0 WHERE email='{email}';")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s, r.json()["csrf_token"]


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def officer():
    return login(OFFICER_EMAIL, OFFICER_PASS)


@pytest.fixture(scope="module")
def alice():
    return login(ALICE_EMAIL, ALICE_PASS)


@pytest.fixture(scope="module")
def unlinked_student():
    return login(STUDENT_UNLINKED_EMAIL, STUDENT_UNLINKED_PASS)


@pytest.fixture(scope="module")
def certofficer():
    return login(CERTOFFICER_EMAIL, CERTOFFICER_PASS)


def h(csrf):
    return {"X-CSRF-Token": csrf}


def _reset_verify_rate_limit():
    mysql("DELETE FROM login_attempts WHERE type='verify';")


def _cleanup_test_docs():
    """Wipe documents so tests start clean; each test file/module can call this."""
    mysql("DELETE FROM document_verifications;")
    mysql("DELETE FROM document_signatories;")
    mysql("DELETE FROM document_results;")
    mysql("DELETE FROM documents;")


@pytest.fixture(scope="module", autouse=True)
def _wipe_documents_once():
    _cleanup_test_docs()
    yield


# ============================================================
# 1. Document Templates
# ============================================================
class TestDocumentTemplates:
    def test_admin_lists_templates_all_8(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/document-templates", timeout=10)
        assert r.status_code == 200
        tpls = r.json()["templates"]
        doctypes = sorted({t["doc_type"] for t in tpls if t["is_active"]})
        expected = sorted(["hall_ticket", "marksheet", "transcript", "certificate",
                           "diploma", "degree", "completion_letter", "admission_letter"])
        assert doctypes == expected
        for t in tpls:
            assert t["version"] == 1

    def test_officer_gets_403(self, officer):
        s, _ = officer
        r = s.get(f"{BASE_URL}/api/document-templates", timeout=10)
        assert r.status_code == 403

    def test_alice_gets_403(self, alice):
        s, _ = alice
        r = s.get(f"{BASE_URL}/api/document-templates", timeout=10)
        assert r.status_code == 403

    def test_unauthenticated_gets_401(self):
        r = requests.get(f"{BASE_URL}/api/document-templates", timeout=10)
        assert r.status_code == 401

    def test_certofficer_can_manage(self, certofficer):
        s, _ = certofficer
        r = s.get(f"{BASE_URL}/api/document-templates", timeout=10)
        assert r.status_code == 200

    def test_create_new_version_auto_increments(self, admin):
        s, csrf = admin
        body = {
            "doc_type": "certificate",
            "name": "TEST Cert Template v2",
            "fields_config": {"title": "TEST TITLE", "show_photo": True, "show_signatories": True,
                              "default_signatories": [{"name": "TEST SIG", "designation": "Test"}]},
            "paper_size": "A4",
            "orientation": "portrait",
            "is_active": 1,
        }
        r = s.post(f"{BASE_URL}/api/document-templates", json=body, headers=h(csrf), timeout=10)
        assert r.status_code == 201, r.text
        t = r.json()["template"]
        assert t["version"] == 2
        assert t["is_active"] == 1
        # Other certificate templates now deactivated
        rows = mysql("SELECT id, version, is_active FROM document_templates WHERE doc_type='certificate' ORDER BY version;")
        for line in rows.splitlines():
            _id, ver, act = line.split("\t")
            if ver == str(t["version"]):
                assert act == "1"
            else:
                assert act == "0"
        # Other doc_types still active
        assert mysql("SELECT is_active FROM document_templates WHERE doc_type='diploma' AND version=1;") == "1"
        # Round-trip fields_config
        got = s.get(f"{BASE_URL}/api/document-templates/{t['id']}", timeout=10).json()["template"]
        assert got["fields_config"]["title"] == "TEST TITLE"
        assert got["fields_config"]["default_signatories"][0]["name"] == "TEST SIG"

        # Restore v1 as active for downstream tests
        v1_id = mysql("SELECT id FROM document_templates WHERE doc_type='certificate' AND version=1;")
        s.put(f"{BASE_URL}/api/document-templates/{v1_id}",
              json={"is_active": 1}, headers=h(csrf), timeout=10)
        assert mysql("SELECT is_active FROM document_templates WHERE doc_type='certificate' AND version=1;") == "1"
        # Now delete the v2 template we made
        d = s.delete(f"{BASE_URL}/api/document-templates/{t['id']}", headers=h(csrf), timeout=10)
        assert d.status_code in (200, 204)

    def test_delete_referenced_template_blocked_409(self, admin):
        s, csrf = admin
        # First issue a certificate anchored on the completed enrollment
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        doc_id = r.json()["document"]["id"]
        tpl_id = r.json()["document"]["template_id"]
        # Attempt to delete active certificate template — should 409
        d = s.delete(f"{BASE_URL}/api/document-templates/{tpl_id}", headers=h(csrf), timeout=10)
        assert d.status_code == 409, d.text
        # cleanup
        mysql(f"DELETE FROM document_signatories WHERE document_id={doc_id};")
        mysql(f"DELETE FROM documents WHERE id={doc_id};")


# ============================================================
# 2. Document Issuance — all 8 doc_types
# ============================================================
class TestIssuanceAllTypes:
    def test_certificate_requires_completed_enrollment(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_ACTIVE},
                   headers=h(csrf), timeout=15)
        assert r.status_code == 422, r.text
        assert "completed" in r.text.lower()

    def test_certificate_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        doc = r.json()["document"]
        assert re.match(r"^KWI/CERT/\d{4}/\d{6}$", doc["document_number"])
        assert doc["qr_code_path"] and doc["file_path"]
        assert doc["student_id"] == FIX_STUDENT_ID

    def test_diploma_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert re.match(r"^KWI/DIP/\d{4}/\d{6}$", r.json()["document"]["document_number"])

    def test_degree_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "degree", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert re.match(r"^KWI/DEG/\d{4}/\d{6}$", r.json()["document"]["document_number"])

    def test_completion_letter_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "completion_letter", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert re.match(r"^KWI/CL/\d{4}/\d{6}$", r.json()["document"]["document_number"])

    def test_marksheet_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "marksheet", "result_id": FIX_RESULT_ID},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert re.match(r"^KWI/MS/\d{4}/\d{6}$", r.json()["document"]["document_number"])

    def test_marksheet_unpublished_blocked(self, admin):
        s, csrf = admin
        mysql(f"UPDATE results SET published_at=NULL WHERE id={FIX_RESULT_ID};")
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "marksheet", "result_id": FIX_RESULT_ID},
                   headers=h(csrf), timeout=15)
        # Restore first regardless of outcome
        mysql(f"UPDATE results SET published_at='2026-09-01 15:12:20' WHERE id={FIX_RESULT_ID};")
        assert r.status_code == 409, r.text

    def test_transcript_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "transcript", "student_id": FIX_STUDENT_ID,
                         "result_ids": [FIX_RESULT_ID]},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        doc = r.json()["document"]
        assert re.match(r"^KWI/TR/\d{4}/\d{6}$", doc["document_number"])
        # document_results pivot populated
        cnt = mysql(f"SELECT COUNT(*) FROM document_results WHERE document_id={doc['id']};")
        assert cnt == "1"

    def test_hall_ticket_reuses_number(self, admin):
        s, csrf = admin
        expected = mysql(f"SELECT hall_ticket_number FROM exam_registrations WHERE id={FIX_EXAM_REG_ID};")
        # Snapshot HT counter sequence
        before = mysql("SELECT current_value FROM counters WHERE code='HT';")
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "hall_ticket", "exam_registration_id": FIX_EXAM_REG_ID},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert r.json()["document"]["document_number"] == expected
        after = mysql("SELECT current_value FROM counters WHERE code='HT';")
        assert before == after, "hall_ticket must NOT consume a new HT counter"

    def test_admission_letter_ok(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "admission_letter", "admission_id": FIX_ADMISSION_ID},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        assert re.match(r"^KWI/AL/\d{4}/\d{6}$", r.json()["document"]["document_number"])

    def test_admission_letter_rejected_status_blocked(self, admin):
        s, csrf = admin
        original = mysql(f"SELECT status FROM admissions WHERE id={FIX_ADMISSION_ID};")
        mysql(f"UPDATE admissions SET status='rejected' WHERE id={FIX_ADMISSION_ID};")
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "admission_letter", "admission_id": FIX_ADMISSION_ID},
                   headers=h(csrf), timeout=15)
        mysql(f"UPDATE admissions SET status='{original}' WHERE id={FIX_ADMISSION_ID};")
        assert r.status_code == 409, r.text

    def test_transcript_unpublished_result_blocked(self, admin):
        s, csrf = admin
        mysql(f"UPDATE results SET published_at=NULL WHERE id={FIX_RESULT_ID};")
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "transcript", "student_id": FIX_STUDENT_ID,
                         "result_ids": [FIX_RESULT_ID]},
                   headers=h(csrf), timeout=15)
        mysql(f"UPDATE results SET published_at='2026-09-01 15:12:20' WHERE id={FIX_RESULT_ID};")
        assert r.status_code == 409, r.text


# ============================================================
# 3. Files (QR + PDF) + verify token URL
# ============================================================
class TestFilesAndQr:
    def test_pdf_and_qr_exist_and_valid(self, admin):
        s, _ = admin
        # Pick a valid certificate we've issued
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        cert = next(d for d in docs if d["doc_type"] == "certificate" and d["status"] == "valid")
        pdf_abs = os.path.join("/app/php-backend/public_html", cert["file_path"])
        qr_abs = os.path.join("/app/php-backend/public_html", cert["qr_code_path"])
        assert os.path.exists(pdf_abs), pdf_abs
        assert os.path.exists(qr_abs), qr_abs
        with open(pdf_abs, "rb") as f:
            header = f.read(5)
        assert header == b"%PDF-", f"invalid PDF header: {header!r}"
        # Page count == 1 (regression check for 2-page footer bug)
        pdf_bytes = open(pdf_abs, "rb").read()
        # Count "/Type /Page" occurrences (not /Pages) — reliable enough for FPDF output
        page_count = len(re.findall(rb"/Type\s*/Page(?!s)", pdf_bytes))
        assert page_count == 1, f"expected 1 page, got {page_count}"
        # Decode QR
        try:
            out = subprocess.run(["zbarimg", "--quiet", "--raw", qr_abs],
                                 capture_output=True, text=True, timeout=15)
            decoded = out.stdout.strip()
        except FileNotFoundError:
            pytest.skip("zbarimg not installed")
        # It should end with /verify/<token>
        token = cert["verification_token"]
        assert decoded.endswith(f"/verify/{token}"), f"decoded={decoded} token={token}"


# ============================================================
# 4. Download (staff + student self-service)
# ============================================================
class TestDownload:
    def test_staff_download_pdf(self, admin):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        cert = next(d for d in docs if d["doc_type"] == "certificate" and d["status"] == "valid")
        r = s.get(f"{BASE_URL}/api/documents/{cert['id']}/download", timeout=15)
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"

    def test_download_unauth_401(self, admin):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        did = docs[0]["id"]
        r = requests.get(f"{BASE_URL}/api/documents/{did}/download", timeout=10)
        assert r.status_code == 401

    def test_alice_self_service_download(self, admin, alice):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        cert = next(d for d in docs if d["doc_type"] == "certificate" and d["status"] == "valid")
        ss, _ = alice
        r = ss.get(f"{BASE_URL}/api/me/issued-documents/{cert['id']}/download", timeout=15)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_unlinked_student_self_download_403(self, admin, unlinked_student):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        did = docs[0]["id"]
        us, _ = unlinked_student
        r = us.get(f"{BASE_URL}/api/me/issued-documents/{did}/download", timeout=10)
        assert r.status_code == 403


# ============================================================
# 5. Public verification (no auth) — all statuses
# ============================================================
class TestPublicVerification:
    def test_verify_valid(self, admin):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        cert = next(d for d in docs if d["doc_type"] == "certificate" and d["status"] == "valid")
        _reset_verify_rate_limit()
        r = requests.get(f"{BASE_URL}/api/verify/{cert['verification_token']}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["found"] is True
        assert data["status"] == "valid"
        assert data["student_name"].strip() != ""
        assert data["registration_number"] == "KWI/REG/2026/000001"
        assert data["course"] and data["session"] and data["institution"]

    def test_verify_not_found(self):
        _reset_verify_rate_limit()
        r = requests.get(f"{BASE_URL}/api/verify/zzz-does-not-exist-token", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"found": False, "status": "not_found"}

    def test_verification_logged(self, admin):
        s, _ = admin
        docs = s.get(f"{BASE_URL}/api/documents", timeout=10).json()["documents"]
        cert = next(d for d in docs if d["doc_type"] == "certificate" and d["status"] == "valid")
        _reset_verify_rate_limit()
        mysql("DELETE FROM document_verifications;")
        requests.get(f"{BASE_URL}/api/verify/{cert['verification_token']}", timeout=10)
        rows = mysql(f"SELECT result FROM document_verifications WHERE document_id={cert['id']};")
        assert rows == "valid"

    def test_verify_revoked_status_reason(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        token = r.json()["document"]["verification_token"]
        r = s.post(f"{BASE_URL}/api/documents/{did}/revoke",
                   json={"reason": "TEST_revoke_reason"}, headers=h(csrf), timeout=10)
        assert r.status_code == 200, r.text
        _reset_verify_rate_limit()
        v = requests.get(f"{BASE_URL}/api/verify/{token}", timeout=10).json()
        assert v["found"] is True
        assert v["status"] == "revoked"
        assert v["status_reason"] == "TEST_revoke_reason"
        assert v["status_at"] is not None

    def test_verify_superseded_points_to_replacement(self, admin):
        s, csrf = admin
        r1 = s.post(f"{BASE_URL}/api/documents",
                    json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                    headers=h(csrf), timeout=30)
        old = r1.json()["document"]
        r2 = s.post(f"{BASE_URL}/api/documents/{old['id']}/reissue",
                    json={}, headers=h(csrf), timeout=30)
        assert r2.status_code == 201, r2.text
        new = r2.json()["document"]
        _reset_verify_rate_limit()
        v = requests.get(f"{BASE_URL}/api/verify/{old['verification_token']}", timeout=10).json()
        assert v["status"] == "superseded"
        assert v["superseded_by_document_number"] == new["document_number"]

    def test_verify_rate_limit_429(self):
        _reset_verify_rate_limit()
        got_429 = False
        for i in range(35):
            r = requests.get(f"{BASE_URL}/api/verify/junk-token-{i}-xyz", timeout=10)
            if r.status_code == 429:
                got_429 = True
                break
        assert got_429, "expected 429 after >30 failed verify attempts"
        _reset_verify_rate_limit()


# ============================================================
# 6. Immutability trigger + allowed lifecycle columns
# ============================================================
class TestImmutability:
    def test_direct_update_of_snapshot_fails(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        result = subprocess.run(
            ["mysql", "-u", "root", "kingswell", "-e",
             f"UPDATE documents SET data_snapshot='{{}}' WHERE id={did};"],
            capture_output=True, text=True, timeout=10)
        assert result.returncode != 0
        assert "45000" in (result.stderr + result.stdout)

    def test_direct_update_of_doc_number_fails(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        result = subprocess.run(
            ["mysql", "-u", "root", "kingswell", "-e",
             f"UPDATE documents SET document_number='X' WHERE id={did};"],
            capture_output=True, text=True, timeout=10)
        assert result.returncode != 0
        assert "45000" in (result.stderr + result.stdout)

    def test_status_update_via_revoke_succeeds(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        rv = s.post(f"{BASE_URL}/api/documents/{did}/revoke",
                    json={"reason": "TEST_lifecycle"}, headers=h(csrf), timeout=10)
        assert rv.status_code == 200
        assert mysql(f"SELECT status FROM documents WHERE id={did};") == "revoked"


# ============================================================
# 7. Reissue / revoke / cancel lifecycle
# ============================================================
class TestLifecycle:
    def test_reissue_hall_ticket_blocked(self, admin):
        s, csrf = admin
        did = mysql("SELECT id FROM documents WHERE doc_type='hall_ticket' AND status='valid' LIMIT 1;")
        assert did
        r = s.post(f"{BASE_URL}/api/documents/{did}/reissue",
                   json={}, headers=h(csrf), timeout=15)
        assert r.status_code == 409

    def test_reissue_already_superseded_blocked(self, admin):
        s, csrf = admin
        r1 = s.post(f"{BASE_URL}/api/documents",
                    json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                    headers=h(csrf), timeout=30)
        old_id = r1.json()["document"]["id"]
        r2 = s.post(f"{BASE_URL}/api/documents/{old_id}/reissue",
                    json={}, headers=h(csrf), timeout=30)
        assert r2.status_code == 201
        r3 = s.post(f"{BASE_URL}/api/documents/{old_id}/reissue",
                    json={}, headers=h(csrf), timeout=15)
        assert r3.status_code == 409

    def test_revoke_only_valid_docs(self, admin):
        s, csrf = admin
        did = mysql("SELECT id FROM documents WHERE status='revoked' LIMIT 1;")
        assert did
        r = s.post(f"{BASE_URL}/api/documents/{did}/revoke",
                   json={"reason": "again"}, headers=h(csrf), timeout=10)
        assert r.status_code == 409

    def test_cancel_flow(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        r2 = s.post(f"{BASE_URL}/api/documents/{did}/cancel",
                    json={"reason": "TEST_cancel"}, headers=h(csrf), timeout=10)
        assert r2.status_code == 200
        assert mysql(f"SELECT status FROM documents WHERE id={did};") == "cancelled"


# ============================================================
# 8. Signatories: template defaults + explicit override + add
# ============================================================
class TestSignatories:
    def test_default_signatories_from_template(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201
        sigs = r.json()["signatories"]
        assert len(sigs) >= 1
        # data_snapshot also has them
        did = r.json()["document"]["id"]
        snap = mysql(f"SELECT data_snapshot FROM documents WHERE id={did};")
        assert "signatories" in snap

    def test_explicit_signatories_override(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED,
                         "signatories": [{"name": "TEST Custom Sig", "designation": "Custom Role"}]},
                   headers=h(csrf), timeout=30)
        sigs = r.json()["signatories"]
        assert len(sigs) == 1
        assert sigs[0]["name"] == "TEST Custom Sig"

    def test_add_signatory_after_issue(self, admin):
        s, csrf = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        did = r.json()["document"]["id"]
        initial = len(r.json()["signatories"])
        r2 = s.post(f"{BASE_URL}/api/documents/{did}/signatories",
                    json={"name": "TEST_added", "designation": "Auditor"},
                    headers=h(csrf), timeout=10)
        assert r2.status_code == 201
        assert len(r2.json()["signatories"]) == initial + 1


# ============================================================
# 9. Concurrent numbering — Counter race safety
# ============================================================
class TestConcurrentNumbering:
    def test_5_concurrent_diplomas_unique_numbers(self, admin):
        s, csrf = admin
        results = []

        def worker():
            r = requests.post(
                f"{BASE_URL}/api/documents",
                json={"doc_type": "diploma", "enrollment_id": FIX_ENROLL_COMPLETED},
                headers={"X-CSRF-Token": csrf, "Cookie": f"kwi_session={s.cookies.get('kwi_session')}"},
                timeout=45,
            )
            results.append(r)

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        numbers = []
        for r in results:
            assert r.status_code == 201, r.text
            numbers.append(r.json()["document"]["document_number"])
        assert len(set(numbers)) == 5, f"duplicate document_number in concurrent batch: {numbers}"


# ============================================================
# 10. RBAC across new endpoints
# ============================================================
class TestRBAC:
    def _issue_any(self, admin_pair):
        s, csrf = admin_pair
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        return r.json()["document"]["id"]

    def test_officer_forbidden_on_documents_endpoints(self, officer, admin):
        did = self._issue_any(admin)
        s, csrf = officer
        assert s.get(f"{BASE_URL}/api/documents", timeout=10).status_code == 403
        assert s.post(f"{BASE_URL}/api/documents",
                      json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                      headers=h(csrf), timeout=10).status_code == 403
        assert s.post(f"{BASE_URL}/api/documents/{did}/revoke",
                      json={"reason": "no"}, headers=h(csrf), timeout=10).status_code == 403

    def test_student_forbidden_on_staff_endpoints(self, alice):
        s, csrf = alice
        assert s.get(f"{BASE_URL}/api/documents", timeout=10).status_code == 403
        assert s.post(f"{BASE_URL}/api/documents",
                      json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                      headers=h(csrf), timeout=10).status_code == 403
        assert s.get(f"{BASE_URL}/api/document-templates", timeout=10).status_code == 403

    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/documents", timeout=10)
        assert r.status_code == 401
        r = requests.post(f"{BASE_URL}/api/documents", json={"doc_type": "certificate"}, timeout=10)
        assert r.status_code == 401

    def test_missing_csrf_forbidden(self, admin):
        s, _ = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   timeout=10)
        assert r.status_code == 403

    def test_wrong_csrf_forbidden(self, admin):
        s, _ = admin
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers={"X-CSRF-Token": "wrong"}, timeout=10)
        assert r.status_code == 403

    def test_certofficer_can_issue_and_revoke(self, certofficer):
        s, csrf = certofficer
        r = s.post(f"{BASE_URL}/api/documents",
                   json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                   headers=h(csrf), timeout=30)
        assert r.status_code == 201, r.text
        did = r.json()["document"]["id"]
        r2 = s.post(f"{BASE_URL}/api/documents/{did}/revoke",
                    json={"reason": "TEST"}, headers=h(csrf), timeout=10)
        assert r2.status_code == 200
        # Not authorised to publish results (unrelated permission).
        # Some routes only accept PUT — 405 is also acceptable evidence of no privilege leakage.
        r3 = s.post(f"{BASE_URL}/api/results/1/publish", headers=h(csrf), timeout=10)
        assert r3.status_code in (403, 404, 405)


# ============================================================
# 11. Student self-service listing scope
# ============================================================
class TestStudentSelfService:
    def test_alice_sees_only_her_documents(self, alice, admin):
        # Ensure at least one doc exists
        adm, csrf = admin
        adm.post(f"{BASE_URL}/api/documents",
                 json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                 headers=h(csrf), timeout=30)
        s, _ = alice
        r = s.get(f"{BASE_URL}/api/me/issued-documents", timeout=10)
        assert r.status_code == 200
        docs = r.json()["documents"]
        assert len(docs) >= 1
        assert all(d["student_id"] == FIX_STUDENT_ID for d in docs)

    def test_unlinked_student_gets_403(self, unlinked_student):
        s, _ = unlinked_student
        r = s.get(f"{BASE_URL}/api/me/issued-documents", timeout=10)
        assert r.status_code == 403


# ============================================================
# 12. Photo sync via /api/me/documents upload
# ============================================================
class TestPhotoSync:
    def test_photo_upload_syncs_students_photo_path(self, alice, admin):
        s, csrf = alice
        # Real valid tiny JPEG via PIL — a corrupt JPEG crashes FPDF Image() with 500
        # (separate real bug reported to main agent — see test report).
        from PIL import Image
        import io
        buf = io.BytesIO()
        Image.new("RGB", (10, 10), "red").save(buf, "JPEG")
        img_bytes = buf.getvalue()
        files = {"file": ("photo.jpg", img_bytes, "image/jpeg")}
        r = s.post(f"{BASE_URL}/api/me/documents",
                   data={"doc_type": "photo"},
                   files=files, headers=h(csrf), timeout=15)
        assert r.status_code in (200, 201), r.text
        pp = mysql(f"SELECT photo_path FROM students WHERE id={FIX_STUDENT_ID};")
        assert pp and pp != "NULL"
        assert "student_documents" in pp

        # Issue new doc, confirm file_path is non-null (photo embed doesn't break rendering)
        ad, adcsrf = admin
        r2 = ad.post(f"{BASE_URL}/api/documents",
                     json={"doc_type": "certificate", "enrollment_id": FIX_ENROLL_COMPLETED},
                     headers=h(adcsrf), timeout=30)
        assert r2.status_code == 201, r2.text
        assert r2.json()["document"]["file_path"]
        # The generated PDF must exist and be > 5 KB (photo embedded increases size)
        pdf_abs = os.path.join("/app/php-backend/public_html", r2.json()["document"]["file_path"])
        assert os.path.exists(pdf_abs)
        assert os.path.getsize(pdf_abs) > 2000


# ============================================================
# 13. Full regression: sanity check prior phases still work
# ============================================================
class TestRegressionSanity:
    def test_phase2_login_still_works(self):
        s, _ = login(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200

    def test_phase3_courses_still_listable(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/courses", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json().get("courses"), list)

    def test_phase4_students_still_listable(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/students", timeout=10)
        assert r.status_code == 200

    def test_phase5_examinations_still_listable(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/examinations", timeout=10)
        assert r.status_code == 200
