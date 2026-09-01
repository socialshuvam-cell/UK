<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Controllers\AuthController;
use App\Controllers\DiagnosticsController;
use App\Controllers\HealthController;
use App\Core\Request;
use App\Core\Router;

$router = new Router();

$router->get('/api/health', [HealthController::class, 'index']);
$router->get('/api/health/db', [HealthController::class, 'database']);

$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->post('/api/auth/logout', [AuthController::class, 'logout'], ['auth', 'csrf']);
$router->get('/api/auth/me', [AuthController::class, 'me'], ['auth']);

// Phase 2 RBAC verification only — see DiagnosticsController.
$router->get('/api/diagnostics/admin-only', [DiagnosticsController::class, 'adminOnly'], ['auth', 'permission:users.manage']);
$router->get('/api/diagnostics/students-view', [DiagnosticsController::class, 'studentsView'], ['auth', 'permission:students.view']);

$router->dispatch(Request::fromGlobals());
