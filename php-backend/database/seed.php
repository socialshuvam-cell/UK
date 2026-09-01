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
    ['documents.templates.manage', 'Manage Document Templates', 'documents'],
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
    'examination_officer'  => ['courses.manage', 'sessions.manage', 'exams.manage', 'exam_registrations.manage', 'marks.enter', 'marks.verify', 'results.publish', 'students.view', 'enrollments.manage'],
    'certificate_officer'  => ['documents.issue', 'documents.revoke', 'documents.templates.manage', 'students.view'],
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

// Phase 6: one default active template per doc_type (idempotent — skipped if
// a version already exists for that doc_type). fields_config drives the
// generic PDF renderer (title, body_text with {{placeholders}}, show flags,
// default_signatories) without ever hard-coding a design in PHP.
$defaultTemplates = [
    ['hall_ticket', 'Standard Hall Ticket', ['title' => 'EXAMINATION HALL TICKET', 'show_photo' => true, 'show_signatories' => true,
        'default_signatories' => [['name' => 'Controller of Examinations', 'designation' => 'Kingswell Institute']]]],
    ['marksheet', 'Standard Marksheet', ['title' => 'STATEMENT OF MARKS', 'show_photo' => false, 'show_signatories' => true,
        'default_signatories' => [['name' => 'Controller of Examinations', 'designation' => 'Kingswell Institute']]]],
    ['transcript', 'Standard Transcript', ['title' => 'ACADEMIC TRANSCRIPT', 'show_photo' => false, 'show_signatories' => true,
        'default_signatories' => [['name' => 'Registrar', 'designation' => 'Kingswell Institute']]]],
    ['certificate', 'Standard Certificate of Completion', ['title' => 'CERTIFICATE OF COMPLETION', 'show_photo' => true, 'show_signatories' => true,
        'body_text' => 'This is to certify that {{student_name}}, Registration No. {{registration_number}}, has successfully completed the course "{{course_name}}" during the {{session_name}} session at {{institution_name}}.',
        'default_signatories' => [['name' => 'Registrar', 'designation' => 'Kingswell Institute'], ['name' => 'Director', 'designation' => 'Kingswell Institute']]]],
    ['diploma', 'Standard Diploma', ['title' => 'DIPLOMA', 'show_photo' => true, 'show_signatories' => true,
        'body_text' => 'This is to certify that {{student_name}}, Registration No. {{registration_number}}, has been awarded this Diploma in "{{course_name}}" having completed the {{session_name}} session at {{institution_name}}.',
        'default_signatories' => [['name' => 'Registrar', 'designation' => 'Kingswell Institute'], ['name' => 'Director', 'designation' => 'Kingswell Institute']]]],
    ['degree', 'Standard Degree Certificate', ['title' => 'DEGREE CERTIFICATE', 'show_photo' => true, 'show_signatories' => true,
        'body_text' => 'This is to certify that {{student_name}}, Registration No. {{registration_number}}, has been conferred the Degree in "{{course_name}}" having completed the {{session_name}} session at {{institution_name}}.',
        'default_signatories' => [['name' => 'Registrar', 'designation' => 'Kingswell Institute'], ['name' => 'Director', 'designation' => 'Kingswell Institute']]]],
    ['completion_letter', 'Standard Completion Letter', ['title' => 'COURSE COMPLETION LETTER', 'show_photo' => false, 'show_signatories' => true,
        'body_text' => 'This is to inform that {{student_name}} (Roll No. {{roll_number}}, Registration No. {{registration_number}}) has successfully completed the course "{{course_name}}" during the {{session_name}} session at {{institution_name}}.',
        'default_signatories' => [['name' => 'Registrar', 'designation' => 'Kingswell Institute']]]],
    ['admission_letter', 'Standard Admission Letter', ['title' => 'ADMISSION LETTER', 'show_photo' => false, 'show_signatories' => true,
        'body_text' => 'We are pleased to inform {{student_name}} that admission (No. {{admission_number}}) to the course "{{course_name}}" for the {{session_name}} session at {{institution_name}} has been confirmed.',
        'default_signatories' => [['name' => 'Admissions Officer', 'designation' => 'Kingswell Institute']]]],
];

$templatesCreated = 0;
$existsStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM document_templates WHERE doc_type = :doc_type');
$insertTemplateStmt = $pdo->prepare(
    'INSERT INTO document_templates (doc_type, name, version, fields_config, paper_size, orientation, is_active)
     VALUES (:doc_type, :name, 1, :fields, "A4", "portrait", 1)'
);
foreach ($defaultTemplates as [$docType, $name, $fieldsConfig]) {
    $existsStmt->execute(['doc_type' => $docType]);
    if ((int) $existsStmt->fetch()['c'] > 0) {
        continue;
    }
    $insertTemplateStmt->execute(['doc_type' => $docType, 'name' => $name, 'fields' => json_encode($fieldsConfig)]);
    $templatesCreated++;
}

echo "Document templates: {$templatesCreated} default template(s) created.\n";
