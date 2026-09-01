#!/bin/bash
# Recreates the local PHP/Apache/MySQL test environment for the Kingswell PHP backend.
# Safe to re-run (idempotent). Needed after any pod restart since /etc is not persistent.
set -e

APP_DIR="/app/php-backend"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE - cannot continue." >&2
  exit 1
fi

DB_DATABASE=$(grep -E '^DB_DATABASE=' "$ENV_FILE" | cut -d '=' -f2)
DB_USERNAME=$(grep -E '^DB_USERNAME=' "$ENV_FILE" | cut -d '=' -f2)
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d '=' -f2)

echo "== Enabling Apache modules =="
a2enmod rewrite headers >/dev/null

echo "== Installing vhost on :8090 =="
cp "$APP_DIR/deploy/apache-kingswell.conf" /etc/apache2/sites-available/kingswell.conf
a2ensite kingswell >/dev/null

echo "== Ensuring MySQL database + app user =="
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS $DB_DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USERNAME'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
CREATE USER IF NOT EXISTS '$DB_USERNAME'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER ON $DB_DATABASE.* TO '$DB_USERNAME'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, TRIGGER ON $DB_DATABASE.* TO '$DB_USERNAME'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "== Registering supervisor program =="
cat > /etc/supervisor/conf.d/kingswell-apache.conf <<CONF
[program:kingswell-apache]
command=/usr/sbin/apache2ctl -D FOREGROUND
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/kingswell-apache.err.log
stdout_logfile=/var/log/supervisor/kingswell-apache.out.log
CONF

supervisorctl reread >/dev/null
supervisorctl update >/dev/null

echo "== Done. Apache serving http://localhost:8090 =="
