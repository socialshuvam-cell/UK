<?php
namespace App\Core;

use PDO;

final class RateLimiter
{
    public static function isBlocked(
        PDO $pdo,
        string $identifier,
        string $ip,
        string $type,
        int $maxAttempts,
        int $windowMinutes
    ): bool {
        $since = Auth::now()->modify("-{$windowMinutes} minutes")->format('Y-m-d H:i:s');

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS attempts FROM login_attempts
             WHERE attempt_type = :type AND success = 0 AND attempted_at >= :since
               AND (identifier = :identifier OR ip_address = :ip)'
        );
        $stmt->execute(['type' => $type, 'since' => $since, 'identifier' => $identifier, 'ip' => $ip]);

        return (int) $stmt->fetch()['attempts'] >= $maxAttempts;
    }

    public static function record(PDO $pdo, string $identifier, string $ip, string $type, bool $success): void
    {
        $pdo->prepare(
            'INSERT INTO login_attempts (identifier, ip_address, attempt_type, success) VALUES (:identifier, :ip, :type, :success)'
        )->execute([
            'identifier' => $identifier,
            'ip'         => $ip,
            'type'       => $type,
            'success'    => $success ? 1 : 0,
        ]);
    }
}
