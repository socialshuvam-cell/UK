<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\AuditLog;
use App\Core\Config;
use App\Core\Database;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;

final class AuthController
{
    private const MAX_ATTEMPTS = 5;
    private const WINDOW_MINUTES = 15;
    private const LOCKOUT_MINUTES = 15;

    public function login(Request $request): void
    {
        $pdo = Database::connection();
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $email = strtolower(trim((string) ($request->body['email'] ?? '')));
        $password = (string) ($request->body['password'] ?? '');

        if ($email === '' || $password === '') {
            Response::json(['error' => 'Email and password are required'], 422);
        }

        if (RateLimiter::isBlocked($pdo, $email, $ip, 'login', self::MAX_ATTEMPTS, self::WINDOW_MINUTES)) {
            Response::json(['error' => 'Too many failed login attempts. Please try again later.'], 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user) {
            RateLimiter::record($pdo, $email, $ip, 'login', false);
            Response::json(['error' => 'Invalid email or password'], 401);
        }

        if ($user['status'] !== 'active') {
            RateLimiter::record($pdo, $email, $ip, 'login', false);
            Response::json(['error' => 'Account is not active'], 403);
        }

        if ($user['locked_until'] !== null && new \DateTimeImmutable($user['locked_until'], new \DateTimeZone('UTC')) > Auth::now()) {
            RateLimiter::record($pdo, $email, $ip, 'login', false);
            Response::json(['error' => 'Account temporarily locked due to failed attempts. Please try again later.'], 423);
        }

        if (!password_verify($password, $user['password_hash'])) {
            RateLimiter::record($pdo, $email, $ip, 'login', false);

            $attempts = (int) $user['failed_login_attempts'] + 1;
            $lockedUntil = $attempts >= self::MAX_ATTEMPTS
                ? Auth::now()->modify('+' . self::LOCKOUT_MINUTES . ' minutes')->format('Y-m-d H:i:s')
                : null;

            $pdo->prepare('UPDATE users SET failed_login_attempts = :a, locked_until = :l WHERE id = :id')
                ->execute(['a' => $attempts, 'l' => $lockedUntil, 'id' => $user['id']]);

            AuditLog::record($pdo, (int) $user['id'], 'login_failed', 'users', (string) $user['id']);

            Response::json(['error' => 'Invalid email or password'], 401);
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')
                ->execute(['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $user['id']]);
        }

        // Session-fixation defense: drop any session tied to an incoming cookie, then issue a fresh token.
        $existingToken = Auth::currentToken();
        if ($existingToken) {
            Auth::destroySessionByToken($pdo, $existingToken);
        }

        $pdo->prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = :id')
            ->execute(['id' => $user['id']]);

        $lifetimeMinutes = (int) Config::get('SESSION_LIFETIME_MINUTES', '120');
        $session = Auth::createSession($pdo, (int) $user['id'], $ip, $_SERVER['HTTP_USER_AGENT'] ?? null);
        Auth::setCookie($session['token'], $lifetimeMinutes);

        RateLimiter::record($pdo, $email, $ip, 'login', true);
        AuditLog::record($pdo, (int) $user['id'], 'login', 'users', (string) $user['id']);

        $roleStmt = $pdo->prepare('SELECT slug, name FROM roles WHERE id = :id');
        $roleStmt->execute(['id' => $user['role_id']]);
        $role = $roleStmt->fetch();

        Response::json([
            'user' => [
                'id'             => (int) $user['id'],
                'uuid'           => $user['uuid'],
                'first_name'     => $user['first_name'],
                'last_name'      => $user['last_name'],
                'email'          => $user['email'],
                'role'           => $role['slug'],
                'role_name'      => $role['name'],
                'institution_id' => $user['institution_id'] !== null ? (int) $user['institution_id'] : null,
                'student_id'     => $user['student_id'] !== null ? (int) $user['student_id'] : null,
            ],
            'csrf_token' => $session['csrf_token'],
        ]);
    }

    public function logout(Request $request): void
    {
        $pdo = Database::connection();
        $token = Auth::currentToken();
        if ($token) {
            Auth::destroySessionByToken($pdo, $token);
        }
        Auth::clearCookie();

        AuditLog::record(
            $pdo,
            $request->user['id'] ?? null,
            'logout',
            'users',
            isset($request->user['id']) ? (string) $request->user['id'] : null
        );

        Response::json(['message' => 'Logged out']);
    }

    public function me(Request $request): void
    {
        Response::json([
            'user'        => $request->user,
            'permissions' => $request->permissions,
            'csrf_token'  => $request->csrfToken,
        ]);
    }
}
