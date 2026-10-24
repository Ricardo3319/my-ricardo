#!/usr/bin/env python3
"""my-ricardo lightweight backend server (Python stdlib + SQLite)."""
import hmac
import json
import os
import pathlib
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
DB_PATH = DB_FILE = DATA_DIR / "ricardo.db"
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
        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, author TEXT NOT NULL, badge TEXT NOT NULL, created_at INTEGER NOT NULL)"
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


FAILED_AUTH = {}
AUTH_WINDOW_SEC = 60
AUTH_MAX_FAILS = 8

# 访客留痕（漂流瓶/打卡册）：每 IP 10 分钟最多 2 条，防刷屏。
MSG_POSTS = {}
MSG_WINDOW_SEC = 600
MSG_MAX_POSTS = 2
MSG_MAX_LEN = 60


def msg_rate_ok(ip):
    now = time.time()
    recent = [ts for ts in MSG_POSTS.get(ip, []) if now - ts < MSG_WINDOW_SEC]
    MSG_POSTS[ip] = recent
    if len(recent) >= MSG_MAX_POSTS:
        return False
    recent.append(now)
    return True


def clean_msg_text(value, limit=MSG_MAX_LEN):
    """强制纯文本：去控制字符、压平空白、限长。渲染侧另有 textContent 兜底。"""
    text = "".join(ch for ch in str(value or "") if ch == "\n" or (ord(ch) >= 32 and ord(ch) != 0x7F))
    text = " ".join(text.split())
    return text[:limit]


def merge_board_state(current, incoming):
    if isinstance(incoming, list):
        incoming = {"version": 2, "updatedAt": int(time.time() * 1000), "scratchpad": {"text": "", "updatedAt": 0, "history": []}, "tasks": incoming}
    cur_sp = current.get("scratchpad") or {"text": "", "updatedAt": 0, "history": []}
    inc_sp = incoming.get("scratchpad") or {"text": "", "updatedAt": 0, "history": []}
    merged_sp = dict(inc_sp if inc_sp.get("updatedAt", 0) >= cur_sp.get("updatedAt", 0) else cur_sp)
    hist = []
    for item in (inc_sp.get("history") or []) + (cur_sp.get("history") or []):
        if isinstance(item, str) and item.strip() and item.strip() != (merged_sp.get("text") or "").strip() and item.strip() not in hist:
            hist.append(item.strip())
    merged_sp["history"] = hist[:5]

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

    def _client_ip(self):
        fwd = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        return fwd or (self.client_address[0] if self.client_address else "unknown")

    def _is_rate_limited(self):
        ip = self._client_ip()
        now = time.time()
        recent = [ts for ts in FAILED_AUTH.get(ip, []) if now - ts < AUTH_WINDOW_SEC]
        FAILED_AUTH[ip] = recent
        return len(recent) >= AUTH_MAX_FAILS

    def _is_authed(self, record_fail=False):
        if self._is_rate_limited():
            return False
        header_key = self.headers.get("X-Passkey", "").strip()
        if not header_key or not PASSKEY:
            return False
        ok = hmac.compare_digest(header_key.encode("utf-8"), PASSKEY.encode("utf-8"))
        if not ok and record_fail:
            ip = self._client_ip()
            FAILED_AUTH.setdefault(ip, []).append(time.time())
        elif ok:
            FAILED_AUTH.pop(self._client_ip(), None)
        return ok

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
                        "scratchpad": {"text": "", "updatedAt": 0, "history": []},
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
        if parsed.path == "/api/messages":
            with get_db() as conn:
                rows = conn.execute(
                    "SELECT id, text, author, badge, created_at FROM messages ORDER BY id DESC LIMIT 50"
                ).fetchall()
            return self._send_json(200, {"messages": [dict(r) for r in rows]})
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/verify":
            if self._is_rate_limited():
                return self._send_json(429, {"ok": False, "error": "Too many attempts"})
            authed = self._is_authed(record_fail=True)
            return self._send_json(200 if authed else 401, {"ok": authed})
        if parsed.path == "/api/logs":
            if not self._is_authed(record_fail=True):
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
        if parsed.path == "/api/messages":
            if not msg_rate_ok(self._client_ip()):
                return self._send_json(429, {"ok": False, "error": "歇一会儿再写吧，10 分钟内最多留 2 条"})
            body = self._read_json()
            text = clean_msg_text(body.get("text"))
            author = clean_msg_text(body.get("author"), 12) or "路过的农夫"
            badge = str(body.get("badge") or "🌾")[:8]
            if not text:
                return self._send_json(400, {"ok": False, "error": "空便签钉不上木板"})
            with get_db() as conn:
                cur = conn.execute(
                    "INSERT INTO messages (text, author, badge, created_at) VALUES (?, ?, ?, ?)",
                    (text, author, badge, int(time.time())),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT id, text, author, badge, created_at FROM messages WHERE id = ?", (cur.lastrowid,)
                ).fetchone()
            return self._send_json(200, {"ok": True, "message": dict(row)})
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
            raw_id = qs.get("id", [None])[0]
            if raw_id is None:
                body = self._read_json()
                raw_id = body.get("id", 0)
            try:
                log_id = int(raw_id)
            except (TypeError, ValueError):
                log_id = 0
            with get_db() as conn:
                conn.execute("DELETE FROM logs WHERE id = ?", (log_id,))
                conn.commit()
            return self._send_json(200, {"ok": True})
        return self._send_json(404, {"error": "Not found"})


if __name__ == "__main__":
    init_db()
    if PASSKEY == "dev-passkey":
        print("Notice: using default dev-passkey. Set RICARDO_PASSKEY in production.")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), RicardoRequestHandler)
    print(f"Serving my-ricardo on http://127.0.0.1:{PORT}")
    server.serve_forever()
