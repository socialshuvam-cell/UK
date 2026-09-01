<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Auth;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use PDO;

final class ResultController
{
    public function compute(Request $request): void
    {
        $pdo = Database::connection();
        $regId = (int) $request->params['regId'];

        $regStmt = $pdo->prepare('SELECT * FROM exam_registrations WHERE id = :id');
        $regStmt->execute(['id' => $regId]);
        $registration = $regStmt->fetch();
        if (!$registration) {
            Response::json(['error' => 'Exam registration not found'], 404);
        }

        $subjectsStmt = $pdo->prepare('SELECT id, max_marks, pass_marks FROM examination_subjects WHERE examination_id = :exam_id');
        $subjectsStmt->execute(['exam_id' => $registration['examination_id']]);
        $subjects = $subjectsStmt->fetchAll();
        if (!$subjects) {
            Response::json(['error' => 'No examination subjects defined for this examination'], 409);
        }

        $marksStmt = $pdo->prepare('SELECT * FROM marks WHERE exam_registration_id = :reg_id');
        $marksStmt->execute(['reg_id' => $regId]);
        $marksBySubject = [];
        foreach ($marksStmt->fetchAll() as $m) {
            $marksBySubject[$m['examination_subject_id']] = $m;
        }

        $missing = array_filter($subjects, static fn ($s) => !isset($marksBySubject[$s['id']]));
        if ($missing) {
            Response::json(['error' => 'Marks are missing for ' . count($missing) . ' subject(s); cannot compute result yet'], 409);
        }

        $totalMax = 0;
        $totalObtained = 0.0;
        $passed = true;
        foreach ($subjects as $s) {
            $mark = $marksBySubject[$s['id']];
            $totalMax += (int) $s['max_marks'];
            $obtained = $mark['is_absent'] ? 0.0 : (float) $mark['marks_obtained'];
            $totalObtained += $obtained;
            if ($mark['is_absent'] || $obtained < (int) $s['pass_marks']) {
                $passed = false;
            }
        }

        $percentage = $totalMax > 0 ? round($totalObtained / $totalMax * 100, 2) : 0;
        $grade = self::gradeFor($percentage);
        $resultStatus = $passed ? 'pass' : 'fail';

        $existingStmt = $pdo->prepare('SELECT id FROM results WHERE exam_registration_id = :reg_id');
        $existingStmt->execute(['reg_id' => $regId]);
        $existingRow = $existingStmt->fetch();

        if ($existingRow) {
            $resultId = (int) $existingRow['id'];
            $pdo->prepare(
                'UPDATE results SET total_max_marks = :max, total_obtained_marks = :obt, percentage = :pct, grade = :grade, result_status = :status WHERE id = :id'
            )->execute([
                'max' => $totalMax, 'obt' => $totalObtained, 'pct' => $percentage,
                'grade' => $grade, 'status' => $resultStatus, 'id' => $resultId,
            ]);
        } else {
            $pdo->prepare(
                'INSERT INTO results (exam_registration_id, examination_id, student_id, total_max_marks, total_obtained_marks, percentage, grade, result_status)
                 VALUES (:reg_id, :exam_id, :student_id, :max, :obt, :pct, :grade, :status)'
            )->execute([
                'reg_id' => $regId, 'exam_id' => $registration['examination_id'], 'student_id' => $registration['student_id'],
                'max' => $totalMax, 'obt' => $totalObtained, 'pct' => $percentage, 'grade' => $grade, 'status' => $resultStatus,
            ]);
            $resultId = (int) $pdo->lastInsertId();
        }

        $result = $this->find($pdo, $resultId);
        AuditLog::record($pdo, $request->user['id'], 'result_computed', 'results', (string) $resultId, null, $result);

        Response::json(['result' => $result]);
    }

    public function publish(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        if ($existing['published_at'] !== null) {
            Response::json(['error' => 'Result already published'], 409);
        }
        if ($existing['result_status'] === 'pending') {
            Response::json(['error' => 'Result must be computed before publishing'], 409);
        }

        $pdo->prepare('UPDATE results SET published_at = UTC_TIMESTAMP(), published_by = :by WHERE id = :id')
            ->execute(['by' => $request->user['id'], 'id' => $id]);

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'result_published', 'results', (string) $id, $existing, $updated);

        Response::json(['result' => $updated]);
    }

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $stmt = $pdo->prepare(
            'SELECT r.*, s.first_name, s.last_name, s.registration_number
             FROM results r JOIN students s ON s.id = r.student_id
             WHERE r.examination_id = :exam_id ORDER BY r.id'
        );
        $stmt->execute(['exam_id' => $examId]);
        Response::json(['results' => $stmt->fetchAll()]);
    }

    // --- Student self-service ---

    public function meIndex(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT r.*, e.exam_code, e.name AS exam_name
             FROM results r JOIN examinations e ON e.id = r.examination_id
             WHERE r.student_id = :sid AND r.published_at IS NOT NULL ORDER BY r.published_at DESC'
        );
        $stmt->execute(['sid' => $studentId]);
        Response::json(['results' => $stmt->fetchAll()]);
    }

    public function meShow(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $id = (int) $request->params['id'];

        $stmt = $pdo->prepare(
            'SELECT r.*, e.exam_code, e.name AS exam_name
             FROM results r JOIN examinations e ON e.id = r.examination_id
             WHERE r.id = :id AND r.student_id = :sid AND r.published_at IS NOT NULL'
        );
        $stmt->execute(['id' => $id, 'sid' => $studentId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Result not found'], 404);
        }
        Response::json(['result' => $row]);
    }

    private static function gradeFor(float $percentage): string
    {
        return match (true) {
            $percentage >= 90 => 'A+',
            $percentage >= 80 => 'A',
            $percentage >= 70 => 'B+',
            $percentage >= 60 => 'B',
            $percentage >= 50 => 'C',
            $percentage >= 40 => 'D',
            default            => 'F',
        };
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM results WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Result not found'], 404);
        }
        return $row;
    }
}
