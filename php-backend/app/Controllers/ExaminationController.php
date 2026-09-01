<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Counter;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class ExaminationController
{
    private const TYPES = ['regular', 'supplementary', 'improvement'];
    private const STATUSES = ['scheduled', 'ongoing', 'completed', 'results_published', 'cancelled'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM examinations';
        $where = [];
        $params = [];
        foreach (['status', 'course_id', 'session_id'] as $filter) {
            if (!empty($request->query[$filter])) {
                $where[] = "{$filter} = :{$filter}";
                $params[$filter] = $request->query[$filter];
            }
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY start_date DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['examinations' => $stmt->fetchAll()]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $exam = $this->find($pdo, (int) $request->params['id']);

        $subjectsStmt = $pdo->prepare(
            'SELECT es.*, cs.subject_code, cs.subject_name
             FROM examination_subjects es JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE es.examination_id = :id ORDER BY es.exam_date, es.start_time'
        );
        $subjectsStmt->execute(['id' => $exam['id']]);

        Response::json(['examination' => $exam, 'subjects' => $subjectsStmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $v = new Validator($request->body);
        $v->required('name')->maxLength('name', 200)
          ->required('course_id')->integer('course_id')
          ->required('session_id')->integer('session_id')
          ->in('exam_type', self::TYPES)
          ->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $pdo = Database::connection();
        $courseId = (int) $request->body['course_id'];
        $sessionId = (int) $request->body['session_id'];

        $courseStmt = $pdo->prepare('SELECT id FROM courses WHERE id = :id');
        $courseStmt->execute(['id' => $courseId]);
        if (!$courseStmt->fetch()) {
            Response::json(['errors' => ['course_id' => ['Course not found']]], 422);
        }

        $sessionStmt = $pdo->prepare('SELECT id FROM course_sessions WHERE id = :id AND course_id = :cid');
        $sessionStmt->execute(['id' => $sessionId, 'cid' => $courseId]);
        if (!$sessionStmt->fetch()) {
            Response::json(['errors' => ['session_id' => ['Session does not belong to the selected course']]], 422);
        }

        $examCode = Counter::next($pdo, 'EXAM');

        $stmt = $pdo->prepare(
            'INSERT INTO examinations (exam_code, name, course_id, session_id, exam_type, start_date, end_date, status)
             VALUES (:code, :name, :course_id, :session_id, :exam_type, :start, :end, :status)'
        );
        $stmt->execute([
            'code'       => $examCode,
            'name'       => $request->body['name'],
            'course_id'  => $courseId,
            'session_id' => $sessionId,
            'exam_type'  => $request->body['exam_type'] ?? 'regular',
            'start'      => $request->body['start_date'] ?? null,
            'end'        => $request->body['end_date'] ?? null,
            'status'     => $request->body['status'] ?? 'scheduled',
        ]);

        $id = (int) $pdo->lastInsertId();
        $exam = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'examination_created', 'examinations', (string) $id, null, $exam);

        Response::json(['examination' => $exam], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $v = new Validator($request->body);
        if (isset($request->body['name'])) {
            $v->required('name')->maxLength('name', 200);
        }
        $v->in('exam_type', self::TYPES)->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $fields = ['name', 'exam_type', 'start_date', 'end_date', 'status'];
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE examinations SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'examination_updated', 'examinations', (string) $id, $existing, $updated);

        Response::json(['examination' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $depStmt = $pdo->prepare(
            'SELECT
               (SELECT COUNT(*) FROM examination_subjects WHERE examination_id = :id1) +
               (SELECT COUNT(*) FROM exam_registrations WHERE examination_id = :id2) AS dependents'
        );
        $depStmt->execute(['id1' => $id, 'id2' => $id]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Examination has linked subjects/registrations; set status to cancelled instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM examinations WHERE id = :id')->execute(['id' => $id]);
        AuditLog::record($pdo, $request->user['id'], 'examination_deleted', 'examinations', (string) $id, $existing, null);

        Response::json(['message' => 'Examination deleted']);
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM examinations WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Examination not found'], 404);
        }
        return $row;
    }
}
