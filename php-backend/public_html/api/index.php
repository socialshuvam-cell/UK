<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Controllers\AdmissionController;
use App\Controllers\AuthController;
use App\Controllers\CourseController;
use App\Controllers\CourseSessionController;
use App\Controllers\CourseSubjectController;
use App\Controllers\DiagnosticsController;
use App\Controllers\EnrollmentController;
use App\Controllers\ExaminationController;
use App\Controllers\ExaminationSubjectController;
use App\Controllers\ExamRegistrationController;
use App\Controllers\HealthController;
use App\Controllers\InstitutionController;
use App\Controllers\MarksController;
use App\Controllers\ResultController;
use App\Controllers\StudentController;
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

// Admissions — public application intake, staff review/approval workflow
$router->post('/api/admissions', [AdmissionController::class, 'store']);
$router->get('/api/admissions', [AdmissionController::class, 'index'], ['auth', 'permission:admissions.view']);
$router->get('/api/admissions/{id}', [AdmissionController::class, 'show'], ['auth', 'permission:admissions.view']);
$router->post('/api/admissions/{id}/review', [AdmissionController::class, 'review'], ['auth', 'csrf', 'permission:admissions.review']);
$router->post('/api/admissions/{id}/enroll', [AdmissionController::class, 'enroll'], ['auth', 'csrf', 'permission:admissions.review']);

// Students (staff-managed)
$router->get('/api/students', [StudentController::class, 'index'], ['auth', 'permission:students.view']);
$router->get('/api/students/{id}', [StudentController::class, 'show'], ['auth', 'permission:students.view']);
$router->put('/api/students/{id}', [StudentController::class, 'update'], ['auth', 'csrf', 'permission:students.manage']);
$router->get('/api/students/{id}/documents', [StudentController::class, 'documents'], ['auth', 'permission:students.view']);
$router->post('/api/students/{id}/documents', [StudentController::class, 'uploadDocument'], ['auth', 'csrf', 'permission:students.manage']);

// Student self-service ("me") — access limited to the caller's own linked student record
$router->get('/api/me/student', [StudentController::class, 'me'], ['auth']);
$router->get('/api/me/enrollments', [StudentController::class, 'meEnrollments'], ['auth']);
$router->get('/api/me/documents', [StudentController::class, 'meDocuments'], ['auth']);
$router->post('/api/me/documents', [StudentController::class, 'meUploadDocument'], ['auth', 'csrf']);

// Enrollments (staff)
$router->get('/api/enrollments', [EnrollmentController::class, 'index'], ['auth', 'permission:enrollments.manage']);
$router->get('/api/enrollments/{id}', [EnrollmentController::class, 'show'], ['auth', 'permission:enrollments.manage']);
$router->put('/api/enrollments/{id}', [EnrollmentController::class, 'update'], ['auth', 'csrf', 'permission:enrollments.manage']);

// Examinations
$router->get('/api/examinations', [ExaminationController::class, 'index'], ['auth', 'permission:exams.manage']);
$router->get('/api/examinations/{id}', [ExaminationController::class, 'show'], ['auth', 'permission:exams.manage']);
$router->post('/api/examinations', [ExaminationController::class, 'store'], ['auth', 'csrf', 'permission:exams.manage']);
$router->put('/api/examinations/{id}', [ExaminationController::class, 'update'], ['auth', 'csrf', 'permission:exams.manage']);
$router->delete('/api/examinations/{id}', [ExaminationController::class, 'destroy'], ['auth', 'csrf', 'permission:exams.manage']);

// Examination subjects (nested under an examination)
$router->get('/api/examinations/{examId}/subjects', [ExaminationSubjectController::class, 'index'], ['auth', 'permission:exams.manage']);
$router->post('/api/examinations/{examId}/subjects', [ExaminationSubjectController::class, 'store'], ['auth', 'csrf', 'permission:exams.manage']);
$router->put('/api/examinations/{examId}/subjects/{subjectId}', [ExaminationSubjectController::class, 'update'], ['auth', 'csrf', 'permission:exams.manage']);
$router->delete('/api/examinations/{examId}/subjects/{subjectId}', [ExaminationSubjectController::class, 'destroy'], ['auth', 'csrf', 'permission:exams.manage']);

// Exam registrations (student exam registration, hall ticket, centre assignment)
$router->get('/api/examinations/{examId}/registrations', [ExamRegistrationController::class, 'index'], ['auth', 'permission:exam_registrations.manage']);
$router->post('/api/examinations/{examId}/registrations', [ExamRegistrationController::class, 'store'], ['auth', 'csrf', 'permission:exam_registrations.manage']);
$router->get('/api/exam-registrations/{id}', [ExamRegistrationController::class, 'show'], ['auth', 'permission:exam_registrations.manage']);
$router->put('/api/exam-registrations/{id}', [ExamRegistrationController::class, 'update'], ['auth', 'csrf', 'permission:exam_registrations.manage']);
$router->get('/api/exam-registrations/{id}/hall-ticket', [ExamRegistrationController::class, 'hallTicket'], ['auth', 'permission:exam_registrations.manage']);

// Marks
$router->get('/api/exam-registrations/{regId}/marks', [MarksController::class, 'index'], ['auth', 'permission:marks.enter']);
$router->post('/api/exam-registrations/{regId}/marks', [MarksController::class, 'store'], ['auth', 'csrf', 'permission:marks.enter']);
$router->put('/api/marks/{id}/verify', [MarksController::class, 'verify'], ['auth', 'csrf', 'permission:marks.verify']);

// Results
$router->post('/api/exam-registrations/{regId}/compute-result', [ResultController::class, 'compute'], ['auth', 'csrf', 'permission:results.publish']);
$router->put('/api/results/{id}/publish', [ResultController::class, 'publish'], ['auth', 'csrf', 'permission:results.publish']);
$router->get('/api/examinations/{examId}/results', [ResultController::class, 'index'], ['auth', 'permission:results.publish']);

// Student self-service — exams/results
$router->get('/api/me/exam-registrations', [ExamRegistrationController::class, 'meIndex'], ['auth']);
$router->get('/api/me/exam-registrations/{id}/hall-ticket', [ExamRegistrationController::class, 'meHallTicket'], ['auth']);
$router->get('/api/me/results', [ResultController::class, 'meIndex'], ['auth']);
$router->get('/api/me/results/{id}', [ResultController::class, 'meShow'], ['auth']);

$router->dispatch(Request::fromGlobals());
