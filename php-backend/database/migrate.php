<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

use App\Core\Config;

$schemaPath = __DIR__ . '/schema.sql';
if (!is_file($schemaPath)) {
    fwrite(STDERR, "schema.sql not found at {$schemaPath}\n");
    exit(1);
}

$sql = file_get_contents($schemaPath);

$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
    Config::required('DB_HOST'),
    Config::get('DB_PORT', '3306'),
    Config::required('DB_DATABASE'),
    Config::get('DB_CHARSET', 'utf8mb4')
);

$pdo = new PDO($dsn, Config::required('DB_USERNAME'), Config::required('DB_PASSWORD'), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// The trg_documents_immutable trigger uses a custom DELIMITER block. It must
// run in-place (after `documents` is created), so swap it for a placeholder
// before the plain ";"-split below, then substitute the real SQL back in.
$triggerSql = null;
$placeholder = '__TRIGGER_PLACEHOLDER__';
if (preg_match('/DELIMITER\s*\/\/(.*?)DELIMITER\s*;/s', $sql, $match)) {
    $triggerBody = trim($match[1]);
    $triggerSql = trim(preg_replace('/\/\/\s*$/', '', $triggerBody));
    $sql = str_replace($match[0], "{$placeholder};\n", $sql);
}

$statements = [];
foreach (explode(";\n", $sql) as $chunk) {
    $chunk = trim($chunk);
    if ($chunk === '') {
        continue;
    }
    $statements[] = (str_contains($chunk, $placeholder) && $triggerSql !== null) ? $triggerSql : $chunk;
}

$executed = 0;
foreach ($statements as $statement) {
    $statement = trim($statement);
    if ($statement === '') {
        continue;
    }
    $pdo->exec($statement);
    $executed++;
}

echo "Migration complete: {$executed} statements executed against '" . Config::required('DB_DATABASE') . "'.\n";
