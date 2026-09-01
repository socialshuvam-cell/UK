<?php
namespace App\Controllers;

use App\Core\AuditLog;
use App\Core\Database;

// Key/value branding & site settings (existing `settings` table from schema.sql,
// group_name = 'branding'). Lets Super Admin white-label the public site
// (institute name, logo, contact info, footer, homepage copy) without touching code.
final class SettingsController
{
    // Only these keys are exposed to the unauthenticated public website.
    private const PUBLIC_KEYS = [
        'institute_name', 'tagline', 'logo_url', 'contact_email', 'contact_phone',
        'contact_address', 'footer_text', 'established_year',
        'social_facebook', 'social_twitter', 'social_linkedin',
        'hero_heading', 'hero_subheading', 'about_text',
    ];

    public function publicIndex(): void
    {
        $pdo = Database::connection();
        $placeholders = implode(',', array_fill(0, count(self::PUBLIC_KEYS), '?'));
        $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ({$placeholders})");
        $stmt->execute(self::PUBLIC_KEYS);
        \App\Core\Response::json(['settings' => array_column($stmt->fetchAll(), 'setting_value', 'setting_key')]);
    }

    public function index(): void
    {
        $pdo = Database::connection();
        $rows = $pdo->query('SELECT setting_key, setting_value, group_name FROM settings ORDER BY group_name, setting_key')->fetchAll();
        \App\Core\Response::json(['settings' => array_column($rows, 'setting_value', 'setting_key')]);
    }

    public function update(\App\Core\Request $request): void
    {
        $pdo = Database::connection();
        $before = $pdo->query('SELECT setting_key, setting_value FROM settings')->fetchAll();

        $stmt = $pdo->prepare(
            'INSERT INTO settings (group_name, setting_key, setting_value, value_type) VALUES ("branding", :key, :value, "string")
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        foreach ($request->body as $key => $value) {
            if (!in_array($key, self::PUBLIC_KEYS, true)) {
                continue;
            }
            $stmt->execute(['key' => $key, 'value' => (string) $value]);
        }

        $after = $pdo->query('SELECT setting_key, setting_value FROM settings')->fetchAll();
        AuditLog::record($pdo, $request->user['id'], 'settings_updated', 'settings', null, $before, $after);

        $this->index();
    }
}
