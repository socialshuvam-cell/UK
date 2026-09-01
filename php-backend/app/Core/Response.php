<?php
namespace App\Core;

final class Response
{
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function file(string $absolutePath, string $downloadName, string $contentType = 'application/pdf'): never
    {
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: attachment; filename="' . basename($downloadName) . '"');
        header('Content-Length: ' . filesize($absolutePath));
        readfile($absolutePath);
        exit;
    }
}
