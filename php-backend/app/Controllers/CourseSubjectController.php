<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class CourseSubjectController
{
    private const STATUSES = ['active', 'inactive'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $this->findCourse($pdo, $courseId);

        $stmt = $pdo->prepare('SELECT * FROM course_subjects WHERE course_id = :cid ORDER BY sort_order, subject_code');
        $stmt->execute(['cid' => $courseId]);
        Response::json(['subjects' => $stmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $this->findCourse($pdo, $courseId);

        $v = new Validator($request->body);
        $v->required('subject_code')->maxLength('subject_code', 30)
          ->required('subject_name')->maxLength('subject_name', 200)
          ->integer('credits')->integer('max_marks')->integer('pass_marks')
          ->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $maxMarks = isset($request->body['max_marks']) ? (int) $request->body['max_marks'] : 100;
        $passMarks = isset($request->body['pass_marks']) ? (int) $request->body['pass_marks'] : 40;
        if ($passMarks > $maxMarks) {
            Response::json(['errors' => ['pass_marks' => ['pass_marks cannot exceed max_marks']]], 422);
        }

        $dup = $pdo->prepare('SELECT id FROM course_subjects WHERE course_id = :cid AND subject_code = :code');
        $dup->execute(['cid' => $courseId, 'code' => $request->body['subject_code']]);
        if ($dup->fetch()) {
            Response::json(['errors' => ['subject_code' => ['Subject code already exists for this course']]], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO course_subjects (course_id, subject_code, subject_name, credits, max_marks, pass_marks, is_elective, sort_order, status)
             VALUES (:cid, :code, :name, :credits, :max_marks, :pass_marks, :elective, :sort_order, :status)'
        );
        $stmt->execute([
            'cid'        => $courseId,
            'code'       => $request->body['subject_code'],
            'name'       => $request->body['subject_name'],
            'credits'    => $request->body['credits'] ?? null,
            'max_marks'  => $maxMarks,
            'pass_marks' => $passMarks,
            'elective'   => !empty($request->body['is_elective']) ? 1 : 0,
            'sort_order' => $request->body['sort_order'] ?? 0,
            'status'     => $request->body['status'] ?? 'active',
        ]);

        $id = (int) $pdo->lastInsertId();
        $subject = $this->findSubject($pdo, $courseId, $id);
        AuditLog::record($pdo, $request->user['id'], 'course_subject_created', 'course_subjects', (string) $id, null, $subject);

        Response::json(['subject' => $subject], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $subjectId = (int) $request->params['subjectId'];
        $existing = $this->findSubject($pdo, $courseId, $subjectId);

        $v = new Validator($request->body);
        if (isset($request->body['subject_code'])) {
            $v->required('subject_code')->maxLength('subject_code', 30);
        }
        if (isset($request->body['subject_name'])) {
            $v->required('subject_name')->maxLength('subject_name', 200);
        }
        $v->integer('credits')->integer('max_marks')->integer('pass_marks')->in('status', self::STATUSES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $maxMarks = array_key_exists('max_marks', $request->body) ? (int) $request->body['max_marks'] : (int) $existing['max_marks'];
        $passMarks = array_key_exists('pass_marks', $request->body) ? (int) $request->body['pass_marks'] : (int) $existing['pass_marks'];
        if ($passMarks > $maxMarks) {
            Response::json(['errors' => ['pass_marks' => ['pass_marks cannot exceed max_marks']]], 422);
        }

        if (isset($request->body['subject_code']) && $request->body['subject_code'] !== $existing['subject_code']) {
            $dup = $pdo->prepare('SELECT id FROM course_subjects WHERE course_id = :cid AND subject_code = :code AND id != :id');
            $dup->execute(['cid' => $courseId, 'code' => $request->body['subject_code'], 'id' => $subjectId]);
            if ($dup->fetch()) {
                Response::json(['errors' => ['subject_code' => ['Subject code already exists for this course']]], 422);
            }
        }

        $fields = ['subject_code', 'subject_name', 'credits', 'max_marks', 'pass_marks', 'is_elective', 'sort_order', 'status'];
        $set = [];
        $params = ['id' => $subjectId];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $field === 'is_elective' ? (!empty($request->body[$field]) ? 1 : 0) : $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE course_subjects SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->findSubject($pdo, $courseId, $subjectId);
        AuditLog::record($pdo, $request->user['id'], 'course_subject_updated', 'course_subjects', (string) $subjectId, $existing, $updated);

        Response::json(['subject' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $courseId = (int) $request->params['courseId'];
        $subjectId = (int) $request->params['subjectId'];
        $existing = $this->findSubject($pdo, $courseId, $subjectId);

        $depStmt = $pdo->prepare('SELECT COUNT(*) AS dependents FROM examination_subjects WHERE course_subject_id = :id');
        $depStmt->execute(['id' => $subjectId]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Subject is used in an examination; set status to inactive instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM course_subjects WHERE id = :id')->execute(['id' => $subjectId]);
        AuditLog::record($pdo, $request->user['id'], 'course_subject_deleted', 'course_subjects', (string) $subjectId, $existing, null);

        Response::json(['message' => 'Subject deleted']);
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

    private function findSubject(PDO $pdo, int $courseId, int $subjectId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM course_subjects WHERE id = :id AND course_id = :cid');
        $stmt->execute(['id' => $subjectId, 'cid' => $courseId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Subject not found'], 404);
        }
        return $row;
    }
}
