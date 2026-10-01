#!/usr/bin/env python3
"""Open the site. /refs/ is not served."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/refs" or path.startswith("/refs/"):
            self.send_error(404, "refs are local only")
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT)))
    print(f"http://127.0.0.1:{args.port}/  （/refs/ 不公开）")
    server.serve_forever()


if __name__ == "__main__":
    main()
