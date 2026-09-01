<?php
declare(strict_types=1);

// Idempotent seed: permissions + role->permission mapping.
// Roles and counters are already seeded by schema.sql itself (see migrate.php).
require __DIR__ . '/../app/bootstrap.php';

use App\Core\Database;

$pdo = Database::connection();

$permissions = [
    ['users.manage', 'Manage Users', 'users'],
    ['roles.manage', 'Manage Roles & Permissions', 'roles'],
    ['institutions.manage', 'Manage Institutions/Centres', 'institutions'],
    ['courses.manage', 'Manage Courses & Subjects', 'academics'],
    ['sessions.manage', 'Manage Course Sessions', 'academics'],
    ['admissions.view', 'View Admissions', 'admissions'],
    ['admissions.review', 'Review/Approve/Reject Admissions', 'admissions'],
    ['students.view', 'View Students', 'students'],
    ['students.manage', 'Create/Update Students', 'students'],
    ['students.view_self', 'View Own Student Record', 'students'],
    ['enrollments.manage', 'Manage Enrollments & Roll Numbers', 'enrollments'],
    ['exams.manage', 'Manage Examinations & Subjects', 'examinations'],
    ['exam_registrations.manage', 'Manage Exam Registrations & Hall Tickets', 'examinations'],
    ['marks.enter', 'Enter Marks', 'examinations'],
    ['marks.verify', 'Verify Marks', 'examinations'],
    ['results.publish', 'Compute & Publish Results', 'examinations'],
    ['results.view_self', 'View Own Results', 'examinations'],
    ['documents.issue', 'Issue Documents', 'documents'],
    ['documents.revoke', 'Revoke/Cancel Documents', 'documents'],
    ['documents.view_self', 'View Own Documents', 'documents'],
    ['documents.verify_public', 'Public Document Verification', 'documents'],
    ['payments.record', 'Record Payments', 'finance'],
    ['payments.view', 'View Payments', 'finance'],
    ['payments.view_self', 'View Own Payments', 'finance'],
    ['settings.manage', 'Manage System Settings', 'system'],
];

$insertPermission = $pdo->prepare(
    'INSERT INTO permissions (slug, name, module) VALUES (:slug, :name, :module)
     ON DUPLICATE KEY UPDATE name = VALUES(name), module = VALUES(module)'
);
foreach ($permissions as [$slug, $name, $module]) {
    $insertPermission->execute(['slug' => $slug, 'name' => $name, 'module' => $module]);
}

// Matches the Role -> Capability matrix in docs/ARCHITECTURE.md section 5.
$rolePermissionMap = [
    'super_admin'          => '*',
    'admission_officer'    => ['admissions.view', 'admissions.review', 'students.view', 'students.manage', 'enrollments.manage'],
    'examination_officer'  => ['exams.manage', 'exam_registrations.manage', 'marks.enter', 'marks.verify', 'results.publish', 'students.view'],
    'certificate_officer'  => ['documents.issue', 'documents.revoke', 'students.view'],
    'institution_admin'    => ['students.view', 'students.manage', 'admissions.view', 'admissions.review', 'enrollments.manage', 'payments.record', 'payments.view'],
    'finance'              => ['payments.record', 'payments.view', 'students.view'],
    'student'              => ['students.view_self', 'results.view_self', 'documents.view_self', 'payments.view_self'],
];

$slugToId = array_column($pdo->query('SELECT id, slug FROM permissions')->fetchAll(), 'id', 'slug');
$roleSlugToId = array_column($pdo->query('SELECT id, slug FROM roles')->fetchAll(), 'id', 'slug');

$linkStmt = $pdo->prepare(
    'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (:role_id, :permission_id)'
);

$linked = 0;
foreach ($rolePermissionMap as $roleSlug => $perms) {
    if (!isset($roleSlugToId[$roleSlug])) {
        continue;
    }
    $roleId = $roleSlugToId[$roleSlug];
    $permSlugs = $perms === '*' ? array_keys($slugToId) : $perms;
    foreach ($permSlugs as $permSlug) {
        if (!isset($slugToId[$permSlug])) {
            continue;
        }
        $linkStmt->execute(['role_id' => $roleId, 'permission_id' => $slugToId[$permSlug]]);
        $linked++;
    }
}

echo 'Seed complete: ' . count($permissions) . ' permissions upserted, ' . $linked . " role_permission links processed.\n";
