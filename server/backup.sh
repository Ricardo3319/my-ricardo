#!/usr/bin/env sh
set -e
umask 077
DATA_DIR="${RICARDO_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/my-ricardo}"
python3 - "$DATA_DIR" <<'PY'
from contextlib import closing
from datetime import datetime
from pathlib import Path
import sqlite3
import sys
import time

data = Path(sys.argv[1]).expanduser().resolve()
source = data / "ricardo.db"
if not source.is_file():
    raise SystemExit("Database not found; no backup created.")
backups = data / "backups"
backups.mkdir(parents=True, exist_ok=True)
target = backups / datetime.now().strftime("ricardo_%Y%m%d_%H%M%S_%f.db")
temporary = target.with_suffix(".db.tmp")
try:
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
        with closing(sqlite3.connect(temporary)) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
    temporary.replace(target)
finally:
    temporary.unlink(missing_ok=True)
for old in backups.glob("ricardo_*.db"):
    if old.stat().st_mtime < time.time() - 30 * 86400:
        old.unlink()
print(f"Backup created: {target}")
PY
