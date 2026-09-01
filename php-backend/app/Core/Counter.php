<?php
namespace App\Core;

use PDO;

// Collision-safe, server-side-only identifier allocation (registration numbers, roll
// numbers, admission numbers, ...). Never trust a number supplied by the client.
final class Counter
{
    public static function next(PDO $pdo, string $sequenceKey, string $scopeKey = ''): string
    {
        $year = (int) date('Y');
        $ownTransaction = !$pdo->inTransaction();
        if ($ownTransaction) {
            $pdo->beginTransaction();
        }

        try {
            $stmt = $pdo->prepare(
                'SELECT id, current_value, padding, format_template FROM counters
                 WHERE sequence_key = :key AND scope_key = :scope AND year = :year
                 FOR UPDATE'
            );
            $stmt->execute(['key' => $sequenceKey, 'scope' => $scopeKey, 'year' => $year]);
            $row = $stmt->fetch();

            if (!$row) {
                // Bootstrap a (sequence_key, scope_key, year) row using an existing
                // template row for this sequence_key (e.g. year rollover, new scope).
                $templateStmt = $pdo->prepare(
                    'SELECT padding, format_template FROM counters WHERE sequence_key = :key ORDER BY id LIMIT 1'
                );
                $templateStmt->execute(['key' => $sequenceKey]);
                $template = $templateStmt->fetch();
                if (!$template) {
                    throw new \RuntimeException("No counter template found for sequence_key '{$sequenceKey}'");
                }

                $pdo->prepare(
                    'INSERT INTO counters (sequence_key, scope_key, year, current_value, padding, format_template)
                     VALUES (:key, :scope, :year, 0, :padding, :format)'
                )->execute([
                    'key'      => $sequenceKey,
                    'scope'    => $scopeKey,
                    'year'     => $year,
                    'padding'  => $template['padding'],
                    'format'   => $template['format_template'],
                ]);

                $stmt->execute(['key' => $sequenceKey, 'scope' => $scopeKey, 'year' => $year]);
                $row = $stmt->fetch();
            }

            $nextValue = (int) $row['current_value'] + 1;
            $pdo->prepare('UPDATE counters SET current_value = :v WHERE id = :id')
                ->execute(['v' => $nextValue, 'id' => $row['id']]);

            if ($ownTransaction) {
                $pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($ownTransaction) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $seq = str_pad((string) $nextValue, (int) $row['padding'], '0', STR_PAD_LEFT);
        $shortYear = substr((string) $year, -2);

        return str_replace(
            ['{year}', '{yy}', '{scope}', '{seq}'],
            [(string) $year, $shortYear, $scopeKey, $seq],
            $row['format_template']
        );
    }
}
