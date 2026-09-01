<?php
namespace App\Controllers;

use App\Core\Config;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use PDO;
use PDOException;

final class HealthController
{
    public function index(Request $request): void
    {
        Response::json([
            'status' => 'ok',
            'app'    => Config::get('APP_NAME', 'Kingswell Institute API'),
            'env'    => Config::get('APP_ENV', 'local'),
            'time'   => date('c'),
        ]);
    }

    public function database(Request $request): void
    {
        try {
            $pdo = Database::connection();

            $rolesCount = (int) $pdo->query('SELECT COUNT(*) AS total FROM roles')->fetch()['total'];
            $permissionsCount = (int) $pdo->query('SELECT COUNT(*) AS total FROM permissions')->fetch()['total'];
            $countersCount = (int) $pdo->query('SELECT COUNT(*) AS total FROM counters')->fetch()['total'];
            $tableCount = count($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN));

            Response::json([
                'status'            => 'ok',
                'db'                => 'connected',
                'table_count'       => $tableCount,
                'roles_count'       => $rolesCount,
                'permissions_count' => $permissionsCount,
                'counters_count'    => $countersCount,
            ]);
        } catch (PDOException|\RuntimeException $e) {
            Response::json([
                'status'  => 'error',
                'db'      => 'disconnected',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
