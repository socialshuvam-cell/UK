<?php
namespace App\Core;

require_once dirname(__DIR__) . '/Vendor/phpqrcode/qrlib.php';

// Thin wrapper around the vendored single-file phpqrcode library (GD-based
// PNG output, no exec/Imagick) — Hostinger shared-hosting safe.
final class QrCode
{
    public static function generatePng(string $data, string $absolutePath): void
    {
        $dir = dirname($absolutePath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Failed to prepare QR output directory');
        }
        \QRcode::png($data, $absolutePath, QR_ECLEVEL_M, 6, 2);
    }
}
