<?php
declare(strict_types=1);

// One-time CLI bootstrap for the Super Admin account. Intentionally NOT an
// HTTP endpoint (never exposed over the web) — run once via SSH/CLI on a
// fresh install. Idempotent: does nothing if the email already exists.
require __DIR__ . '/../app/bootstrap.php';

use App\Core\Config;
use App\Core\Database;

$pdo = Database::connection();

$email = strtolower(trim(Config::required('SUPER_ADMIN_EMAIL')));
$password = Config::required('SUPER_ADMIN_PASSWORD');
$firstName = Config::get('SUPER_ADMIN_FIRST_NAME', 'Super');
$lastName = Config::get('SUPER_ADMIN_LAST_NAME', 'Admin');

$roleStmt = $pdo->prepare("SELECT id FROM roles WHERE slug = 'super_admin'");
$roleStmt->execute();
$role = $roleStmt->fetch();

if (!$role) {
    fwrite(STDERR, "super_admin role not found — run database/seed.php first.\n");
    exit(1);
}

$existingStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email');
$existingStmt->execute(['email' => $email]);

if ($existingStmt->fetch()) {
    echo "Super Admin already exists ({$email}) — no changes made.\n";
    exit(0);
}

$pdo->prepare(
    'INSERT INTO users (uuid, role_id, first_name, last_name, email, password_hash, status)
     VALUES (UUID(), :role_id, :first_name, :last_name, :email, :password_hash, "active")'
)->execute([
    'role_id'       => $role['id'],
    'first_name'    => $firstName,
    'last_name'     => $lastName,
    'email'         => $email,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);

echo "Super Admin created: {$email}\n";
