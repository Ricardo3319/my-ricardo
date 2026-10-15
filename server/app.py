#!/usr/bin/env python3
"""my-ricardo lightweight backend server (Python stdlib + SQLite)."""
import json
import os
import pathlib
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "ricardo.db"
PASSKEY = os.environ.get("RICARDO_PASSKEY", "dev-passkey")
PORT = int(os.environ.get("PORT", "8000"))


def get_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)"
        )
        conn.commit()


def load_board_state():
    with get_db() as conn:
        row = conn.execute("SELECT value FROM kv_store WHERE key = 'board'").fetchone()
        if row:
            try:
                data = json.loads(row["value"])
                if isinstance(data, list):
                    return {"version": 2, "updatedAt": 0, "scratchpad": {"text": "", "updatedAt": 0}, "tasks": data}
                return data
            except Exception:
                pass
    return {"version": 2, "updatedAt": 0, "scratchpad": {"text": "", "updatedAt": 0}, "tasks": []}


def merge_board_state(current, incoming):
    if isinstance(incoming, list):
        incoming = {"version": 2, "updatedAt": int(time.time() * 1000), "scratchpad": {"text": "", "updatedAt": 0}, "tasks": incoming}
    cur_sp = current.get("scratchpad") or {"text": "", "updatedAt": 0}
    inc_sp = incoming.get("scratchpad") or {"text": "", "updatedAt": 0}
    merged_sp = inc_sp if inc_sp.get("updatedAt", 0) >= cur_sp.get("updatedAt", 0) else cur_sp

    task_map = {}
    for t in current.get("tasks", []):
        if isinstance(t, dict) and t.get("id"):
            task_map[t["id"]] = t
    for t in incoming.get("tasks", []):
        if isinstance(t, dict) and t.get("id"):
            tid = t["id"]
            if tid not in task_map or t.get("updatedAt", 0) >= task_map[tid].get("updatedAt", 0):
                task_map[tid] = t
    merged_tasks = [t for t in task_map.values() if not t.get("deleted")]
    merged_tasks.sort(key=lambda x: x.get("updatedAt", 0), reverse=True)
    now_ms = int(time.time() * 1000)
    merged = {
        "version": 2,
        "updatedAt": now_ms,
        "scratchpad": merged_sp,
        "tasks": merged_tasks,
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES ('board', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (json.dumps(merged, ensure_ascii=False), now_ms),
        )
        conn.commit()
    return merged


class RicardoRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def _is_authed(self):
        header_key = self.headers.get("X-Passkey", "").strip()
        return bool(header_key and header_key == PASSKEY)

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1024 * 1024:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/board":
            state = load_board_state()
            if self._is_authed():
                return self._send_json(200, {"authed": True, "data": state})
            public_tasks = [t for t in state.get("tasks", []) if not t.get("private")]
            return self._send_json(
                200,
                {
                    "authed": False,
                    "data": {
                        "version": 2,
                        "updatedAt": state.get("updatedAt", 0),
                        "scratchpad": {"text": "", "updatedAt": 0},
                        "tasks": public_tasks,
                    },
                },
            )
        if parsed.path == "/api/logs":
            with get_db() as conn:
                now_row = conn.execute("SELECT value FROM kv_store WHERE key = 'now_status'").fetchone()
                rows = conn.execute("SELECT id, date, text, created_at FROM logs ORDER BY id DESC LIMIT 100").fetchall()
            return self._send_json(
                200,
                {
                    "nowStatus": now_row["value"] if now_row else "",
                    "logs": [dict(r) for r in rows],
                },
            )
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/verify":
            return self._send_json(200 if self._is_authed() else 401, {"ok": self._is_authed()})
        if parsed.path == "/api/logs":
            if not self._is_authed():
                return self._send_json(401, {"error": "Unauthorized"})
            body = self._read_json()
            now_ms = int(time.time() * 1000)
            with get_db() as conn:
                if "nowStatus" in body and isinstance(body["nowStatus"], str):
                    conn.execute(
                        "INSERT INTO kv_store (key, value, updated_at) VALUES ('now_status', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                        (body["nowStatus"].strip(), now_ms),
                    )
                if body.get("text"):
                    date_str = body.get("date") or time.strftime("%Y-%m-%d")
                    conn.execute(
                        "INSERT INTO logs (date, text, created_at) VALUES (?, ?, ?)",
                        (date_str, str(body["text"]).strip(), now_ms),
                    )
                conn.commit()
            return self._send_json(200, {"ok": True})
        return self._send_json(404, {"error": "Not found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/board":
            if not self._is_authed():
                return self._send_json(401, {"error": "Unauthorized"})
            incoming = self._read_json()
            merged = merge_board_state(load_board_state(), incoming)
            return self._send_json(200, {"ok": True, "data": merged})
        return self._send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/logs":
            if not self._is_authed():
                return self._send_json(401, {"error": "Unauthorized"})
            qs = parse_qs(parsed.query)
            log_id = int(qs.get("id", ["0"])[0])
            with get_db() as conn:
                conn.execute("DELETE FROM logs WHERE id = ?", (log_id,))
                conn.commit()
            return self._send_json(200, {"ok": True})
        return self._send_json(404, {"error": "Not found"})


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), RicardoRequestHandler)
    print(f"Serving my-ricardo on http://127.0.0.1:{PORT}")
    server.serve_forever()
