<?php
namespace App\Core;

use PDO;

final class AuditLog
{
    public static function record(
        PDO $pdo,
        ?int $userId,
        string $action,
        ?string $entityType = null,
        ?string $entityId = null,
        ?array $oldValues = null,
        ?array $newValues = null
    ): void {
        $pdo->prepare(
            'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
             VALUES (:user_id, :action, :entity_type, :entity_id, :old_values, :new_values, :ip, :ua)'
        )->execute([
            'user_id'     => $userId,
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'old_values'  => $oldValues !== null ? json_encode($oldValues) : null,
            'new_values'  => $newValues !== null ? json_encode($newValues) : null,
            'ip'          => $_SERVER['REMOTE_ADDR'] ?? null,
            'ua'          => $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
    }
}
