<?php
namespace App\Core;

use PDO;
use PDOException;

final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                Config::required('DB_HOST'),
                Config::get('DB_PORT', '3306'),
                Config::required('DB_DATABASE'),
                Config::get('DB_CHARSET', 'utf8mb4')
            );

            try {
                self::$connection = new PDO(
                    $dsn,
                    Config::required('DB_USERNAME'),
                    Config::required('DB_PASSWORD'),
                    [
                        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES   => false,
                    ]
                );
            } catch (PDOException $e) {
                throw new \RuntimeException('Database connection failed: ' . $e->getMessage(), (int) $e->getCode(), $e);
            }
        }

        return self::$connection;
    }
}
