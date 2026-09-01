<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class CourseController
{
    private const LEVELS = ['certificate', 'diploma', 'degree', 'other'];
    private const STATUSES = ['active', 'inactive'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM courses';
        $where = [];
        $params = [];
        foreach (['status', 'level', 'category'] as $filter) {
            if (!empty($request->query[$filter])) {
                $where[] = "{$filter} = :{$filter}";
                $params[$filter] = $request->query[$filter];
            }
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY name ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['courses' => $stmt->fetchAll()]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $course = $this->find($pdo, (int) $request->params['id']);

        $subjectsStmt = $pdo->prepare('SELECT * FROM course_subjects WHERE course_id = :id ORDER BY sort_order, subject_code');
        $subjectsStmt->execute(['id' => $course['id']]);

        $sessionsStmt = $pdo->prepare('SELECT * FROM course_sessions WHERE course_id = :id ORDER BY start_date DESC');
        $sessionsStmt->execute(['id' => $course['id']]);

        $institutionsStmt = $pdo->prepare(
            'SELECT i.id, i.code, i.name, ic.status AS link_status
             FROM institution_courses ic JOIN institutions i ON i.id = ic.institution_id
             WHERE ic.course_id = :id ORDER BY i.name'
        );
        $institutionsStmt->execute(['id' => $course['id']]);

        Response::json([
            'course'       => $course,
            'subjects'     => $subjectsStmt->fetchAll(),
            'sessions'     => $sessionsStmt->fetchAll(),
            'institutions' => $institutionsStmt->fetchAll(),
        ]);
    }

    public function store(Request $request): void
    {
        $v = new Validator($request->body);
        $v->required('code')->maxLength('code', 20)
          ->required('name')->maxLength('name', 200)
          ->in('level', self::LEVELS)
          ->in('status', self::STATUSES)
          ->integer('duration_months')
          ->integer('total_credits');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $pdo = Database::connection();
        $dup = $pdo->prepare('SELECT id FROM courses WHERE code = :code');
        $dup->execute(['code' => $request->body['code']]);
        if ($dup->fetch()) {
            Response::json(['errors' => ['code' => ['Course code already exists']]], 422);
        }

        $body = Validator::nullifyEmpty($request->body, ['category', 'duration_months', 'total_credits', 'eligibility', 'description']);
        $stmt = $pdo->prepare(
            'INSERT INTO courses (code, name, level, category, duration_months, total_credits, eligibility, description, status)
             VALUES (:code, :name, :level, :category, :duration_months, :total_credits, :eligibility, :description, :status)'
        );
        $stmt->execute([
            'code'            => $body['code'],
            'name'            => $body['name'],
            'level'           => $body['level'] ?? 'certificate',
            'category'        => $body['category'] ?? null,
            'duration_months' => $body['duration_months'] ?? null,
            'total_credits'   => $body['total_credits'] ?? null,
            'eligibility'     => $body['eligibility'] ?? null,
            'description'     => $body['description'] ?? null,
            'status'          => $body['status'] ?? 'active',
        ]);

        $id = (int) $pdo->lastInsertId();
        $course = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'course_created', 'courses', (string) $id, null, $course);

        Response::json(['course' => $course], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $v = new Validator($request->body);
        if (isset($request->body['code'])) {
            $v->required('code')->maxLength('code', 20);
        }
        if (isset($request->body['name'])) {
            $v->required('name')->maxLength('name', 200);
        }
        $v->in('level', self::LEVELS)->in('status', self::STATUSES)->integer('duration_months')->integer('total_credits');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        if (isset($request->body['code']) && $request->body['code'] !== $existing['code']) {
            $dup = $pdo->prepare('SELECT id FROM courses WHERE code = :code AND id != :id');
            $dup->execute(['code' => $request->body['code'], 'id' => $id]);
            if ($dup->fetch()) {
                Response::json(['errors' => ['code' => ['Course code already exists']]], 422);
            }
        }

        $fields = ['code', 'name', 'level', 'category', 'duration_months', 'total_credits', 'eligibility', 'description', 'status'];
        $body = Validator::nullifyEmpty($request->body, ['category', 'duration_months', 'total_credits', 'eligibility', 'description']);
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE courses SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'course_updated', 'courses', (string) $id, $existing, $updated);

        Response::json(['course' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $depStmt = $pdo->prepare(
            'SELECT
               (SELECT COUNT(*) FROM course_subjects WHERE course_id = :id1) +
               (SELECT COUNT(*) FROM course_sessions WHERE course_id = :id2) +
               (SELECT COUNT(*) FROM institution_courses WHERE course_id = :id3) +
               (SELECT COUNT(*) FROM admissions WHERE course_id = :id4) +
               (SELECT COUNT(*) FROM enrollments WHERE course_id = :id5) AS dependents'
        );
        $depStmt->execute(['id1' => $id, 'id2' => $id, 'id3' => $id, 'id4' => $id, 'id5' => $id]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Course has linked subjects/sessions/institutions/admissions/enrollments; set status to inactive instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM courses WHERE id = :id')->execute(['id' => $id]);
        AuditLog::record($pdo, $request->user['id'], 'course_deleted', 'courses', (string) $id, $existing, null);

        Response::json(['message' => 'Course deleted']);
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM courses WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Course not found'], 404);
        }
        return $row;
    }
}
