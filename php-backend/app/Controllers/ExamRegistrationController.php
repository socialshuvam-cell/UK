<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Auth;
use App\Core\Counter;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class ExamRegistrationController
{
    private const STATUSES = ['registered', 'admitted', 'appeared', 'absent', 'debarred'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $stmt = $pdo->prepare(
            'SELECT er.*, s.first_name, s.last_name, s.registration_number
             FROM exam_registrations er JOIN students s ON s.id = er.student_id
             WHERE er.examination_id = :exam_id ORDER BY er.id'
        );
        $stmt->execute(['exam_id' => $examId]);
        Response::json(['registrations' => $stmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];

        $examStmt = $pdo->prepare('SELECT * FROM examinations WHERE id = :id');
        $examStmt->execute(['id' => $examId]);
        $exam = $examStmt->fetch();
        if (!$exam) {
            Response::json(['error' => 'Examination not found'], 404);
        }

        $v = new Validator($request->body);
        $v->required('enrollment_id')->integer('enrollment_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $enrollmentId = (int) $request->body['enrollment_id'];
        $enrollStmt = $pdo->prepare('SELECT * FROM enrollments WHERE id = :id');
        $enrollStmt->execute(['id' => $enrollmentId]);
        $enrollment = $enrollStmt->fetch();
        if (!$enrollment) {
            Response::json(['errors' => ['enrollment_id' => ['Enrollment not found']]], 422);
        }

        // Eligibility: the enrollment must match this exam's course+session and be active.
        if ((int) $enrollment['course_id'] !== (int) $exam['course_id'] || (int) $enrollment['session_id'] !== (int) $exam['session_id']) {
            Response::json(['errors' => ['enrollment_id' => ["Enrollment does not belong to this examination's course/session"]]], 422);
        }
        if ($enrollment['status'] !== 'active') {
            Response::json(['errors' => ['enrollment_id' => ["Enrollment status must be 'active' to register for an exam (current: '{$enrollment['status']}')"]]], 422);
        }

        $dup = $pdo->prepare('SELECT id FROM exam_registrations WHERE examination_id = :exam_id AND student_id = :student_id');
        $dup->execute(['exam_id' => $examId, 'student_id' => $enrollment['student_id']]);
        if ($dup->fetch()) {
            Response::json(['error' => 'This student is already registered for this examination'], 409);
        }

        $hallTicketNumber = Counter::next($pdo, 'HT');

        $stmt = $pdo->prepare(
            'INSERT INTO exam_registrations (examination_id, student_id, enrollment_id, hall_ticket_number, exam_center, registration_date, status)
             VALUES (:exam_id, :student_id, :enrollment_id, :hall_ticket, :exam_center, CURDATE(), "registered")'
        );
        $stmt->execute([
            'exam_id'       => $examId,
            'student_id'    => $enrollment['student_id'],
            'enrollment_id' => $enrollmentId,
            'hall_ticket'   => $hallTicketNumber,
            'exam_center'   => $request->body['exam_center'] ?? null,
        ]);

        $id = (int) $pdo->lastInsertId();
        $registration = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'exam_registration_created', 'exam_registrations', (string) $id, null, $registration);

        Response::json(['registration' => $registration], 201);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        Response::json(['registration' => $this->find($pdo, (int) $request->params['id'])]);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $v = new Validator($request->body);
        $v->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $fields = ['exam_center', 'seat_number', 'status'];
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE exam_registrations SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'exam_registration_updated', 'exam_registrations', (string) $id, $existing, $updated);

        Response::json(['registration' => $updated]);
    }

    public function hallTicket(Request $request): void
    {
        $pdo = Database::connection();
        $registration = $this->find($pdo, (int) $request->params['id']);
        Response::json(['hall_ticket' => $this->assembleHallTicket($pdo, $registration)]);
    }

    // --- Student self-service ---

    public function meIndex(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT er.*, e.exam_code, e.name AS exam_name
             FROM exam_registrations er JOIN examinations e ON e.id = er.examination_id
             WHERE er.student_id = :sid ORDER BY er.created_at DESC'
        );
        $stmt->execute(['sid' => $studentId]);
        Response::json(['registrations' => $stmt->fetchAll()]);
    }

    public function meHallTicket(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $id = (int) $request->params['id'];

        $stmt = $pdo->prepare('SELECT * FROM exam_registrations WHERE id = :id AND student_id = :sid');
        $stmt->execute(['id' => $id, 'sid' => $studentId]);
        $registration = $stmt->fetch();
        if (!$registration) {
            Response::json(['error' => 'Registration not found'], 404);
        }

        Response::json(['hall_ticket' => $this->assembleHallTicket($pdo, $registration)]);
    }

    private function assembleHallTicket(PDO $pdo, array $registration): array
    {
        $examStmt = $pdo->prepare('SELECT * FROM examinations WHERE id = :id');
        $examStmt->execute(['id' => $registration['examination_id']]);
        $exam = $examStmt->fetch();

        $studentStmt = $pdo->prepare('SELECT id, registration_number, first_name, last_name, photo_path FROM students WHERE id = :id');
        $studentStmt->execute(['id' => $registration['student_id']]);
        $student = $studentStmt->fetch();

        $subjectsStmt = $pdo->prepare(
            'SELECT es.exam_date, es.start_time, es.duration_minutes, es.max_marks, cs.subject_code, cs.subject_name
             FROM examination_subjects es JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE es.examination_id = :exam_id ORDER BY es.exam_date, es.start_time'
        );
        $subjectsStmt->execute(['exam_id' => $registration['examination_id']]);

        return [
            'hall_ticket_number' => $registration['hall_ticket_number'],
            'exam_center'        => $registration['exam_center'],
            'seat_number'        => $registration['seat_number'],
            'status'             => $registration['status'],
            'examination'        => $exam,
            'student'            => $student,
            'subjects'           => $subjectsStmt->fetchAll(),
        ];
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM exam_registrations WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Exam registration not found'], 404);
        }
        return $row;
    }
}
