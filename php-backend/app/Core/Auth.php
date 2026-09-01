<?php
namespace App\Core;

use PDO;

final class Auth
{
    public static function createSession(PDO $pdo, int $userId, string $ip, ?string $userAgent): array
    {
        // Opportunistic cleanup of expired sessions (any user) — no cron needed on shared hosting.
        $pdo->exec('DELETE FROM user_sessions WHERE expires_at < UTC_TIMESTAMP()');

        $token = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(32));
        $lifetimeMinutes = (int) Config::get('SESSION_LIFETIME_MINUTES', '120');
        $expiresAt = self::now()->modify("+{$lifetimeMinutes} minutes")->format('Y-m-d H:i:s');

        $pdo->prepare(
            'INSERT INTO user_sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at, last_seen_at)
             VALUES (:user_id, :token_hash, :csrf_token, :ip, :ua, :expires_at, UTC_TIMESTAMP())'
        )->execute([
            'user_id'    => $userId,
            'token_hash' => hash('sha256', $token),
            'csrf_token' => $csrfToken,
            'ip'         => $ip,
            'ua'         => $userAgent,
            'expires_at' => $expiresAt,
        ]);

        return ['token' => $token, 'csrf_token' => $csrfToken, 'expires_at' => $expiresAt];
    }

    public static function destroySessionByToken(PDO $pdo, string $token): void
    {
        $pdo->prepare('DELETE FROM user_sessions WHERE token_hash = :hash')
            ->execute(['hash' => hash('sha256', $token)]);
    }

    public static function cookieName(): string
    {
        return Config::get('SESSION_COOKIE_NAME', 'kwi_session');
    }

    public static function currentToken(): ?string
    {
        return $_COOKIE[self::cookieName()] ?? null;
    }

    public static function setCookie(string $token, int $lifetimeMinutes): void
    {
        setcookie(self::cookieName(), $token, [
            'expires'  => time() + ($lifetimeMinutes * 60),
            'path'     => '/',
            'httponly' => true,
            'secure'   => Config::get('APP_ENV', 'local') !== 'local',
            'samesite' => 'Lax',
        ]);
    }

    public static function clearCookie(): void
    {
        setcookie(self::cookieName(), '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'httponly' => true,
            'secure'   => Config::get('APP_ENV', 'local') !== 'local',
            'samesite' => 'Lax',
        ]);
    }

    public static function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    // Self-service guard: 403 if the authenticated user has no linked student record.
    public static function requireStudentId(Request $request): int
    {
        if (empty($request->user['student_id'])) {
            Response::json(['error' => 'This account is not linked to a student record'], 403);
        }
        return (int) $request->user['student_id'];
    }
}
