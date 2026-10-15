#!/usr/bin/env sh
set -e
BACKUP_DIR="$(dirname "$0")/data/backups"
DB_FILE="$(dirname "$0")/data/ricardo.db"
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_DIR/ricardo_$(date +%Y%m%d_%H%M%S).db"
  find "$BACKUP_DIR" -name "ricardo_*.db" -mtime +30 -delete
fi
