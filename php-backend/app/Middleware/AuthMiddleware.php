<?php
namespace App\Middleware;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use PDO;

final class AuthMiddleware
{
    public static function handle(Request $request): void
    {
        $token = Auth::currentToken();
        if (!$token) {
            Response::json(['error' => 'Not authenticated'], 401);
        }

        $pdo = Database::connection();
        $tokenHash = hash('sha256', $token);

        $stmt = $pdo->prepare(
            'SELECT s.id AS session_id, s.expires_at, s.csrf_token,
                    u.id AS user_id, u.uuid, u.first_name, u.last_name, u.email, u.status,
                    u.role_id, u.institution_id, u.student_id, r.slug AS role_slug
             FROM user_sessions s
             JOIN users u ON u.id = s.user_id
             JOIN roles r ON r.id = u.role_id
             WHERE s.token_hash = :token_hash'
        );
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::json(['error' => 'Not authenticated'], 401);
        }

        $now = Auth::now();
        if (new \DateTimeImmutable($row['expires_at'], new \DateTimeZone('UTC')) < $now) {
            $pdo->prepare('DELETE FROM user_sessions WHERE id = :id')->execute(['id' => $row['session_id']]);
            Response::json(['error' => 'Session expired'], 401);
        }

        if ($row['status'] !== 'active') {
            Response::json(['error' => 'Account inactive'], 403);
        }

        // Sliding expiration: every valid request extends the session (this doubles as inactivity timeout).
        $lifetimeMinutes = (int) Config::get('SESSION_LIFETIME_MINUTES', '120');
        $newExpiry = $now->modify("+{$lifetimeMinutes} minutes")->format('Y-m-d H:i:s');
        $pdo->prepare('UPDATE user_sessions SET last_seen_at = :now, expires_at = :exp WHERE id = :id')
            ->execute(['now' => $now->format('Y-m-d H:i:s'), 'exp' => $newExpiry, 'id' => $row['session_id']]);

        $permStmt = $pdo->prepare(
            'SELECT p.slug FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = :role_id'
        );
        $permStmt->execute(['role_id' => $row['role_id']]);

        $request->sessionId = (int) $row['session_id'];
        $request->csrfToken = $row['csrf_token'];
        $request->permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        $request->user = [
            'id'             => (int) $row['user_id'],
            'uuid'           => $row['uuid'],
            'first_name'     => $row['first_name'],
            'last_name'      => $row['last_name'],
            'email'          => $row['email'],
            'role_id'        => (int) $row['role_id'],
            'role_slug'      => $row['role_slug'],
            'institution_id' => $row['institution_id'] !== null ? (int) $row['institution_id'] : null,
            'student_id'     => $row['student_id'] !== null ? (int) $row['student_id'] : null,
        ];
    }
}
