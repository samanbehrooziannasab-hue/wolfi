#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Trading Wolf AI — Database restore
#
#   Usage:  ./deploy/restore.sh /var/backups/wolf/wolf_20260101_030000.sql.gz
#   WARNING: this DROPS and recreates the target database. Use with care.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://wolf:CHANGE_ME@localhost:5432/wolf_trading}"
BACKUP_FILE="${1:?usage: restore.sh <backup-file.sql.gz>}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "error: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "Are you sure you want to RESTORE from $BACKUP_FILE?"
echo "The current database will be DROPPED and recreated."
read -r -p "Type 'restore' to continue: " confirm
if [[ "$confirm" != "restore" ]]; then
  echo "aborted."
  exit 1
fi

# extract connection parts from the URL (assumes postgres://user:pass@host:port/db)
DB_NAME="$(basename "${DB_URL%%\?*}")"
DB_HOST_PORT="${DB_URL#*@}"
DB_HOST="${DB_HOST_PORT%%:*}"
DB_PORT="${DB_HOST_PORT#*:}"
DB_PORT="${DB_PORT%%/*}"
DB_USER="${DB_URL#*://}"
DB_USER="${DB_USER%%:*}"

echo "restoring into database '$DB_NAME' on $DB_HOST:$DB_PORT ..."
gunzip -c "$BACKUP_FILE" | psql "postgres://$DB_USER@$DB_HOST:$DB_PORT/postgres" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME;" -c "CREATE DATABASE $DB_NAME;"
gunzip -c "$BACKUP_FILE" | psql "$DB_URL" -v ON_ERROR_STOP=1

echo "restore done."
