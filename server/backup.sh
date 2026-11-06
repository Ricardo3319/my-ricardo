#!/usr/bin/env sh
set -e
DATA_DIR="${RICARDO_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/my-ricardo}"
BACKUP_DIR="$DATA_DIR/backups"
DB_FILE="$DATA_DIR/ricardo.db"
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_DIR/ricardo_$(date +%Y%m%d_%H%M%S).db"
  find "$BACKUP_DIR" -name "ricardo_*.db" -mtime +30 -delete
fi
