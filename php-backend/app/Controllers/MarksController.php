<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class MarksController
{
    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $regId = (int) $request->params['regId'];
        $stmt = $pdo->prepare(
            'SELECT m.*, es.max_marks, es.pass_marks, cs.subject_code, cs.subject_name
             FROM marks m
             JOIN examination_subjects es ON es.id = m.examination_subject_id
             JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE m.exam_registration_id = :reg_id'
        );
        $stmt->execute(['reg_id' => $regId]);
        Response::json(['marks' => $stmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $regId = (int) $request->params['regId'];

        $regStmt = $pdo->prepare('SELECT * FROM exam_registrations WHERE id = :id');
        $regStmt->execute(['id' => $regId]);
        $registration = $regStmt->fetch();
        if (!$registration) {
            Response::json(['error' => 'Exam registration not found'], 404);
        }

        $v = new Validator($request->body);
        $v->required('examination_subject_id')->integer('examination_subject_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $subjectId = (int) $request->body['examination_subject_id'];
        $subjectStmt = $pdo->prepare('SELECT * FROM examination_subjects WHERE id = :id AND examination_id = :exam_id');
        $subjectStmt->execute(['id' => $subjectId, 'exam_id' => $registration['examination_id']]);
        $subject = $subjectStmt->fetch();
        if (!$subject) {
            Response::json(['errors' => ['examination_subject_id' => ["Subject does not belong to this registration's examination"]]], 422);
        }

        $isAbsent = !empty($request->body['is_absent']);
        $marksObtained = $isAbsent ? null : ($request->body['marks_obtained'] ?? null);

        if (!$isAbsent) {
            if ($marksObtained === null || !is_numeric($marksObtained)) {
                Response::json(['errors' => ['marks_obtained' => ['marks_obtained is required unless is_absent is true']]], 422);
            }
            if ((float) $marksObtained < 0 || (float) $marksObtained > (float) $subject['max_marks']) {
                Response::json(['errors' => ['marks_obtained' => ["marks_obtained must be between 0 and {$subject['max_marks']}"]]], 422);
            }
        }

        $pdo->prepare(
            'INSERT INTO marks (exam_registration_id, examination_subject_id, marks_obtained, is_absent, entered_by)
             VALUES (:reg_id, :subject_id, :marks, :absent, :entered_by)
             ON DUPLICATE KEY UPDATE marks_obtained = :marks2, is_absent = :absent2, entered_by = :entered_by2, verified_by = NULL, verified_at = NULL'
        )->execute([
            'reg_id'      => $regId,
            'subject_id'  => $subjectId,
            'marks'       => $marksObtained,
            'absent'      => $isAbsent ? 1 : 0,
            'entered_by'  => $request->user['id'],
            'marks2'      => $marksObtained,
            'absent2'     => $isAbsent ? 1 : 0,
            'entered_by2' => $request->user['id'],
        ]);

        $markStmt = $pdo->prepare('SELECT * FROM marks WHERE exam_registration_id = :reg_id AND examination_subject_id = :subject_id');
        $markStmt->execute(['reg_id' => $regId, 'subject_id' => $subjectId]);
        $mark = $markStmt->fetch();

        AuditLog::record($pdo, $request->user['id'], 'marks_entered', 'marks', (string) $mark['id'], null, $mark);

        Response::json(['mark' => $mark], 201);
    }

    public function verify(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];

        $stmt = $pdo->prepare('SELECT * FROM marks WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::json(['error' => 'Marks record not found'], 404);
        }

        $pdo->prepare('UPDATE marks SET verified_by = :by, verified_at = UTC_TIMESTAMP() WHERE id = :id')
            ->execute(['by' => $request->user['id'], 'id' => $id]);

        $updatedStmt = $pdo->prepare('SELECT * FROM marks WHERE id = :id');
        $updatedStmt->execute(['id' => $id]);
        $updated = $updatedStmt->fetch();

        AuditLog::record($pdo, $request->user['id'], 'marks_verified', 'marks', (string) $id, $existing, $updated);

        Response::json(['mark' => $updated]);
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM marks WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Marks record not found'], 404);
        }
        return $row;
    }
}
