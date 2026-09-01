<?php
namespace App\Middleware;

use App\Core\Request;
use App\Core\Response;

final class PermissionMiddleware
{
    public static function handle(Request $request, string $permissionSlug): void
    {
        if (!in_array($permissionSlug, $request->permissions ?? [], true)) {
            Response::json(['error' => "Forbidden: missing permission '{$permissionSlug}'"], 403);
        }
    }
}
