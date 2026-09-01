<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use PDO;

final class DocumentTemplateController
{
    private const DOC_TYPES = [
        'hall_ticket', 'marksheet', 'transcript', 'certificate', 'diploma',
        'degree', 'completion_letter', 'admission_letter',
    ];
    private const ORIENTATIONS = ['portrait', 'landscape'];

    public function index(Request $request): void
    {
        $pdo = Database::connection();
        $sql = 'SELECT * FROM document_templates';
        $where = [];
        $params = [];
        if (!empty($request->query['doc_type'])) {
            $where[] = 'doc_type = :doc_type';
            $params['doc_type'] = $request->query['doc_type'];
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY doc_type, version DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::json(['templates' => array_map([$this, 'decorate'], $stmt->fetchAll())]);
    }

    public function show(Request $request): void
    {
        $pdo = Database::connection();
        Response::json(['template' => $this->find($pdo, (int) $request->params['id'])]);
    }

    public function store(Request $request): void
    {
        $pdo = Database::connection();
        $v = new Validator($request->body);
        $v->required('doc_type')->in('doc_type', self::DOC_TYPES)
          ->required('name')->maxLength('name', 150)
          ->in('orientation', self::ORIENTATIONS);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        $docType = $request->body['doc_type'];
        $versionStmt = $pdo->prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM document_templates WHERE doc_type = :doc_type');
        $versionStmt->execute(['doc_type' => $docType]);
        $nextVersion = (int) $versionStmt->fetch()['next_version'];

        $isActive = !empty($request->body['is_active']);
        if ($isActive) {
            $pdo->prepare('UPDATE document_templates SET is_active = 0 WHERE doc_type = :doc_type')->execute(['doc_type' => $docType]);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO document_templates (doc_type, name, version, html_layout, css_styles, fields_config, paper_size, orientation, is_active, created_by)
             VALUES (:doc_type, :name, :version, :html, :css, :fields, :paper, :orientation, :is_active, :created_by)'
        );
        $stmt->execute([
            'doc_type'    => $docType,
            'name'        => $request->body['name'],
            'version'     => $nextVersion,
            'html'        => $request->body['html_layout'] ?? null,
            'css'         => $request->body['css_styles'] ?? null,
            'fields'      => isset($request->body['fields_config']) ? json_encode($request->body['fields_config']) : null,
            'paper'       => $request->body['paper_size'] ?? 'A4',
            'orientation' => $request->body['orientation'] ?? 'portrait',
            'is_active'   => $isActive ? 1 : 0,
            'created_by'  => $request->user['id'],
        ]);

        $id = (int) $pdo->lastInsertId();
        $template = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'document_template_created', 'document_templates', (string) $id, null, $template);

        Response::json(['template' => $template], 201);
    }

    public function update(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $v = new Validator($request->body);
        if (isset($request->body['name'])) {
            $v->required('name')->maxLength('name', 150);
        }
        $v->in('orientation', self::ORIENTATIONS);
        if ($v->fails()) {
            Response::json(['errors' => $v->errors()], 422);
        }

        if (array_key_exists('is_active', $request->body) && $request->body['is_active']) {
            $pdo->prepare('UPDATE document_templates SET is_active = 0 WHERE doc_type = :doc_type AND id <> :id')
                ->execute(['doc_type' => $existing['doc_type'], 'id' => $id]);
        }

        $fields = ['name', 'html_layout', 'css_styles', 'paper_size', 'orientation', 'is_active'];
        $set = [];
        $params = ['id' => $id];
        foreach ($fields as $field) {
            if (array_key_exists($field, $request->body)) {
                $set[] = "{$field} = :{$field}";
                $params[$field] = $field === 'is_active' ? (!empty($request->body[$field]) ? 1 : 0) : $request->body[$field];
            }
        }
        if (array_key_exists('fields_config', $request->body)) {
            $set[] = 'fields_config = :fields_config';
            $params['fields_config'] = json_encode($request->body['fields_config']);
        }
        if ($set) {
            $pdo->prepare('UPDATE document_templates SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
        }

        $updated = $this->find($pdo, $id);
        AuditLog::record($pdo, $request->user['id'], 'document_template_updated', 'document_templates', (string) $id, $existing, $updated);

        Response::json(['template' => $updated]);
    }

    public function destroy(Request $request): void
    {
        $pdo = Database::connection();
        $id = (int) $request->params['id'];
        $existing = $this->find($pdo, $id);

        $depStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM documents WHERE template_id = :id');
        $depStmt->execute(['id' => $id]);
        if ((int) $depStmt->fetch()['c'] > 0) {
            Response::json(['error' => 'Template has issued documents; deactivate it instead of deleting'], 409);
        }

        $pdo->prepare('DELETE FROM document_templates WHERE id = :id')->execute(['id' => $id]);
        AuditLog::record($pdo, $request->user['id'], 'document_template_deleted', 'document_templates', (string) $id, $existing, null);

        Response::json(['message' => 'Template deleted']);
    }

    private function decorate(array $row): array
    {
        $row['fields_config'] = $row['fields_config'] ? json_decode($row['fields_config'], true) : null;
        return $row;
    }

    private function find(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM document_templates WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::json(['error' => 'Template not found'], 404);
        }
        return $this->decorate($row);
    }
}
