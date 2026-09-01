<?php
namespace App\Core;

// Secure file upload handling per docs/ARCHITECTURE.md §9: MIME sniff, extension
// allowlist, max size, server-generated random filename — never the client's filename.
final class FileUpload
{
    private const ALLOWED_MIME = [
        'image/jpeg'      => 'jpg',
        'image/png'       => 'png',
        'application/pdf' => 'pdf',
    ];

    private const MAX_BYTES = 5 * 1024 * 1024; // 5MB

    public static function store(array $file, string $subDir): array
    {
        if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('File upload failed');
        }
        if ((int) $file['size'] > self::MAX_BYTES) {
            throw new \RuntimeException('File exceeds the maximum allowed size (5MB)');
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            throw new \RuntimeException('Invalid file upload');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!isset(self::ALLOWED_MIME[$mime])) {
            throw new \RuntimeException('Unsupported file type: only JPEG, PNG, and PDF are allowed');
        }

        $extension = self::ALLOWED_MIME[$mime];
        $relativeDir = "uploads/{$subDir}/" . date('Y') . '/' . date('m');
        $absoluteDir = dirname(__DIR__, 2) . '/public_html/' . $relativeDir;

        if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
            throw new \RuntimeException('Failed to prepare upload directory');
        }

        $filename = bin2hex(random_bytes(16)) . '.' . $extension;
        $absolutePath = $absoluteDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $absolutePath)) {
            throw new \RuntimeException('Failed to save uploaded file');
        }

        return [
            'path'     => "{$relativeDir}/{$filename}",
            'mime'     => $mime,
            'size'     => (int) $file['size'],
        ];
    }
}
