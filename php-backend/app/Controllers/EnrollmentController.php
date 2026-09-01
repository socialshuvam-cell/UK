<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class EnrollmentController
{
    private const STATUSES = ['active', 'completed', 'withdrawn', 'suspended'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT e.*, c.code AS course_code, c.name AS course_name, s.first_name, s.last_name, s.registration_number
                FROM enrollments e
                JOIN courses c ON c.id = e.course_id
                JOIN students s ON s.id = e.student_id';
        $where = [];
        $params = [];
        foreach (['student_id', 'course_id', 'session_id', 'status'] as $filter) {
            if (!empty($request->query[$filter])) {
                $where[] = "e.{$filter} = :{$filter}";
                $params[$filter] = $request->query[$filter];
            }
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY e.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['enrollments' => $stmt->fetchAll()]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        Response::json(['enrollment' => $this->find($pdo, (int) $request->params['id'])]);
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

        if (isset($request->body['status'])) {
            $pdo->prepare('UPDATE enrollments SET status = :status WHERE id = :id')
                ->execute(['status' => $request->body['status'], 'id' => $id]);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'enrollment_updated', 'enrollments', (string) $id, $existing, $updated);

        Response::json(['enrollment' => $updated]);
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM enrollments WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Enrollment not found'], 404);
        }
        return $row;
    }
}
