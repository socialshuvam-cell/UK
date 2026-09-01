<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;

// Public, unauthenticated verification: GET /api/verify/{token}. Never 404s for
// a syntactically-valid lookup — revoked/cancelled/superseded tokens still
// resolve and communicate their state; only truly unknown tokens report
// found=false. Every lookup is logged to document_verifications and rate
// limited per docs/ARCHITECTURE.md §6.
final class VerificationController
{
    public function show(Request $request): void
    {
        $pdo = Database::connection();
        $token = (string) $request->params['token'];
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        if (RateLimiter::isBlocked($pdo, $token, $ip, 'verify', 30, 15)) {
            Response::json(['error' => 'Too many verification attempts; please try again later'], 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM documents WHERE verification_token = :token');
        $stmt->execute(['token' => $token]);
        $doc = $stmt->fetch();

        RateLimiter::record($pdo, $token, $ip, 'verify', $doc !== false);

        $pdo->prepare(
            'INSERT INTO document_verifications (document_id, token_used, result, ip_address, user_agent)
             VALUES (:doc_id, :token, :result, :ip, :ua)'
        )->execute([
            'doc_id' => $doc ? $doc['id'] : null,
            'token'  => $token,
            'result' => $doc ? $doc['status'] : 'not_found',
            'ip'     => $ip,
            'ua'     => $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);

        if (!$doc) {
            Response::json(['found' => false, 'status' => 'not_found']);
        }

        $snapshot = json_decode((string) $doc['data_snapshot'], true) ?: [];
        $extra = $snapshot['extra'] ?? [];

        $response = [
            'found'                => true,
            'status'               => $doc['status'],
            'document_number'      => $doc['document_number'],
            'doc_type'             => $doc['doc_type'],
            'issue_date'           => $doc['issue_date'],
            'student_name'         => trim(($snapshot['student']['first_name'] ?? '') . ' ' . ($snapshot['student']['last_name'] ?? '')),
            'registration_number'  => $snapshot['student']['registration_number'] ?? null,
            'course'               => $snapshot['course']['name'] ?? null,
            'session'              => $snapshot['session']['name'] ?? null,
            'institution'          => $snapshot['institution']['name'] ?? null,
            'result_status'        => $extra['result_status'] ?? ($extra['result']['result_status'] ?? null),
            'grade'                => $extra['grade'] ?? ($extra['result']['grade'] ?? null),
        ];

        if (in_array($doc['status'], ['revoked', 'cancelled'], true)) {
            $response['status_reason'] = $doc['status_reason'];
            $response['status_at'] = $doc['revoked_at'];
        }

        if ($doc['status'] === 'superseded' && $doc['superseded_by']) {
            $newStmt = $pdo->prepare('SELECT document_number FROM documents WHERE id = :id');
            $newStmt->execute(['id' => $doc['superseded_by']]);
            $response['superseded_by_document_number'] = ($newStmt->fetch() ?: [])['document_number'] ?? null;
        }

        Response::json($response);
    }
}
