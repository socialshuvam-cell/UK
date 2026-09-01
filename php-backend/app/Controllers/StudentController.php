<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\FileUpload;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class StudentController
{
    private const STATUSES = ['prospective', 'active', 'graduated', 'inactive'];
    private const DOC_TYPES = ['photo', 'id_proof', 'previous_qualification', 'other'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM students';
        $where = [];
        $params = [];
        if (!empty($request->query['status'])) {
            $where[] = 'status = :status';
            $params['status'] = $request->query['status'];
        }
        if (!empty($request->query['search'])) {
            $where[] = '(first_name LIKE :search1 OR last_name LIKE :search2 OR registration_number LIKE :search3)';
            $term = '%' . $request->query['search'] . '%';
            $params['search1'] = $term;
            $params['search2'] = $term;
            $params['search3'] = $term;
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['students' => $stmt->fetchAll()]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $student = $this->find($pdo, (int) $request->params['id']);
        Response::json(['student' => $student] + $this->relatedData($pdo, $student['id']));
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $v = new Validator($request->body);
        $v->in('status', self::STATUSES);
        if (isset($request->body['first_name'])) {
            $v->required('first_name')->maxLength('first_name', 100);
        }
        if (isset($request->body['last_name'])) {
            $v->required('last_name')->maxLength('last_name', 100);
        }
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $fields = [
            'first_name', 'last_name', 'dob', 'gender', 'email', 'phone', 'address', 'city',
            'country', 'nationality', 'guardian_name', 'guardian_phone', 'id_proof_type',
            'id_proof_number', 'status',
        ];
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $request->body[$field];
            }
        }
        if ($set) {
            $pdo->prepare('UPDATE students SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'student_updated', 'students', (string) $id, $existing, $updated);

        Response::json(['student' => $updated]);
    }

    public function documents(Request $request): void
    {
        $pdo = Database::connection();
        $studentId = (int) $request->params['id'];
        $this->find($pdo, $studentId);

        Response::json(['documents' => $this->fetchDocuments($pdo, $studentId)]);
    }

    public function uploadDocument(Request $request): void
    {
        $pdo = Database::connection();
        $studentId = (int) $request->params['id'];
        $this->find($pdo, $studentId);

        $this->storeUploadedDocument($request, $pdo, $studentId);
    }

    // --- Self-service ("me") endpoints ---

    public function me(Request $request): void
    {
        $studentId = $this->requireOwnStudentId($request);
        $pdo = Database::connection();
        $student = $this->find($pdo, $studentId);
        Response::json(['student' => $student] + $this->relatedData($pdo, $studentId));
    }

    public function meEnrollments(Request $request): void
    {
        $studentId = $this->requireOwnStudentId($request);
        $pdo = Database::connection();
        Response::json(['enrollments' => $this->fetchEnrollments($pdo, $studentId)]);
    }

    public function meDocuments(Request $request): void
    {
        $studentId = $this->requireOwnStudentId($request);
        $pdo = Database::connection();
        Response::json(['documents' => $this->fetchDocuments($pdo, $studentId)]);
    }

    public function meUploadDocument(Request $request): void
    {
        $studentId = $this->requireOwnStudentId($request);
        $pdo = Database::connection();
        $this->storeUploadedDocument($request, $pdo, $studentId);
    }

    private function requireOwnStudentId(Request $request): int
    {
        if (empty($request->user['student_id'])) {
            Response::json(['error' => 'This account is not linked to a student record'], 403);
        }
        return (int) $request->user['student_id'];
    }

    private function storeUploadedDocument(Request $request, PDO $pdo, int $studentId): void
    {
        $docType = (string) ($request->body['doc_type'] ?? '');
        if (!in_array($docType, self::DOC_TYPES, true)) {
            Response::json(['errors' => ['doc_type' => ['doc_type must be one of: ' . implode(', ', self::DOC_TYPES)]]], 422);
        }

        if (empty($request->files['file'])) {
            Response::json(['errors' => ['file' => ['A file is required']]], 422);
        }

        try {
            $stored = FileUpload::store($request->files['file'], 'student_documents');
        } catch (\RuntimeException $e) {
            Response::json(['errors' => ['file' => [$e->getMessage()]]], 422);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO student_documents (student_id, doc_type, file_path, original_name, mime_type, file_size, uploaded_by)
             VALUES (:student_id, :doc_type, :path, :original, :mime, :size, :uploaded_by)'
        );
        $stmt->execute([
            'student_id'   => $studentId,
            'doc_type'     => $docType,
            'path'         => $stored['path'],
            'original'     => $request->files['file']['name'] ?? null,
            'mime'         => $stored['mime'],
            'size'         => $stored['size'],
            'uploaded_by'  => $request->user['id'],
        ]);

        $id = (int) $pdo->lastInsertId();
        $docStmt = $pdo->prepare('SELECT * FROM student_documents WHERE id = :id');
        $docStmt->execute(['id' => $id]);
        $document = $docStmt->fetch();

        AuditLog::record($pdo, $request->user['id'], 'student_document_uploaded', 'student_documents', (string) $id, null, $document);

        Response::json(['document' => $document], 201);
    }

    private function relatedData(PDO $pdo, int $studentId): array
    {
        return [
            'enrollments' => $this->fetchEnrollments($pdo, $studentId),
            'documents'   => $this->fetchDocuments($pdo, $studentId),
        ];
    }

    private function fetchEnrollments(PDO $pdo, int $studentId): array
    {
        $stmt = $pdo->prepare(
            'SELECT e.*, c.code AS course_code, c.name AS course_name, cs.session_name, i.name AS institution_name
             FROM enrollments e
             JOIN courses c ON c.id = e.course_id
             JOIN course_sessions cs ON cs.id = e.session_id
             LEFT JOIN institutions i ON i.id = e.institution_id
             WHERE e.student_id = :id ORDER BY e.enrollment_date DESC'
        );
        $stmt->execute(['id' => $studentId]);
        return $stmt->fetchAll();
    }

    private function fetchDocuments(PDO $pdo, int $studentId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM student_documents WHERE student_id = :id ORDER BY created_at DESC');
        $stmt->execute(['id' => $studentId]);
        return $stmt->fetchAll();
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM students WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Student not found'], 404);
        }
        return $row;
    }
}
