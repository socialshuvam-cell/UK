<?php
namespace App\Controllers;

// Temporary Phase 2 endpoints used only to exercise the auth/permission
// middleware end-to-end before any real feature module (Phase 3+) exists.

use App\Core\Request;
use App\Core\Response;

final class DiagnosticsController
{
    public function adminOnly(Request $request): void
    {
        Response::json([
            'ok'      => true,
            'message' => "Access granted: 'users.manage' permission confirmed",
            'role'    => $request->user['role_slug'],
        ]);
    }

    public function studentsView(Request $request): void
    {
        Response::json([
            'ok'      => true,
            'message' => "Access granted: 'students.view' permission confirmed",
            'role'    => $request->user['role_slug'],
        ]);
    }
}
