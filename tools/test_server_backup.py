"""用临时 SQLite WAL 数据库验证生产备份脚本及恢复；不连接部署服务器。"""
from pathlib import Path
import os
import sqlite3
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "server/backup.sh"


class BackupTest(unittest.TestCase):
    def test_live_wal_snapshot_and_restore(self):
        with tempfile.TemporaryDirectory(prefix="ricardo-db-backup-") as folder:
            data = Path(folder)
            conn = sqlite3.connect(data / "ricardo.db")
            self.addCleanup(conn.close)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("CREATE TABLE records (text TEXT)")
            conn.execute("INSERT INTO records VALUES ('committed')")
            conn.commit()
            conn.execute("INSERT INTO records VALUES ('uncommitted')")
            backups = data / "backups"
            backups.mkdir()
            old = backups / "ricardo_old.db"
            old.write_bytes(b"expired backup")
            stale = time.time() - 31 * 86400
            os.utime(old, (stale, stale))
            result = subprocess.run(["sh", str(SCRIPT)], env={**os.environ, "RICARDO_DATA_DIR": str(data)}, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            snapshots = list(backups.glob("ricardo_*.db"))
            self.assertEqual(len(snapshots), 1)
            self.assertFalse(old.exists())
            self.assertEqual(snapshots[0].stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(backups.glob("*.tmp")), [])
            with sqlite3.connect(snapshots[0]) as snapshot, sqlite3.connect(data / "restored.db") as restored:
                snapshot.backup(restored)
                self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(restored.execute("SELECT text FROM records").fetchall(), [("committed",)])
            conn.rollback()
            self.assertEqual(conn.execute("SELECT text FROM records").fetchall(), [("committed",)])
            conn.close()

    def test_missing_source_is_failure(self):
        with tempfile.TemporaryDirectory(prefix="ricardo-no-db-") as folder:
            result = subprocess.run(["sh", str(SCRIPT)], env={**os.environ, "RICARDO_DATA_DIR": folder}, capture_output=True, text=True, timeout=20)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(folder) / "ricardo.db").exists())


if __name__ == "__main__":
    unittest.main()
