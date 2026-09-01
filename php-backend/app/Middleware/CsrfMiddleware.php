<?php
namespace App\Middleware;

use App\Core\Request;
use App\Core\Response;

final class CsrfMiddleware
{
    public static function handle(Request $request): void
    {
        $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if ($header === '' || $request->csrfToken === null || !hash_equals($request->csrfToken, $header)) {
            Response::json(['error' => 'Invalid CSRF token'], 403);
        }
    }
}
