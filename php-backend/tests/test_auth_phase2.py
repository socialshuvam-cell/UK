"""
Kingswell Institute Phase 2 — Authentication & RBAC backend tests.
Base URL: http://localhost:8090 (local Apache PHP vhost).
"""
import os
import subprocess
import time
import pytest
import requests

BASE_URL = "http://localhost:8090"

ADMIN_EMAIL = "admin@kingswellinstitute.uk"
ADMIN_PASS = "oCP2yig7fNG50VF1r4CX"
STUDENT_EMAIL = "student.test@kingswellinstitute.uk"
STUDENT_PASS = "StudentPass123!"
OFFICER_EMAIL = "officer.test@kingswellinstitute.uk"
OFFICER_PASS = "OfficerPass123!"


def mysql(query):
    """Run a mysql query and return stdout (tab-separated)."""
    r = subprocess.run(
        ["mysql", "-u", "root", "kingswell", "-N", "-B", "-e", query],
        capture_output=True, text=True, timeout=10,
    )
    return r.stdout.strip()


def login(email, password, session=None):
    s = session or requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password}, timeout=10)
    return s, r


# --- 1. Login success ---------------------------------------------------------
class TestLoginSuccess:
    def test_login_super_admin_returns_200_and_sets_cookie(self):
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "csrf_token" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert isinstance(data["csrf_token"], str) and len(data["csrf_token"]) > 10
        # Cookie set
        assert "kwi_session" in s.cookies.get_dict()
        # HttpOnly attribute in Set-Cookie header
        set_cookie = r.headers.get("Set-Cookie", "")
        assert "HttpOnly" in set_cookie, f"HttpOnly missing: {set_cookie}"
        # Secure absent locally (APP_ENV=local)
        assert "Secure" not in set_cookie, f"Secure should be absent locally: {set_cookie}"

    def test_login_wrong_password_returns_401_generic(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong_pw_xyz"}, timeout=10)
        assert r.status_code == 401
        body = r.text.lower()
        assert "invalid email or password" in body
        # must not reveal whether email exists
        assert "not found" not in body and "does not exist" not in body

    def test_login_nonexistent_email_same_error(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "no.such.user@kingswellinstitute.uk", "password": "whatever"}, timeout=10)
        assert r.status_code == 401
        assert "invalid email or password" in r.text.lower()


# --- 2. Rate limiting ---------------------------------------------------------
class TestRateLimit:
    def test_rate_limit_returns_429_after_5_fails(self):
        # Use a fresh throwaway email tied to same IP so email+IP combined threshold hits.
        email = "ratelimit.test@kingswellinstitute.uk"
        mysql(f"DELETE FROM login_attempts WHERE email='{email}';")
        got_429 = False
        for i in range(7):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "bad"}, timeout=10)
            if r.status_code == 429:
                got_429 = True
                assert "too many" in r.text.lower()
                break
        assert got_429, "Expected 429 within 7 attempts"


# --- 3. Account lockout -------------------------------------------------------
class TestAccountLockout:
    def test_locked_until_set_after_repeated_failures(self):
        # Reset counters, then hammer wrong password for student user.
        mysql("DELETE FROM login_attempts;")
        mysql(f"UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE email='{STUDENT_EMAIL}';")
        for _ in range(6):
            requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": STUDENT_EMAIL, "password": "wrong"}, timeout=10)
        locked = mysql(f"SELECT locked_until FROM users WHERE email='{STUDENT_EMAIL}';")
        assert locked and locked.upper() != "NULL", f"locked_until not set: {locked!r}"
        # Reset for downstream tests
        mysql(f"UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE email='{STUDENT_EMAIL}';")
        mysql("DELETE FROM login_attempts;")


# --- 4. /api/auth/me ----------------------------------------------------------
class TestMeEndpoint:
    def test_me_without_cookie_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_with_cookie_returns_user_permissions_csrf(self):
        mysql("DELETE FROM login_attempts;")
        s, _ = login(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "permissions" in data and "csrf_token" in data
        assert isinstance(data["permissions"], list) and len(data["permissions"]) > 0
        assert "users.manage" in data["permissions"]


# --- 5. Session regeneration on login ----------------------------------------
class TestSessionRegeneration:
    def test_new_session_token_issued_on_login(self):
        mysql("DELETE FROM login_attempts;")
        s = requests.Session()
        # Pre-set a fake cookie value.
        s.cookies.set("kwi_session", "fake-preexisting-token-12345", domain="localhost")
        _, r = login(ADMIN_EMAIL, ADMIN_PASS, session=s)
        assert r.status_code == 200
        # The Set-Cookie header on the login response must contain a new token
        set_cookie = r.headers.get("Set-Cookie", "")
        assert "kwi_session=" in set_cookie
        assert "fake-preexisting-token-12345" not in set_cookie
        # And at least one cookie in the jar is not the fake one
        all_vals = [c.value for c in s.cookies if c.name == "kwi_session"]
        assert any(v != "fake-preexisting-token-12345" for v in all_vals)


# --- 6. Session expiry & sliding expiration -----------------------------------
class TestSessionExpiry:
    def test_expired_session_returns_401_and_gets_deleted(self):
        mysql("DELETE FROM login_attempts;")
        mysql("DELETE FROM user_sessions;")  # start clean
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        user_id = mysql(f"SELECT id FROM users WHERE email='{ADMIN_EMAIL}';")
        # Force expiry of this session
        mysql(f"UPDATE user_sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE user_id={user_id};")
        before = int(mysql(f"SELECT COUNT(*) FROM user_sessions WHERE user_id={user_id};") or 0)
        assert before >= 1
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r2.status_code == 401
        # The specific expired session should be gone
        after = int(mysql(f"SELECT COUNT(*) FROM user_sessions WHERE user_id={user_id};") or 0)
        assert after < before, f"Expired session not cleaned up (before={before}, after={after})"

    def test_sliding_expiration_extends_expires_at(self):
        mysql("DELETE FROM login_attempts;")
        s, _ = login(ADMIN_EMAIL, ADMIN_PASS)
        user_id = mysql(f"SELECT id FROM users WHERE email='{ADMIN_EMAIL}';")
        # Force expires_at back by 30 min so we can observe a bump
        mysql(f"UPDATE user_sessions SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE) WHERE user_id={user_id};")
        before = mysql(f"SELECT MAX(expires_at) FROM user_sessions WHERE user_id={user_id};")
        time.sleep(1.2)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        after = mysql(f"SELECT MAX(expires_at) FROM user_sessions WHERE user_id={user_id};")
        assert after > before, f"expires_at not extended: before={before} after={after}"


# --- 7. Logout & CSRF ---------------------------------------------------------
class TestLogoutCsrf:
    def test_logout_without_csrf_403(self):
        mysql("DELETE FROM login_attempts;")
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        r2 = s.post(f"{BASE_URL}/api/auth/logout", timeout=10)
        assert r2.status_code == 403
        assert "csrf" in r2.text.lower()

    def test_logout_wrong_csrf_403(self):
        mysql("DELETE FROM login_attempts;")
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        r2 = s.post(f"{BASE_URL}/api/auth/logout",
                    headers={"X-CSRF-Token": "wrong-token"}, timeout=10)
        assert r2.status_code == 403

    def test_logout_with_csrf_success_and_session_destroyed(self):
        mysql("DELETE FROM login_attempts;")
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        csrf = r.json()["csrf_token"]
        r2 = s.post(f"{BASE_URL}/api/auth/logout",
                    headers={"X-CSRF-Token": csrf}, timeout=10)
        assert r2.status_code == 200, r2.text
        # Session should now be invalid
        r3 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r3.status_code == 401


# --- 8. RBAC / Permission middleware -----------------------------------------
class TestRBAC:
    def _sess(self, email, pw):
        mysql("DELETE FROM login_attempts;")
        s, r = login(email, pw)
        assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
        return s

    def test_admin_only_super_admin_200(self):
        s = self._sess(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/admin-only", timeout=10)
        assert r.status_code == 200, r.text

    def test_admin_only_student_403(self):
        s = self._sess(STUDENT_EMAIL, STUDENT_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/admin-only", timeout=10)
        assert r.status_code == 403

    def test_admin_only_officer_403(self):
        s = self._sess(OFFICER_EMAIL, OFFICER_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/admin-only", timeout=10)
        assert r.status_code == 403

    def test_students_view_officer_200(self):
        s = self._sess(OFFICER_EMAIL, OFFICER_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/students-view", timeout=10)
        assert r.status_code == 200

    def test_students_view_admin_200(self):
        s = self._sess(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/students-view", timeout=10)
        assert r.status_code == 200

    def test_students_view_student_403(self):
        s = self._sess(STUDENT_EMAIL, STUDENT_PASS)
        r = s.get(f"{BASE_URL}/api/diagnostics/students-view", timeout=10)
        assert r.status_code == 403


# --- 9. Audit logging ---------------------------------------------------------
class TestAuditLog:
    def test_audit_rows_created_for_login_failed_logout(self):
        mysql("DELETE FROM login_attempts;")
        before = int(mysql("SELECT COUNT(*) FROM audit_logs;") or 0)
        # Failed login
        requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
        # Success + logout
        s, r = login(ADMIN_EMAIL, ADMIN_PASS)
        csrf = r.json()["csrf_token"]
        s.post(f"{BASE_URL}/api/auth/logout", headers={"X-CSRF-Token": csrf}, timeout=10)
        after = int(mysql("SELECT COUNT(*) FROM audit_logs;") or 0)
        assert after >= before + 3, f"audit_logs did not grow enough: {before}->{after}"
        actions = mysql("SELECT action FROM audit_logs ORDER BY id DESC LIMIT 10;").split("\n")
        assert "login" in actions
        assert "login_failed" in actions
        assert "logout" in actions


# --- 10. Bootstrap script idempotency -----------------------------------------
class TestBootstrapIdempotent:
    def test_bootstrap_second_run_no_new_user(self):
        before = int(mysql("SELECT COUNT(*) FROM users;") or 0)
        r = subprocess.run(
            ["php", "database/bootstrap_admin.php"],
            cwd="/app/php-backend", capture_output=True, text=True, timeout=15,
        )
        assert r.returncode == 0, r.stderr
        out = (r.stdout + r.stderr).lower()
        assert "already exists" in out or "exists" in out, f"unexpected output: {r.stdout}"
        after = int(mysql("SELECT COUNT(*) FROM users;") or 0)
        assert after == before, f"user count changed: {before}->{after}"
