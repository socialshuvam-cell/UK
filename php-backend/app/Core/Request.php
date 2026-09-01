<?php
namespace App\Core;

final class Request
{
    public string $method;
    public string $path;
    public array $query;
    public array $body;
    public array $params = [];

    private function __construct(string $method, string $path, array $query, array $body)
    {
        $this->method = $method;
        $this->path = $path;
        $this->query = $query;
        $this->body = $body;
    }

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = rtrim((string) (parse_url($uri, PHP_URL_PATH) ?? '/'), '/');
        if ($path === '') {
            $path = '/';
        }

        $body = [];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($contentType, 'application/json')) {
            $raw = file_get_contents('php://input');
            $decoded = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
            $body = is_array($decoded) ? $decoded : [];
        } elseif ($method !== 'GET') {
            $body = $_POST;
        }

        return new self($method, $path, $_GET, $body);
    }
}
