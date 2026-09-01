<?php
namespace App\Core;

use App\Middleware\AuthMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\PermissionMiddleware;

final class Router
{
    /** @var array<int, array{method:string, path:string, regex:string, handler:array, middleware:array}> */
    private array $routes = [];

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array $handler, array $middleware = []): void
    {
        $this->add('PUT', $path, $handler, $middleware);
    }

    public function delete(string $path, array $handler, array $middleware = []): void
    {
        $this->add('DELETE', $path, $handler, $middleware);
    }

    private function add(string $method, string $path, array $handler, array $middleware): void
    {
        $path = rtrim($path, '/');
        $pattern = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $path);

        $this->routes[] = [
            'method'     => $method,
            'path'       => $path,
            'regex'      => '#^' . $pattern . '$#',
            'handler'    => $handler,
            'middleware' => $middleware,
        ];
    }

    public function dispatch(Request $request): void
    {
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }

            $pathMatched = true;
            if ($route['method'] !== $request->method) {
                continue;
            }

            $request->params = array_filter(
                $matches,
                static fn ($key) => !is_int($key),
                ARRAY_FILTER_USE_KEY
            );

            foreach ($route['middleware'] as $middleware) {
                if ($middleware === 'auth') {
                    AuthMiddleware::handle($request);
                } elseif ($middleware === 'csrf') {
                    CsrfMiddleware::handle($request);
                } elseif (str_starts_with($middleware, 'permission:')) {
                    PermissionMiddleware::handle($request, substr($middleware, strlen('permission:')));
                }
            }

            [$class, $method] = $route['handler'];
            (new $class())->$method($request);
            return;
        }

        if ($pathMatched) {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }

        Response::json(['error' => 'Not Found'], 404);
    }
}
