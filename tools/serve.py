#!/usr/bin/env python3
"""本地打开站点。和线上一样，不公开 _config.yml 排除的目录和文件。"""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HIDDEN = ("/refs", "/docs", "/tools", "/AGENTS.md", "/_config.yml", "/.git")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".html": "text/html; charset=utf-8"}

    def hidden(self):
        path = self.path.split("?", 1)[0]
        if any(path == p or path.startswith(p + "/") for p in HIDDEN):
            self.send_error(404, "not published")
            return True
        return False

    def do_GET(self):
        if not self.hidden():
            super().do_GET()

    def do_HEAD(self):
        if not self.hidden():
            super().do_HEAD()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT)))
    print(f"http://127.0.0.1:{args.port}/  （docs/、tools/、refs/ 不公开）")
    server.serve_forever()


if __name__ == "__main__":
    main()
