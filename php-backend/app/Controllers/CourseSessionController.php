<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class CourseSessionController
{
    private const STATUSES = ['upcoming', 'active', 'completed', 'archived'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $this->findCourse($pdo, $courseId);

        $stmt = $pdo->prepare('SELECT * FROM course_sessions WHERE course_id = :cid ORDER BY start_date DESC');
        $stmt->execute(['cid' => $courseId]);
        Response::json(['sessions' => $stmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $this->findCourse($pdo, $courseId);

        $v = new Validator($request->body);
        $v->required('session_name')->maxLength('session_name', 100)
          ->required('academic_year')->maxLength('academic_year', 20)
          ->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO course_sessions (course_id, session_name, academic_year, start_date, end_date, status)
             VALUES (:cid, :name, :year, :start, :end, :status)'
        );
        $stmt->execute([
            'cid'    => $courseId,
            'name'   => $request->body['session_name'],
            'year'   => $request->body['academic_year'],
            'start'  => $request->body['start_date'] ?? null,
            'end'    => $request->body['end_date'] ?? null,
            'status' => $request->body['status'] ?? 'upcoming',
        ]);

        $id = (int) $pdo->lastInsertId();
        $session = $this->findSession($pdo, $courseId, $id);
        AuditLog::record($pdo, $request->user['id'], 'course_session_created', 'course_sessions', (string) $id, null, $session);

        Response::json(['session' => $session], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $sessionId = (int) $request->params['sessionId'];
        $existing = $this->findSession($pdo, $courseId, $sessionId);

        $v = new Validator($request->body);
        if (isset($request->body['session_name'])) {
            $v->required('session_name')->maxLength('session_name', 100);
        }
        if (isset($request->body['academic_year'])) {
            $v->required('academic_year')->maxLength('academic_year', 20);
        }
        $v->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $fields = ['session_name', 'academic_year', 'start_date', 'end_date', 'status'];
        $set = [];
        $params = ['id' => $sessionId];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE course_sessions SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->findSession($pdo, $courseId, $sessionId);
        AuditLog::record($pdo, $request->user['id'], 'course_session_updated', 'course_sessions', (string) $sessionId, $existing, $updated);

        Response::json(['session' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $sessionId = (int) $request->params['sessionId'];
        $existing = $this->findSession($pdo, $courseId, $sessionId);

        $depStmt = $pdo->prepare(
            'SELECT
               (SELECT COUNT(*) FROM enrollments WHERE session_id = :id1) +
               (SELECT COUNT(*) FROM examinations WHERE session_id = :id2) +
               (SELECT COUNT(*) FROM admissions WHERE session_id = :id3) AS dependents'
        );
        $depStmt->execute(['id1' => $sessionId, 'id2' => $sessionId, 'id3' => $sessionId]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Session has linked admissions/enrollments/examinations; set status to archived instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM course_sessions WHERE id = :id')->execute(['id' => $sessionId]);
        AuditLog::record($pdo, $request->user['id'], 'course_session_deleted', 'course_sessions', (string) $sessionId, $existing, null);

        Response::json(['message' => 'Session deleted']);
    }

    private function findCourse(PDO $pdo, int $courseId): array
    {
        $stmt = $pdo->prepare('SELECT id FROM courses WHERE id = :id');
        $stmt->execute(['id' => $courseId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Course not found'], 404);
        }
        return $row;
    }

    private function findSession(PDO $pdo, int $courseId, int $sessionId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM course_sessions WHERE id = :id AND course_id = :cid');
        $stmt->execute(['id' => $sessionId, 'cid' => $courseId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Session not found'], 404);
        }
        return $row;
    }
}
