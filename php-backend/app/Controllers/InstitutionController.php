<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class InstitutionController
{
    private const TYPES = ['institution', 'centre'];
    private const STATUSES = ['active', 'inactive'];

    // Public — no auth. Read-only listing for the public website.
    public function publicIndex(): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->query("SELECT id, code, name, type, address, city, country, contact_email, contact_phone FROM institutions WHERE status = 'active' ORDER BY name ASC");
        Response::json(['institutions' => $stmt->fetchAll()]);
    }

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM institutions';
        $where = [];
        $params = [];
        foreach (['status', 'type'] as $filter) {
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
        Response::json(['institutions' => $stmt->fetchAll()]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $institution = $this->find($pdo, (int) $request->params['id']);

        $coursesStmt = $pdo->prepare(
            'SELECT c.id, c.code, c.name, ic.status AS link_status
             FROM institution_courses ic JOIN courses c ON c.id = ic.course_id
             WHERE ic.institution_id = :id ORDER BY c.name'
        );
        $coursesStmt->execute(['id' => $institution['id']]);

        Response::json([
            'institution' => $institution,
            'courses'     => $coursesStmt->fetchAll(),
        ]);
    }

    public function store(Request $request): void
    {
        $v = new Validator($request->body);
        $v->required('code')->maxLength('code', 20)
          ->required('name')->maxLength('name', 200)
          ->in('type', self::TYPES)
          ->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $pdo = Database::connection();
        $dup = $pdo->prepare('SELECT id FROM institutions WHERE code = :code');
        $dup->execute(['code' => $request->body['code']]);
        if ($dup->fetch()) {
            Response::json(['errors' => ['code' => ['Institution code already exists']]], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO institutions (code, name, type, address, city, country, contact_email, contact_phone, status)
             VALUES (:code, :name, :type, :address, :city, :country, :contact_email, :contact_phone, :status)'
        );
        $stmt->execute([
            'code'          => $request->body['code'],
            'name'          => $request->body['name'],
            'type'          => $request->body['type'] ?? 'centre',
            'address'       => $request->body['address'] ?? null,
            'city'          => $request->body['city'] ?? null,
            'country'       => $request->body['country'] ?? null,
            'contact_email' => $request->body['contact_email'] ?? null,
            'contact_phone' => $request->body['contact_phone'] ?? null,
            'status'        => $request->body['status'] ?? 'active',
        ]);

        $id = (int) $pdo->lastInsertId();
        $institution = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'institution_created', 'institutions', (string) $id, null, $institution);

        Response::json(['institution' => $institution], 201);
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
        $v->in('type', self::TYPES)->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        if (isset($request->body['code']) && $request->body['code'] !== $existing['code']) {
            $dup = $pdo->prepare('SELECT id FROM institutions WHERE code = :code AND id != :id');
            $dup->execute(['code' => $request->body['code'], 'id' => $id]);
            if ($dup->fetch()) {
                Response::json(['errors' => ['code' => ['Institution code already exists']]], 422);
            }
        }

        $fields = ['code', 'name', 'type', 'address', 'city', 'country', 'contact_email', 'contact_phone', 'status'];
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE institutions SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'institution_updated', 'institutions', (string) $id, $existing, $updated);

        Response::json(['institution' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $depStmt = $pdo->prepare(
            'SELECT
               (SELECT COUNT(*) FROM admissions WHERE institution_id = :id1) +
               (SELECT COUNT(*) FROM enrollments WHERE institution_id = :id2) AS dependents'
        );
        $depStmt->execute(['id1' => $id, 'id2' => $id]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Institution has linked admissions/enrollments; set status to inactive instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM institutions WHERE id = :id')->execute(['id' => $id]);
        AuditLog::record($pdo, $request->user['id'], 'institution_deleted', 'institutions', (string) $id, $existing, null);

        Response::json(['message' => 'Institution deleted']);
    }

    public function linkCourse(Request $request): void
    {
        $pdo = Database::connection();
        $institutionId = (int) $request->params['id'];
        $this->find($pdo, $institutionId);

        $v = new Validator($request->body);
        $v->required('course_id')->integer('course_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }
        $courseId = (int) $request->body['course_id'];

        $courseStmt = $pdo->prepare('SELECT id FROM courses WHERE id = :id');
        $courseStmt->execute(['id' => $courseId]);
        if (!$courseStmt->fetch()) {
            Response::json(['error' => 'Course not found'], 404);
        }

        $pdo->prepare(
            'INSERT INTO institution_courses (institution_id, course_id, status) VALUES (:iid, :cid, "active")
             ON DUPLICATE KEY UPDATE status = "active"'
        )->execute(['iid' => $institutionId, 'cid' => $courseId]);

        AuditLog::record($pdo, $request->user['id'], 'institution_course_linked', 'institution_courses', "{$institutionId}:{$courseId}");

        Response::json(['message' => 'Course linked to institution']);
    }

    public function unlinkCourse(Request $request): void
    {
        $pdo = Database::connection();
        $institutionId = (int) $request->params['id'];
        $courseId = (int) $request->params['courseId'];

        $pdo->prepare('DELETE FROM institution_courses WHERE institution_id = :iid AND course_id = :cid')
            ->execute(['iid' => $institutionId, 'cid' => $courseId]);

        AuditLog::record($pdo, $request->user['id'], 'institution_course_unlinked', 'institution_courses', "{$institutionId}:{$courseId}");

        Response::json(['message' => 'Course unlinked from institution']);
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM institutions WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Institution not found'], 404);
        }
        return $row;
    }
}
