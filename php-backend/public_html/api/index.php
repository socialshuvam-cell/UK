<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Controllers\AuthController;
use App\Controllers\CourseController;
use App\Controllers\CourseSessionController;
use App\Controllers\CourseSubjectController;
use App\Controllers\DiagnosticsController;
use App\Controllers\HealthController;
use App\Controllers\InstitutionController;
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

// Institutions / centres
$router->get('/api/institutions', [InstitutionController::class, 'index'], ['auth', 'permission:institutions.manage']);
$router->get('/api/institutions/{id}', [InstitutionController::class, 'show'], ['auth', 'permission:institutions.manage']);
$router->post('/api/institutions', [InstitutionController::class, 'store'], ['auth', 'csrf', 'permission:institutions.manage']);
$router->put('/api/institutions/{id}', [InstitutionController::class, 'update'], ['auth', 'csrf', 'permission:institutions.manage']);
$router->delete('/api/institutions/{id}', [InstitutionController::class, 'destroy'], ['auth', 'csrf', 'permission:institutions.manage']);
$router->post('/api/institutions/{id}/courses', [InstitutionController::class, 'linkCourse'], ['auth', 'csrf', 'permission:institutions.manage']);
$router->delete('/api/institutions/{id}/courses/{courseId}', [InstitutionController::class, 'unlinkCourse'], ['auth', 'csrf', 'permission:institutions.manage']);

// Courses
$router->get('/api/courses', [CourseController::class, 'index'], ['auth', 'permission:courses.manage']);
$router->get('/api/courses/{id}', [CourseController::class, 'show'], ['auth', 'permission:courses.manage']);
$router->post('/api/courses', [CourseController::class, 'store'], ['auth', 'csrf', 'permission:courses.manage']);
$router->put('/api/courses/{id}', [CourseController::class, 'update'], ['auth', 'csrf', 'permission:courses.manage']);
$router->delete('/api/courses/{id}', [CourseController::class, 'destroy'], ['auth', 'csrf', 'permission:courses.manage']);

// Course subjects (nested under a course)
$router->get('/api/courses/{courseId}/subjects', [CourseSubjectController::class, 'index'], ['auth', 'permission:courses.manage']);
$router->post('/api/courses/{courseId}/subjects', [CourseSubjectController::class, 'store'], ['auth', 'csrf', 'permission:courses.manage']);
$router->put('/api/courses/{courseId}/subjects/{subjectId}', [CourseSubjectController::class, 'update'], ['auth', 'csrf', 'permission:courses.manage']);
$router->delete('/api/courses/{courseId}/subjects/{subjectId}', [CourseSubjectController::class, 'destroy'], ['auth', 'csrf', 'permission:courses.manage']);

// Course sessions (nested under a course)
$router->get('/api/courses/{courseId}/sessions', [CourseSessionController::class, 'index'], ['auth', 'permission:sessions.manage']);
$router->post('/api/courses/{courseId}/sessions', [CourseSessionController::class, 'store'], ['auth', 'csrf', 'permission:sessions.manage']);
$router->put('/api/courses/{courseId}/sessions/{sessionId}', [CourseSessionController::class, 'update'], ['auth', 'csrf', 'permission:sessions.manage']);
$router->delete('/api/courses/{courseId}/sessions/{sessionId}', [CourseSessionController::class, 'destroy'], ['auth', 'csrf', 'permission:sessions.manage']);

$router->dispatch(Request::fromGlobals());
