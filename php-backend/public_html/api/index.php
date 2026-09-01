<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Controllers\HealthController;
use App\Core\Request;
use App\Core\Router;

$router = new Router();

$router->get('/api/health', [HealthController::class, 'index']);
$router->get('/api/health/db', [HealthController::class, 'database']);

$router->dispatch(Request::fromGlobals());
