<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Auth;
use App\Core\Config;
use App\Core\Counter;
use App\Core\Database;
use App\Core\DocumentRenderer;
use App\Core\QrCode;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

// Unified issuance/lifecycle for all 8 document types per docs/ARCHITECTURE.md
// §3.3/§6/§7. Every issued row freezes a data_snapshot (immutable, enforced by
// the trg_documents_immutable DB trigger) + gets a server-generated
// document_number (Counter) and verification_token, a QR PNG, and a rendered
// PDF — all inside the same request (no persistent process, Hostinger safe).
final class DocumentController
{
    private const DOC_TYPES = [
        'hall_ticket', 'marksheet', 'transcript', 'certificate', 'diploma',
        'degree', 'completion_letter', 'admission_letter',
    ];

    private const SEQUENCE_KEYS = [
        'marksheet'         => 'MS',
        'certificate'       => 'CERT',
        'diploma'           => 'DIP',
        'degree'            => 'DEG',
        'transcript'        => 'TR',
        'completion_letter' => 'CL',
        'admission_letter'  => 'AL',
    ];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT d.*, s.first_name, s.last_name, s.registration_number
                FROM documents d JOIN students s ON s.id = d.student_id';
        $where = [];
        $params = [];
        foreach (['doc_type', 'status', 'student_id'] as $filter) {
            if (!empty($request->query[$filter])) {
                $where[] = "d.{$filter} = :{$filter}";
                $params[$filter] = $request->query[$filter];
            }
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY d.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['documents' => array_map([$this, 'decorate'], $stmt->fetchAll())]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $doc = $this->find($pdo, (int) $request->params['id']);
        Response::json(['document' => $doc, 'signatories' => $this->fetchSignatories($pdo, $doc['id'])]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $v = new Validator($request->body);
        $v->required('doc_type')->in('doc_type', self::DOC_TYPES);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }
        $docType = $request->body['doc_type'];

        $built = $this->buildSnapshot($pdo, $docType, $request->body);
        $this->issue($pdo, $request->user['id'], $docType, $built, $request->body, null);
    }

    public function reissue(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $old = $this->find($pdo, $id);

        if ($old['status'] === 'superseded') {
            Response::json(['error' => 'This document has already been superseded'], 409);
        }
        if ($old['doc_type'] === 'hall_ticket') {
            Response::json(['error' => "Hall tickets cannot be reissued as a new document number; update the exam registration's status/center instead"], 409);
        }

        $syntheticBody = array_filter([
            'exam_registration_id' => $old['exam_registration_id'],
            'result_id'            => $old['result_id'],
            'enrollment_id'        => $old['enrollment_id'],
            'admission_id'         => $old['admission_id'],
            'student_id'           => $old['student_id'],
            'result_ids'           => $old['doc_type'] === 'transcript'
                ? array_column($this->fetchDocumentResults($pdo, $id), 'result_id')
                : null,
            'institution_id'       => $old['institution_id'],
            'template_id'          => $request->body['template_id'] ?? $old['template_id'],
            'signatories'          => $request->body['signatories'] ?? null,
        ], static fn ($v) => $v !== null);

        $built = $this->buildSnapshot($pdo, $old['doc_type'], $syntheticBody);
        $this->issue($pdo, $request->user['id'], $old['doc_type'], $built, $syntheticBody, $old);
    }

    public function download(Request $request): void
    {
        $pdo = Database::connection();
        $doc = $this->find($pdo, (int) $request->params['id']);
        $this->streamFile($doc);
    }

    public function revoke(Request $request): void
    {
        $this->changeStatus($request, 'revoked');
    }

    public function cancel(Request $request): void
    {
        $this->changeStatus($request, 'cancelled');
    }

    public function addSignatory(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $this->find($pdo, $id);

        $v = new Validator($request->body);
        $v->required('name')->maxLength('name', 150);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $countStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM document_signatories WHERE document_id = :id');
        $countStmt->execute(['id' => $id]);
        $sort = (int) $countStmt->fetch()['c'];

        $pdo->prepare(
            'INSERT INTO document_signatories (document_id, name, designation, sort_order) VALUES (:doc_id, :name, :designation, :sort)'
        )->execute([
            'doc_id'      => $id,
            'name'        => $request->body['name'],
            'designation' => $request->body['designation'] ?? null,
            'sort'        => $sort,
        ]);

        AuditLog::record($pdo, $request->user['id'], 'document_signatory_added', 'documents', (string) $id, null, $request->body);

        Response::json(['signatories' => $this->fetchSignatories($pdo, $id)], 201);
    }

    // --- Student self-service ---

    public function meIndex(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM documents WHERE student_id = :sid ORDER BY created_at DESC');
        $stmt->execute(['sid' => $studentId]);
        Response::json(['documents' => array_map([$this, 'decorate'], $stmt->fetchAll())]);
    }

    public function meDownload(Request $request): void
    {
        $studentId = Auth::requireStudentId($request);
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM documents WHERE id = :id AND student_id = :sid');
        $stmt->execute(['id' => (int) $request->params['id'], 'sid' => $studentId]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::json(['error' => 'Document not found'], 404);
        }
        $this->streamFile($doc);
    }

    // --- Issuance pipeline (shared by store() and reissue()) ---

    private function issue(PDO $pdo, int $userId, string $docType, array $built, array $body, ?array $reissuedFrom): void
    {
        $template = $this->resolveTemplate($pdo, $docType, $body['template_id'] ?? null);

        $documentNumber = $docType === 'hall_ticket'
            ? $built['snapshot']['extra']['hall_ticket_number']
            : Counter::next($pdo, self::SEQUENCE_KEYS[$docType]);

        $signatories = $body['signatories'] ?? ($template['fields_config']['default_signatories'] ?? []);
        if (!is_array($signatories)) {
            $signatories = [];
        }
        $signatories = array_map(
            static fn ($s) => ['name' => $s['name'] ?? '', 'designation' => $s['designation'] ?? ''],
            $signatories
        );

        $snapshot = $built['snapshot'];
        $snapshot['doc_type'] = $docType;
        $snapshot['document_number'] = $documentNumber;
        $snapshot['issue_date'] = date('Y-m-d');
        $snapshot['signatories'] = $signatories;

        $snapshotJson = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $hash = hash('sha256', $snapshotJson);
        $uuid = self::uuidv4();
        $token = bin2hex(random_bytes(24));
        $anchors = $built['anchors'];

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO documents (uuid, document_number, doc_type, template_id, student_id, admission_id, enrollment_id,
                    examination_id, result_id, exam_registration_id, course_id, session_id, institution_id,
                    verification_token, data_snapshot, snapshot_hash, status, revision, replaces_document_id, issue_date, issued_by)
                 VALUES (:uuid, :doc_number, :doc_type, :template_id, :student_id, :admission_id, :enrollment_id,
                    :examination_id, :result_id, :exam_registration_id, :course_id, :session_id, :institution_id,
                    :token, :snapshot, :hash, "valid", :revision, :replaces_id, CURDATE(), :issued_by)'
            );
            $stmt->execute([
                'uuid'                 => $uuid,
                'doc_number'           => $documentNumber,
                'doc_type'             => $docType,
                'template_id'          => $template['id'],
                'student_id'           => $built['student_id'],
                'admission_id'         => $anchors['admission_id'] ?? null,
                'enrollment_id'        => $anchors['enrollment_id'] ?? null,
                'examination_id'       => $anchors['examination_id'] ?? null,
                'result_id'            => $anchors['result_id'] ?? null,
                'exam_registration_id' => $anchors['exam_registration_id'] ?? null,
                'course_id'            => $anchors['course_id'] ?? null,
                'session_id'           => $anchors['session_id'] ?? null,
                'institution_id'       => $snapshot['institution']['id'] ?? null,
                'token'                => $token,
                'snapshot'             => $snapshotJson,
                'hash'                 => $hash,
                'revision'             => $reissuedFrom ? ((int) $reissuedFrom['revision'] + 1) : 1,
                'replaces_id'          => $reissuedFrom['id'] ?? null,
                'issued_by'            => $userId,
            ]);
            $id = (int) $pdo->lastInsertId();

            foreach ($signatories as $i => $sig) {
                $pdo->prepare(
                    'INSERT INTO document_signatories (document_id, name, designation, sort_order) VALUES (:doc_id, :name, :designation, :sort)'
                )->execute(['doc_id' => $id, 'name' => $sig['name'], 'designation' => $sig['designation'], 'sort' => $i]);
            }

            if ($docType === 'transcript') {
                foreach ($anchors['result_ids'] as $i => $rid) {
                    $pdo->prepare(
                        'INSERT INTO document_results (document_id, result_id, sort_order) VALUES (:doc_id, :rid, :sort)'
                    )->execute(['doc_id' => $id, 'rid' => $rid, 'sort' => $i]);
                }
            }

            if ($reissuedFrom) {
                $pdo->prepare('UPDATE documents SET status = "superseded", superseded_by = :new_id WHERE id = :old_id')
                    ->execute(['new_id' => $id, 'old_id' => $reissuedFrom['id']]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $this->generateFiles($pdo, $id, $snapshot, $token, $template);

        $document = $this->find($pdo, $id);
        $action = $reissuedFrom ? 'document_reissued' : 'document_issued';
        AuditLog::record($pdo, $userId, $action, 'documents', (string) $id, $reissuedFrom, $document);

        Response::json(['document' => $document, 'signatories' => $this->fetchSignatories($pdo, $id)], 201);
    }

    private function generateFiles(PDO $pdo, int $id, array $snapshot, string $token, array $template): void
    {
        $relativeDir = 'uploads/documents/' . date('Y') . '/' . date('m');
        $absoluteDir = dirname(__DIR__, 2) . '/public_html/' . $relativeDir;
        if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
            throw new \RuntimeException('Failed to prepare document output directory');
        }

        $baseName = 'doc_' . $id . '_' . bin2hex(random_bytes(6));
        $qrRelative = "{$relativeDir}/{$baseName}_qr.png";
        $pdfRelative = "{$relativeDir}/{$baseName}.pdf";
        $qrAbsolute = dirname(__DIR__, 2) . '/public_html/' . $qrRelative;
        $pdfAbsolute = dirname(__DIR__, 2) . '/public_html/' . $pdfRelative;

        $verifyUrl = rtrim((string) Config::get('APP_URL', ''), '/') . '/verify/' . $token;
        QrCode::generatePng($verifyUrl, $qrAbsolute);

        $photoAbsolute = null;
        $photoPath = $snapshot['student']['photo_path'] ?? null;
        if ($photoPath && in_array(strtolower((string) pathinfo($photoPath, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png'], true)) {
            $candidate = dirname(__DIR__, 2) . '/public_html/' . $photoPath;
            if (is_file($candidate)) {
                $photoAbsolute = $candidate;
            }
        }

        DocumentRenderer::render($snapshot, $qrAbsolute, $verifyUrl, $photoAbsolute, $template, $pdfAbsolute);

        $pdo->prepare('UPDATE documents SET qr_code_path = :qr, file_path = :file WHERE id = :id')
            ->execute(['qr' => $qrRelative, 'file' => $pdfRelative, 'id' => $id]);
    }

    private function changeStatus(Request $request, string $newStatus): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        if ($existing['status'] !== 'valid') {
            Response::json(['error' => "Only a 'valid' document can be {$newStatus}; current status is '{$existing['status']}'"], 409);
        }

        $v = new Validator($request->body);
        $v->required('reason')->maxLength('reason', 255);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $pdo->prepare('UPDATE documents SET status = :status, status_reason = :reason, revoked_by = :by, revoked_at = UTC_TIMESTAMP() WHERE id = :id')
            ->execute(['status' => $newStatus, 'reason' => $request->body['reason'], 'by' => $request->user['id'], 'id' => $id]);

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], "document_{$newStatus}", 'documents', (string) $id, $existing, $updated);

        Response::json(['document' => $updated]);
    }

    private function streamFile(array $doc): void
    {
        if (empty($doc['file_path'])) {
            Response::json(['error' => 'Document file not available'], 404);
        }
        $absolute = dirname(__DIR__, 2) . '/public_html/' . $doc['file_path'];
        if (!is_file($absolute)) {
            Response::json(['error' => 'Document file not found on disk'], 404);
        }
        Response::file($absolute, $doc['document_number'] . '.pdf');
    }

    // --- Snapshot builders, one per doc_type family ---

    private function buildSnapshot(PDO $pdo, string $docType, array $body): array
    {
        return match ($docType) {
            'hall_ticket' => $this->buildHallTicket($pdo, $body),
            'marksheet' => $this->buildMarksheet($pdo, $body),
            'transcript' => $this->buildTranscript($pdo, $body),
            'certificate', 'diploma', 'degree', 'completion_letter' => $this->buildCourseCompletion($pdo, $body, $docType),
            'admission_letter' => $this->buildAdmissionLetter($pdo, $body),
        };
    }

    private function buildHallTicket(PDO $pdo, array $body): array
    {
        $v = new Validator($body);
        $v->required('exam_registration_id')->integer('exam_registration_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $regId = (int) $body['exam_registration_id'];
        $stmt = $pdo->prepare('SELECT * FROM exam_registrations WHERE id = :id');
        $stmt->execute(['id' => $regId]);
        $reg = $stmt->fetch();
        if (!$reg) {
            Response::json(['errors' => ['exam_registration_id' => ['Exam registration not found']]], 422);
        }

        $exam = $this->fetchOne($pdo, 'examinations', (int) $reg['examination_id']);
        $student = $this->fetchOne($pdo, 'students', (int) $reg['student_id']);
        $course = $this->fetchOne($pdo, 'courses', (int) $exam['course_id']);
        $session = $this->fetchOne($pdo, 'course_sessions', (int) $exam['session_id']);

        $subjStmt = $pdo->prepare(
            'SELECT es.exam_date, es.start_time, es.duration_minutes, cs.subject_code, cs.subject_name
             FROM examination_subjects es JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE es.examination_id = :id ORDER BY es.exam_date, es.start_time'
        );
        $subjStmt->execute(['id' => $exam['id']]);

        $institution = $this->resolveInstitution($pdo, $this->requestedInstitutionId($body));

        return [
            'student_id' => (int) $student['id'],
            'anchors'    => ['exam_registration_id' => $regId, 'examination_id' => (int) $exam['id'], 'course_id' => (int) $course['id'], 'session_id' => (int) $session['id']],
            'snapshot'   => [
                'student'     => $this->studentSnapshot($student),
                'course'      => ['id' => (int) $course['id'], 'code' => $course['code'], 'name' => $course['name']],
                'session'     => ['id' => (int) $session['id'], 'name' => $session['session_name']],
                'institution' => $institution,
                'extra'       => [
                    'hall_ticket_number' => $reg['hall_ticket_number'],
                    'exam_center'        => $reg['exam_center'],
                    'seat_number'        => $reg['seat_number'],
                    'examination'        => ['id' => (int) $exam['id'], 'exam_code' => $exam['exam_code'], 'name' => $exam['name']],
                    'subjects'           => $subjStmt->fetchAll(),
                ],
            ],
        ];
    }

    private function buildMarksheet(PDO $pdo, array $body): array
    {
        $v = new Validator($body);
        $v->required('result_id')->integer('result_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $resultId = (int) $body['result_id'];
        $stmt = $pdo->prepare('SELECT * FROM results WHERE id = :id');
        $stmt->execute(['id' => $resultId]);
        $result = $stmt->fetch();
        if (!$result) {
            Response::json(['errors' => ['result_id' => ['Result not found']]], 422);
        }
        if ($result['published_at'] === null) {
            Response::json(['error' => 'Result must be published before a marksheet can be issued'], 409);
        }

        $regStmt = $pdo->prepare('SELECT er.*, e.institution_id AS enrollment_institution_id FROM exam_registrations er JOIN enrollments e ON e.id = er.enrollment_id WHERE er.id = :id');
        $regStmt->execute(['id' => $result['exam_registration_id']]);
        $reg = $regStmt->fetch();

        $exam = $this->fetchOne($pdo, 'examinations', (int) $result['examination_id']);
        $student = $this->fetchOne($pdo, 'students', (int) $result['student_id']);
        $course = $this->fetchOne($pdo, 'courses', (int) $exam['course_id']);
        $session = $this->fetchOne($pdo, 'course_sessions', (int) $exam['session_id']);

        $subjStmt = $pdo->prepare(
            'SELECT m.marks_obtained, m.is_absent, es.max_marks, es.pass_marks, cs.subject_code, cs.subject_name
             FROM marks m JOIN examination_subjects es ON es.id = m.examination_subject_id JOIN course_subjects cs ON cs.id = es.course_subject_id
             WHERE m.exam_registration_id = :reg_id ORDER BY cs.subject_code'
        );
        $subjStmt->execute(['reg_id' => $result['exam_registration_id']]);

        $institutionId = $this->requestedInstitutionId($body) ?? ($reg['enrollment_institution_id'] ?? null);
        $institution = $this->resolveInstitution($pdo, $institutionId ? (int) $institutionId : null);

        return [
            'student_id' => (int) $student['id'],
            'anchors'    => [
                'result_id' => $resultId, 'examination_id' => (int) $exam['id'],
                'exam_registration_id' => (int) $result['exam_registration_id'], 'course_id' => (int) $course['id'], 'session_id' => (int) $session['id'],
            ],
            'snapshot'   => [
                'student'     => $this->studentSnapshot($student),
                'course'      => ['id' => (int) $course['id'], 'code' => $course['code'], 'name' => $course['name']],
                'session'     => ['id' => (int) $session['id'], 'name' => $session['session_name']],
                'institution' => $institution,
                'extra'       => [
                    'examination'          => ['id' => (int) $exam['id'], 'exam_code' => $exam['exam_code'], 'name' => $exam['name']],
                    'subjects'             => $subjStmt->fetchAll(),
                    'total_max_marks'      => $result['total_max_marks'],
                    'total_obtained_marks' => $result['total_obtained_marks'],
                    'percentage'           => $result['percentage'],
                    'grade'                => $result['grade'],
                    'result_status'        => $result['result_status'],
                ],
            ],
        ];
    }

    private function buildTranscript(PDO $pdo, array $body): array
    {
        $v = new Validator($body);
        $v->required('student_id')->integer('student_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $studentId = (int) $body['student_id'];
        $student = $this->fetchOne($pdo, 'students', $studentId, false);
        if (!$student) {
            Response::json(['errors' => ['student_id' => ['Student not found']]], 422);
        }

        $resultIds = $body['result_ids'] ?? [];
        if (!is_array($resultIds) || count($resultIds) === 0) {
            Response::json(['errors' => ['result_ids' => ['At least one result_id is required']]], 422);
        }

        $exams = [];
        $percSum = 0.0;
        $count = 0;
        foreach ($resultIds as $rid) {
            $rStmt = $pdo->prepare(
                'SELECT r.*, e.exam_code, e.name AS exam_name FROM results r JOIN examinations e ON e.id = r.examination_id WHERE r.id = :id AND r.student_id = :sid'
            );
            $rStmt->execute(['id' => (int) $rid, 'sid' => $studentId]);
            $r = $rStmt->fetch();
            if (!$r) {
                Response::json(['errors' => ['result_ids' => ["Result id {$rid} not found for this student"]]], 422);
            }
            if ($r['published_at'] === null) {
                Response::json(['error' => "Result id {$rid} is not published; cannot include in transcript"], 409);
            }
            $exams[] = [
                'result_id' => (int) $r['id'], 'exam_code' => $r['exam_code'], 'exam_name' => $r['exam_name'],
                'percentage' => $r['percentage'], 'grade' => $r['grade'], 'result_status' => $r['result_status'],
            ];
            $percSum += (float) $r['percentage'];
            $count++;
        }

        $overallPct = $count > 0 ? round($percSum / $count, 2) : 0;
        $institution = $this->resolveInstitution($pdo, $this->requestedInstitutionId($body));

        return [
            'student_id' => $studentId,
            'anchors'    => ['result_ids' => array_map('intval', $resultIds)],
            'snapshot'   => [
                'student'     => $this->studentSnapshot($student),
                'course'      => null,
                'session'     => null,
                'institution' => $institution,
                'extra'       => [
                    'exams'              => $exams,
                    'overall_percentage' => $overallPct,
                    'overall_grade'      => self::gradeFor($overallPct),
                ],
            ],
        ];
    }

    private function buildCourseCompletion(PDO $pdo, array $body, string $docType): array
    {
        $v = new Validator($body);
        $v->required('enrollment_id')->integer('enrollment_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $enrollmentId = (int) $body['enrollment_id'];
        $stmt = $pdo->prepare('SELECT * FROM enrollments WHERE id = :id');
        $stmt->execute(['id' => $enrollmentId]);
        $enrollment = $stmt->fetch();
        if (!$enrollment) {
            Response::json(['errors' => ['enrollment_id' => ['Enrollment not found']]], 422);
        }
        if ($enrollment['status'] !== 'completed') {
            Response::json(['errors' => ['enrollment_id' => ["Enrollment must be 'completed' to issue a {$docType} (current: '{$enrollment['status']}')"]]], 422);
        }

        $student = $this->fetchOne($pdo, 'students', (int) $enrollment['student_id']);
        $course = $this->fetchOne($pdo, 'courses', (int) $enrollment['course_id']);
        $session = $this->fetchOne($pdo, 'course_sessions', (int) $enrollment['session_id']);

        $institutionId = $this->requestedInstitutionId($body) ?? ($enrollment['institution_id'] ?? null);
        $institution = $this->resolveInstitution($pdo, $institutionId ? (int) $institutionId : null);

        $resultSummary = null;
        if (!empty($body['result_id'])) {
            $rStmt = $pdo->prepare('SELECT * FROM results WHERE id = :id AND student_id = :sid');
            $rStmt->execute(['id' => (int) $body['result_id'], 'sid' => $student['id']]);
            $r = $rStmt->fetch();
            if (!$r) {
                Response::json(['errors' => ['result_id' => ['Result not found for this student']]], 422);
            }
            if ($r['published_at'] === null) {
                Response::json(['error' => 'Result must be published to be referenced on this document'], 409);
            }
            $resultSummary = ['percentage' => $r['percentage'], 'grade' => $r['grade'], 'result_status' => $r['result_status']];
        }

        return [
            'student_id' => (int) $student['id'],
            'anchors'    => ['enrollment_id' => $enrollmentId, 'course_id' => (int) $course['id'], 'session_id' => (int) $session['id']],
            'snapshot'   => [
                'student'     => $this->studentSnapshot($student),
                'course'      => ['id' => (int) $course['id'], 'code' => $course['code'], 'name' => $course['name']],
                'session'     => ['id' => (int) $session['id'], 'name' => $session['session_name']],
                'institution' => $institution,
                'extra'       => [
                    'roll_number'       => $enrollment['roll_number'],
                    'enrollment_status' => $enrollment['status'],
                    'result'            => $resultSummary,
                ],
            ],
        ];
    }

    private function buildAdmissionLetter(PDO $pdo, array $body): array
    {
        $v = new Validator($body);
        $v->required('admission_id')->integer('admission_id');
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $admissionId = (int) $body['admission_id'];
        $stmt = $pdo->prepare('SELECT * FROM admissions WHERE id = :id');
        $stmt->execute(['id' => $admissionId]);
        $admission = $stmt->fetch();
        if (!$admission) {
            Response::json(['errors' => ['admission_id' => ['Admission not found']]], 422);
        }
        if (in_array($admission['status'], ['rejected', 'cancelled'], true) || empty($admission['student_id'])) {
            Response::json(['error' => "Admission letters require an approved and enrolled admission (current status: '{$admission['status']}')"], 409);
        }

        $course = $this->fetchOne($pdo, 'courses', (int) $admission['course_id']);
        $session = $admission['session_id'] ? $this->fetchOne($pdo, 'course_sessions', (int) $admission['session_id'], false) : null;
        $student = $this->fetchOne($pdo, 'students', (int) $admission['student_id']);

        $institutionId = $this->requestedInstitutionId($body) ?? ($admission['institution_id'] ?? null);
        $institution = $this->resolveInstitution($pdo, $institutionId ? (int) $institutionId : null);

        return [
            'student_id' => (int) $student['id'],
            'anchors'    => ['admission_id' => $admissionId, 'course_id' => (int) $course['id'], 'session_id' => $session['id'] ?? null],
            'snapshot'   => [
                'student'     => $this->studentSnapshot($student),
                'course'      => ['id' => (int) $course['id'], 'code' => $course['code'], 'name' => $course['name']],
                'session'     => $session ? ['id' => (int) $session['id'], 'name' => $session['session_name']] : null,
                'institution' => $institution,
                'extra'       => [
                    'admission_number' => $admission['admission_number'],
                    'applicant_name'   => $admission['applicant_first_name'] . ' ' . $admission['applicant_last_name'],
                ],
            ],
        ];
    }

    // --- Shared helpers ---

    private function requestedInstitutionId(array $body): ?int
    {
        return isset($body['institution_id']) && $body['institution_id'] !== '' ? (int) $body['institution_id'] : null;
    }

    private function resolveInstitution(PDO $pdo, ?int $institutionId): ?array
    {
        if (!$institutionId) {
            return null;
        }
        $stmt = $pdo->prepare('SELECT id, name, code FROM institutions WHERE id = :id');
        $stmt->execute(['id' => $institutionId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function studentSnapshot(array $student): array
    {
        return [
            'id'                  => (int) $student['id'],
            'registration_number' => $student['registration_number'],
            'first_name'          => $student['first_name'],
            'last_name'           => $student['last_name'],
            'photo_path'          => $student['photo_path'],
        ];
    }

    private function fetchOne(PDO $pdo, string $table, int $id, bool $strict = true): ?array
    {
        $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE id = :id");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row && $strict) {
            Response::json(['error' => ucfirst($table) . ' not found'], 422);
        }
        return $row ?: null;
    }

    private function resolveTemplate(PDO $pdo, string $docType, mixed $templateId): array
    {
        if ($templateId) {
            $stmt = $pdo->prepare('SELECT * FROM document_templates WHERE id = :id AND doc_type = :type');
            $stmt->execute(['id' => (int) $templateId, 'type' => $docType]);
            $row = $stmt->fetch();
            if (!$row) {
                Response::json(['errors' => ['template_id' => ['Template not found for this doc_type']]], 422);
            }
        } else {
            $stmt = $pdo->prepare('SELECT * FROM document_templates WHERE doc_type = :type AND is_active = 1 ORDER BY version DESC LIMIT 1');
            $stmt->execute(['type' => $docType]);
            $row = $stmt->fetch();
            if (!$row) {
                Response::json(['error' => "No active document template configured for doc_type '{$docType}'"], 409);
            }
        }
        $row['fields_config'] = $row['fields_config'] ? json_decode($row['fields_config'], true) : [];
        return $row;
    }

    private function fetchSignatories(PDO $pdo, int $documentId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM document_signatories WHERE document_id = :id ORDER BY sort_order, id');
        $stmt->execute(['id' => $documentId]);
        return $stmt->fetchAll();
    }

    private function fetchDocumentResults(PDO $pdo, int $documentId): array
    {
        $stmt = $pdo->prepare('SELECT result_id FROM document_results WHERE document_id = :id ORDER BY sort_order');
        $stmt->execute(['id' => $documentId]);
        return $stmt->fetchAll();
    }

    private function decorate(array $row): array
    {
        if (isset($row['data_snapshot']) && is_string($row['data_snapshot'])) {
            $row['data_snapshot'] = json_decode($row['data_snapshot'], true);
        }
        return $row;
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM documents WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Document not found'], 404);
        }
        return $this->decorate($row);
    }

    private static function gradeFor(float $percentage): string
    {
        return match (true) {
            $percentage >= 90 => 'A+',
            $percentage >= 80 => 'A',
            $percentage >= 70 => 'B+',
            $percentage >= 60 => 'B',
            $percentage >= 50 => 'C',
            $percentage >= 40 => 'D',
            default            => 'F',
        };
    }

    private static function uuidv4(): string
    {
        $hex = bin2hex(random_bytes(16));
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }
}
