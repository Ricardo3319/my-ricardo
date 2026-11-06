#!/usr/bin/env python3
"""V8 定向回归：临时数据库与真实 HTTP handler，不启动端口、不读生产数据。"""
import concurrent.futures
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("app", ROOT / "server/app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class Connection:
    def __init__(self, method, path, payload, auth):
        body = json.dumps(payload).encode() if payload is not None else b""
        headers = f"{method} {path} HTTP/1.0\r\nHost: localhost\r\nContent-Length: {len(body)}\r\n"
        if auth:
            headers += "X-Passkey: temporary-review-key\r\n"
        self.input = io.BytesIO(headers.encode() + b"\r\n" + body)
        self.output = io.BytesIO()

    def makefile(self, *args):
        return self.input

    def sendall(self, data):
        self.output.write(data)


class Handler(app.RicardoRequestHandler):
    def log_message(self, *args):
        pass


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ricardo-regression-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        app.ROOT_DIR = root / "public"
        app.ROOT_DIR.mkdir()
        app.DATA_DIR = root / "private"
        app.DB_PATH = app.DB_FILE = app.DATA_DIR / "ricardo.db"
        app.PASSKEY = "temporary-review-key"
        app.FAILED_AUTH.clear()
        app.init_db()

    def request(self, method, path, payload=None, auth=False):
        connection = Connection(method, path, payload, auth)
        Handler(connection, ("127.0.0.1", 12345), object())
        head, body = connection.output.getvalue().split(b"\r\n\r\n", 1)
        status = int(head.split(b" ")[1])
        return status, json.loads(body) if b"application/json" in head and body else body

    def test_private_paths_get_and_head(self):
        for rel in ("server/data/ricardo.db", "server/data/backups/old.db", ".env", ".git/config", "server/app.py"):
            target = app.ROOT_DIR / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("private fixture")
            for method in ("GET", "HEAD"):
                with self.subTest(path=rel, method=method):
                    self.assertEqual(self.request(method, "/" + rel)[0], 404)
        for path in ("/server/data/", "/%73erver/data/ricardo.db", "/css/"):
            self.assertEqual(self.request("GET", path)[0], 404)
        (app.ROOT_DIR / "index.html").write_text("home")
        (app.ROOT_DIR / "notes").mkdir()
        (app.ROOT_DIR / "notes/index.html").write_text("notes")
        (app.ROOT_DIR / "notes/private.db").symlink_to(app.DB_PATH)
        self.assertEqual(self.request("GET", "/")[0], 200)
        self.assertEqual(self.request("HEAD", "/notes/")[0], 200)
        self.assertEqual(self.request("GET", "/notes/private.db")[0], 404)

    def test_delete_stale_device_and_undo(self):
        original = {"id": "a", "title": "secret", "private": True, "updatedAt": 100}
        put = lambda tasks: self.request("PUT", "/api/board", {"tasks": tasks}, auth=True)
        self.assertEqual(put([original])[0], 200)
        self.assertEqual(self.request("GET", "/api/board")[1]["data"]["tasks"], [])
        self.assertEqual(put([{"id": "a", "deleted": True, "updatedAt": 200}])[0], 200)
        put([original])
        tasks = self.request("GET", "/api/board", auth=True)[1]["data"]["tasks"]
        self.assertEqual(tasks, [{"id": "a", "deleted": True, "updatedAt": 200}])
        self.assertEqual(self.request("GET", "/api/board")[1]["data"]["tasks"], [])
        put([{**original, "updatedAt": 300}])
        self.assertEqual(self.request("GET", "/api/board", auth=True)[1]["data"]["tasks"][0]["title"], "secret")

    def test_concurrent_devices_keep_both_updates(self):
        start = threading.Barrier(6)
        original_load = app.load_board_state

        def slow_read(conn=None):
            state = original_load(conn)
            time.sleep(0.02)
            return state

        def send(n):
            start.wait(timeout=5)
            return self.request("PUT", "/api/board", {"tasks": [{"id": str(n), "title": str(n), "updatedAt": n + 1}]}, auth=True)[0]

        with patch.object(app, "load_board_state", slow_read), concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            self.assertEqual(list(pool.map(send, range(6))), [200] * 6)
        self.assertEqual({t["id"] for t in app.load_board_state()["tasks"]}, {str(n) for n in range(6)})

    def test_summary_and_cursor_pagination(self):
        with app.get_db() as conn:
            for n in range(24):
                conn.execute("INSERT INTO logs(date, text, image, created_at) VALUES (?, ?, ?, ?)", ("2026-11-06", str(n), "data:image/jpeg;base64,large-fixture", n))
        status, summary = self.request("GET", "/api/summary")
        self.assertEqual(status, 200)
        self.assertEqual([r["id"] for r in summary["logs"]], [24, 23, 22])
        self.assertTrue(all("image" not in row for row in summary["logs"]))
        _, first = self.request("GET", "/api/logs")
        self.assertEqual(len(first["logs"]), 10)
        with app.get_db() as conn:
            conn.execute("INSERT INTO logs(date,text,created_at) VALUES ('2026-11-06','new',25)")
        _, second = self.request("GET", "/api/logs?before=" + str(first["nextBefore"]))
        _, last = self.request("GET", "/api/logs?before=" + str(second["nextBefore"]))
        self.assertEqual([r["id"] for page in (first, second, last) for r in page["logs"]], list(range(24, 0, -1)))
        self.assertIsNone(last["nextBefore"])
        self.assertEqual(self.request("GET", "/api/logs?before=invalid")[0], 400)

    def test_missing_and_default_passkeys_refuse_startup(self):
        for key in ("", "  ", "dev-passkey", "please-change-me"):
            with self.subTest(key=key):
                env = dict(os.environ, RICARDO_PASSKEY=key, RICARDO_DATA_DIR=str(app.DATA_DIR))
                result = subprocess.run([os.sys.executable, "-B", str(ROOT / "server/app.py")], env=env, capture_output=True, timeout=5)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"Set RICARDO_PASSKEY", result.stderr)


if __name__ == "__main__":
    unittest.main()
