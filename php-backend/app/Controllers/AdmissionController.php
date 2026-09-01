<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Counter;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;
use PDOException;

final class AdmissionController
{
    private const TRANSITIONS = [
        'start_review' => ['from' => ['submitted'], 'to' => 'under_review'],
        'approve'      => ['from' => ['submitted', 'under_review'], 'to' => 'approved'],
        'reject'       => ['from' => ['submitted', 'under_review'], 'to' => 'rejected'],
        'cancel'       => ['from' => ['submitted', 'under_review', 'approved'], 'to' => 'cancelled'],
    ];

    // Public — no auth. Anyone can submit an admission application.
    public function store(Request $request): void
    {
        $v = new Validator($request->body);
        $v->required('first_name')->maxLength('first_name', 100)
          ->required('last_name')->maxLength('last_name', 100)
          ->required('course_id')->integer('course_id');
        if (!empty($request->body['email'])) {
            $v->maxLength('email', 150)->email('email');
        }
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $pdo = Database::connection();
        $courseId = (int) $request->body['course_id'];
        $institutionId = !empty($request->body['institution_id']) ? (int) $request->body['institution_id'] : null;
        $sessionId = !empty($request->body['session_id']) ? (int) $request->body['session_id'] : null;

        $courseStmt = $pdo->prepare("SELECT id FROM courses WHERE id = :id AND status = 'active'");
        $courseStmt->execute(['id' => $courseId]);
        if (!$courseStmt->fetch()) {
            Response::json(['errors' => ['course_id' => ['Course not found or not active']]], 422);
        }

        if ($institutionId) {
            $linkStmt = $pdo->prepare("SELECT 1 FROM institution_courses WHERE institution_id = :iid AND course_id = :cid AND status = 'active'");
            $linkStmt->execute(['iid' => $institutionId, 'cid' => $courseId]);
            if (!$linkStmt->fetch()) {
                Response::json(['errors' => ['institution_id' => ['This institution does not offer the selected course']]], 422);
            }
        }

        if ($sessionId) {
            $sessionStmt = $pdo->prepare('SELECT id FROM course_sessions WHERE id = :id AND course_id = :cid');
            $sessionStmt->execute(['id' => $sessionId, 'cid' => $courseId]);
            if (!$sessionStmt->fetch()) {
                Response::json(['errors' => ['session_id' => ['Session does not belong to the selected course']]], 422);
            }
        }

        // Duplicate protection: block a second open application for the same email+course+session.
        if (!empty($request->body['email'])) {
            $dupStmt = $pdo->prepare(
                "SELECT id FROM admissions WHERE applicant_email = :email AND course_id = :cid
                 AND ((session_id IS NULL AND :sid1 IS NULL) OR session_id = :sid2)
                 AND status IN ('submitted','under_review')"
            );
            $dupStmt->execute(['email' => $request->body['email'], 'cid' => $courseId, 'sid1' => $sessionId, 'sid2' => $sessionId]);
            if ($dupStmt->fetch()) {
                Response::json(['error' => 'An application for this course/session with this email is already pending review'], 409);
            }
        }

        $admissionNumber = Counter::next($pdo, 'ADM');
        $applicationData = $request->body['application_data'] ?? null;

        $stmt = $pdo->prepare(
            'INSERT INTO admissions (admission_number, course_id, session_id, institution_id, applicant_first_name, applicant_last_name, applicant_email, applicant_phone, application_data, status)
             VALUES (:number, :course_id, :session_id, :institution_id, :first, :last, :email, :phone, :data, "submitted")'
        );
        $stmt->execute([
            'number'         => $admissionNumber,
            'course_id'      => $courseId,
            'session_id'     => $sessionId,
            'institution_id' => $institutionId,
            'first'          => $request->body['first_name'],
            'last'           => $request->body['last_name'],
            'email'          => $request->body['email'] ?? null,
            'phone'          => $request->body['phone'] ?? null,
            'data'           => $applicationData !== null ? json_encode($applicationData) : null,
        ]);

        $id = (int) $pdo->lastInsertId();
        $admission = $this->find($pdo, $id);
        AuditLog::record($pdo, null, 'admission_submitted', 'admissions', (string) $id, null, $admission);

        Response::json(['admission' => $this->format($admission)], 201);
    }

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM admissions';
        $where = [];
        $params = [];
        foreach (['status', 'course_id', 'institution_id'] as $filter) {
            if (!empty($request->query[$filter])) {
                $where[] = "{$filter} = :{$filter}";
                $params[$filter] = $request->query[$filter];
            }
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY submitted_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['admissions' => array_map([$this, 'format'], $stmt->fetchAll())]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $admission = $this->find($pdo, (int) $request->params['id']);
        Response::json(['admission' => $this->format($admission)]);
    }

    public function review(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $admission = $this->find($pdo, $id);

        $action = (string) ($request->body['action'] ?? '');
        $notes = $request->body['review_notes'] ?? null;

        if (!isset(self::TRANSITIONS[$action])) {
            Response::json(['error' => 'Invalid action. Must be one of: ' . implode(', ', array_keys(self::TRANSITIONS))], 422);
        }

        $rule = self::TRANSITIONS[$action];
        if (!in_array($admission['status'], $rule['from'], true)) {
            Response::json(['error' => "Cannot '{$action}' an admission with status '{$admission['status']}'"], 409);
        }

        $pdo->prepare(
            'UPDATE admissions SET status = :status, reviewed_by = :reviewer, reviewed_at = UTC_TIMESTAMP(), review_notes = :notes WHERE id = :id'
        )->execute([
            'status'   => $rule['to'],
            'reviewer' => $request->user['id'],
            'notes'    => $notes,
            'id'       => $id,
        ]);

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], "admission_{$action}", 'admissions', (string) $id, ['status' => $admission['status']], ['status' => $updated['status']]);

        Response::json(['admission' => $this->format($updated)]);
    }

    public function enroll(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $admission = $this->find($pdo, $id);

        if ($admission['status'] !== 'approved') {
            Response::json(['error' => "Admission must be 'approved' before enrollment (current status: '{$admission['status']}')"], 409);
        }

        $courseStmt = $pdo->prepare('SELECT * FROM courses WHERE id = :id');
        $courseStmt->execute(['id' => $admission['course_id']]);
        $course = $courseStmt->fetch();
        if (!$course) {
            Response::json(['error' => 'Course no longer exists'], 409);
        }

        // enrollments.session_id is NOT NULL, but admissions.session_id is optional at
        // application time — allow the reviewer to supply/override it at enroll time.
        $sessionId = $admission['session_id'] !== null
            ? (int) $admission['session_id']
            : (!empty($request->body['session_id']) ? (int) $request->body['session_id'] : null);

        if (!$sessionId) {
            Response::json(['errors' => ['session_id' => ['session_id is required to complete enrollment']]], 422);
        }

        $sessionStmt = $pdo->prepare('SELECT id FROM course_sessions WHERE id = :id AND course_id = :cid');
        $sessionStmt->execute(['id' => $sessionId, 'cid' => $admission['course_id']]);
        if (!$sessionStmt->fetch()) {
            Response::json(['errors' => ['session_id' => ['Session does not belong to the admission\'s course']]], 422);
        }

        $studentId = $admission['student_id'] !== null ? (int) $admission['student_id'] : null;

        if (!$studentId && empty($admission['applicant_email'])) {
            Response::json(['error' => 'Applicant email is required to create a student login account'], 422);
        }

        $createdNewStudent = false;
        $credentials = null;
        $enrollmentId = null;

        $pdo->beginTransaction();
        try {
            if (!$studentId) {
                // Dedupe: reuse an existing master student record with the same email.
                $existingStmt = $pdo->prepare('SELECT id FROM students WHERE email = :email LIMIT 1');
                $existingStmt->execute(['email' => $admission['applicant_email']]);
                $existing = $existingStmt->fetch();
                $studentId = $existing ? (int) $existing['id'] : null;
            }

            if (!$studentId) {
                $regNumber = Counter::next($pdo, 'REG');

                $pdo->prepare(
                    'INSERT INTO students (uuid, registration_number, first_name, last_name, email, phone, status)
                     VALUES (UUID(), :reg, :first, :last, :email, :phone, "active")'
                )->execute([
                    'reg'   => $regNumber,
                    'first' => $admission['applicant_first_name'],
                    'last'  => $admission['applicant_last_name'],
                    'email' => $admission['applicant_email'],
                    'phone' => $admission['applicant_phone'],
                ]);
                $studentId = (int) $pdo->lastInsertId();
                $createdNewStudent = true;

                $roleStmt = $pdo->prepare("SELECT id FROM roles WHERE slug = 'student'");
                $roleStmt->execute();
                $studentRoleId = $roleStmt->fetch()['id'];

                $userEmailStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email');
                $userEmailStmt->execute(['email' => $admission['applicant_email']]);
                if ($userEmailStmt->fetch()) {
                    throw new \RuntimeException("A login account already exists for '{$admission['applicant_email']}' but is not linked to a student — cannot auto-create a student account with this email.");
                }

                $tempPassword = self::generateTempPassword();
                $pdo->prepare(
                    'INSERT INTO users (uuid, role_id, student_id, first_name, last_name, email, password_hash, status)
                     VALUES (UUID(), :role_id, :student_id, :first, :last, :email, :hash, "active")'
                )->execute([
                    'role_id'    => $studentRoleId,
                    'student_id' => $studentId,
                    'first'      => $admission['applicant_first_name'],
                    'last'       => $admission['applicant_last_name'],
                    'email'      => $admission['applicant_email'],
                    'hash'       => password_hash($tempPassword, PASSWORD_DEFAULT),
                ]);

                $credentials = ['email' => $admission['applicant_email'], 'temporary_password' => $tempPassword];
            }

            $rollNumber = Counter::next($pdo, 'ROLL', $course['code']);

            $enrollStmt = $pdo->prepare(
                'INSERT INTO enrollments (student_id, course_id, session_id, institution_id, admission_id, roll_number, enrollment_date, status)
                 VALUES (:student_id, :course_id, :session_id, :institution_id, :admission_id, :roll_number, CURDATE(), "active")'
            );
            $enrollStmt->execute([
                'student_id'     => $studentId,
                'course_id'      => $admission['course_id'],
                'session_id'     => $sessionId,
                'institution_id' => $admission['institution_id'],
                'admission_id'   => $admission['id'],
                'roll_number'    => $rollNumber,
            ]);
            $enrollmentId = (int) $pdo->lastInsertId();

            $pdo->prepare('UPDATE admissions SET student_id = :student_id, status = "enrolled" WHERE id = :id')
                ->execute(['student_id' => $studentId, 'id' => $admission['id']]);

            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23000') {
                Response::json(['error' => 'This student is already enrolled for this course and session'], 409);
            }
            throw $e;
        } catch (\RuntimeException $e) {
            $pdo->rollBack();
            Response::json(['error' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $studentStmt = $pdo->prepare('SELECT * FROM students WHERE id = :id');
        $studentStmt->execute(['id' => $studentId]);
        $student = $studentStmt->fetch();

        $enrollmentStmt = $pdo->prepare('SELECT * FROM enrollments WHERE id = :id');
        $enrollmentStmt->execute(['id' => $enrollmentId]);
        $enrollment = $enrollmentStmt->fetch();

        AuditLog::record($pdo, $request->user['id'], 'admission_enrolled', 'admissions', (string) $admission['id'], ['status' => $admission['status']], ['status' => 'enrolled', 'student_id' => $studentId]);
        if ($createdNewStudent) {
            AuditLog::record($pdo, $request->user['id'], 'student_created', 'students', (string) $studentId, null, $student);
        }
        AuditLog::record($pdo, $request->user['id'], 'enrollment_created', 'enrollments', (string) $enrollmentId, null, $enrollment);

        Response::json([
            'student'     => $student,
            'enrollment'  => $enrollment,
            'credentials' => $credentials,
        ], 201);
    }

    private function format(array $admission): array
    {
        $admission['application_data'] = $admission['application_data'] !== null
            ? json_decode($admission['application_data'], true)
            : null;
        return $admission;
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM admissions WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Admission not found'], 404);
        }
        return $row;
    }

    private static function generateTempPassword(): string
    {
        return substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(12))), 0, 12);
    }
}
