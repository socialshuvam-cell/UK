<?php
declare(strict_types=1);

date_default_timezone_set('UTC');

spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

App\Core\Env::load(dirname(__DIR__) . '/.env');

$debug = App\Core\Config::get('APP_DEBUG', 'false') === 'true';
ini_set('display_errors', $debug ? '1' : '0');
error_reporting(E_ALL);

$logDir = dirname(__DIR__) . '/storage/logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}
ini_set('log_errors', '1');
ini_set('error_log', $logDir . '/app.log');

set_exception_handler(function (Throwable $e): void {
    error_log('[Uncaught] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    App\Core\Response::json(['error' => 'Internal Server Error'], 500);
});

// Local dev only: allow the React dev server (different port) to call the API.
// In production both are same-origin under Hostinger, so this block is inert.
if (App\Core\Config::get('APP_ENV', 'local') === 'local') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
