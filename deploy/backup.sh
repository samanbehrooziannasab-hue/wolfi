#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Trading Wolf AI — Database backup
#   • dumps PostgreSQL (pg_dump) to /var/backups/wolf/ with a timestamp
#   • keeps the last N backups (default 14)
#   • logs to /var/log/wolf/backup.log
#
#   Schedule daily via cron:   0 3 * * * /opt/wolf/deploy/backup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://wolf:CHANGE_ME@localhost:5432/wolf_trading}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wolf}"
KEEP="${KEEP:-14}"
LOG="/var/log/wolf/backup.log"

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG")"
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/wolf_${TS}.sql.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "backup start"
if pg_dump "$DB_URL" | gzip > "$FILE"; then
  log "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
else
  log "backup FAILED"
  exit 1
fi

# retention: delete old backups
ls -1t "$BACKUP_DIR"/wolf_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  log "removed old backup: $old"
done

log "backup done"
