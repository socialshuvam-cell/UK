<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class ExaminationSubjectController
{
    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $this->findExam($pdo, $examId);

        $stmt = $pdo->prepare(
            'SELECT es.*, cs.subject_code, cs.subject_name
             FROM examination_subjects es JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE es.examination_id = :id ORDER BY es.exam_date, es.start_time'
        );
        $stmt->execute(['id' => $examId]);
        Response::json(['subjects' => $stmt->fetchAll()]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $exam = $this->findExam($pdo, $examId);

        $v = new Validator($request->body);
        $v->required('course_subject_id')->integer('course_subject_id')
          ->integer('duration_minutes')->integer('max_marks')->integer('pass_marks');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $courseSubjectId = (int) $request->body['course_subject_id'];
        $csStmt = $pdo->prepare('SELECT * FROM course_subjects WHERE id = :id AND course_id = :cid');
        $csStmt->execute(['id' => $courseSubjectId, 'cid' => $exam['course_id']]);
        $courseSubject = $csStmt->fetch();
        if (!$courseSubject) {
            Response::json(['errors' => ['course_subject_id' => ["Subject does not belong to this examination's course"]]], 422);
        }

        $dup = $pdo->prepare('SELECT id FROM examination_subjects WHERE examination_id = :exam_id AND course_subject_id = :cs_id');
        $dup->execute(['exam_id' => $examId, 'cs_id' => $courseSubjectId]);
        if ($dup->fetch()) {
            Response::json(['error' => 'This subject is already added to this examination'], 409);
        }

        $maxMarks = $request->body['max_marks'] ?? $courseSubject['max_marks'];
        $passMarks = $request->body['pass_marks'] ?? $courseSubject['pass_marks'];
        if ((int) $passMarks > (int) $maxMarks) {
            Response::json(['errors' => ['pass_marks' => ['pass_marks cannot exceed max_marks']]], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO examination_subjects (examination_id, course_subject_id, exam_date, start_time, duration_minutes, max_marks, pass_marks)
             VALUES (:exam_id, :cs_id, :exam_date, :start_time, :duration, :max_marks, :pass_marks)'
        );
        $stmt->execute([
            'exam_id'    => $examId,
            'cs_id'      => $courseSubjectId,
            'exam_date'  => $request->body['exam_date'] ?? null,
            'start_time' => $request->body['start_time'] ?? null,
            'duration'   => $request->body['duration_minutes'] ?? null,
            'max_marks'  => $maxMarks,
            'pass_marks' => $passMarks,
        ]);

        $id = (int) $pdo->lastInsertId();
        $subject = $this->findSubject($pdo, $examId, $id);
        AuditLog::record($pdo, $request->user['id'], 'examination_subject_created', 'examination_subjects', (string) $id, null, $subject);

        Response::json(['subject' => $subject], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $subjectId = (int) $request->params['subjectId'];
        $existing = $this->findSubject($pdo, $examId, $subjectId);

        $v = new Validator($request->body);
        $v->integer('duration_minutes')->integer('max_marks')->integer('pass_marks');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $maxMarks = array_key_exists('max_marks', $request->body) ? (int) $request->body['max_marks'] : (int) $existing['max_marks'];
        $passMarks = array_key_exists('pass_marks', $request->body) ? (int) $request->body['pass_marks'] : (int) $existing['pass_marks'];
        if ($passMarks > $maxMarks) {
            Response::json(['errors' => ['pass_marks' => ['pass_marks cannot exceed max_marks']]], 422);
        }

        $fields = ['exam_date', 'start_time', 'duration_minutes', 'max_marks', 'pass_marks'];
        $set = [];
        $params = ['id' => $subjectId];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE examination_subjects SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->findSubject($pdo, $examId, $subjectId);
        AuditLog::record($pdo, $request->user['id'], 'examination_subject_updated', 'examination_subjects', (string) $subjectId, $existing, $updated);

        Response::json(['subject' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $examId = (int) $request->params['examId'];
        $subjectId = (int) $request->params['subjectId'];
        $existing = $this->findSubject($pdo, $examId, $subjectId);

        $depStmt = $pdo->prepare('SELECT COUNT(*) AS dependents FROM marks WHERE examination_subject_id = :id');
        $depStmt->execute(['id' => $subjectId]);
        if ((int) $depStmt->fetch()['dependents'] > 0) {
            Response::json(['error' => 'Marks already recorded for this subject; cannot delete'], 409);
        }

        $pdo->prepare('DELETE FROM examination_subjects WHERE id = :id')->execute(['id' => $subjectId]);
        AuditLog::record($pdo, $request->user['id'], 'examination_subject_deleted', 'examination_subjects', (string) $subjectId, $existing, null);

        Response::json(['message' => 'Subject removed from examination']);
    }

    private function findExam(PDO $pdo, int $examId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM examinations WHERE id = :id');
        $stmt->execute(['id' => $examId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Examination not found'], 404);
        }
        return $row;
    }

    private function findSubject(PDO $pdo, int $examId, int $subjectId): array
    {
        $stmt = $pdo->prepare(
            'SELECT es.*, cs.subject_code, cs.subject_name
             FROM examination_subjects es JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE es.id = :id AND es.examination_id = :exam_id'
        );
        $stmt->execute(['id' => $subjectId, 'exam_id' => $examId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Examination subject not found'], 404);
        }
        return $row;
    }
}
