<?php
namespace App\Core;

final class Config
{
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = $_ENV[$key] ?? getenv($key);
        if ($value === false || $value === null || $value === '') {
            return $default;
        }

        return $value;
    }

    public static function required(string $key): string
    {
        $value = self::get($key);
        if ($value === null) {
            throw new \RuntimeException("Missing required config: {$key}");
        }

        return $value;
    }
}
