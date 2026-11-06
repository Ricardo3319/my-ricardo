"""在临时站点中验证完整发文命令，不改工作目录或现有文章。"""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class PublishingTest(unittest.TestCase):
    def test_publish_and_sync(self):
        with tempfile.TemporaryDirectory(prefix="ricardo-publishing-") as folder:
            site = Path(folder)
            for directory in ("css", "fonts", "img", "js", "audio", "notes", "about", "now", "log", "work", "contact", "board", "rpc-slides"):
                shutil.copytree(ROOT / directory, site / directory)
            for name in ("index.html", "404.html", "feed.xml", "sitemap.xml", "sw.js", "manifest.json", "CNAME", "_config.yml"):
                shutil.copy2(ROOT / name, site / name)
            (site / "tools").mkdir()
            for name in ("new-note.py", "check.py", "font-shards.py"):
                shutil.copy2(ROOT / "tools" / name, site / "tools" / name)
            existing = (site / "notes/rpc-scheduling/index.html").read_bytes()
            draft = site / "draft.md"
            draft.write_text('# Publish & <draft>\n\n新增文章与字库测试：龘。\n\n## Details\n\n- **one**\n- `two`\n', encoding="utf-8")
            command = [sys.executable, str(site / "tools/new-note.py")]
            result = subprocess.run(command + ["publish-test", str(draft), "--date", "2026-11-07", "--tag", "测试"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            page = (site / "notes/publish-test/index.html").read_text()
            for marker in ("data-theme", "cabin-og-cover.png", "twitter:card", "canonical", "manifest.json", "messages.js", "application/atom+xml", "Publish &amp; &lt;draft&gt;"):
                self.assertIn(marker, page)
            self.assertNotIn('<script src="../../js/games.js">', page)
            self.assertEqual((site / "notes/rpc-scheduling/index.html").read_bytes(), existing)
            catalog = json.loads((site / "notes/catalog.json").read_text())
            self.assertEqual(len(catalog), 4)
            for name in ("index.html", "notes/index.html", "feed.xml", "sitemap.xml", "sw.js"):
                self.assertIn("publish-test", (site / name).read_text())
            feed = ET.parse(site / "feed.xml")
            ns = {"a": "http://www.w3.org/2005/Atom"}
            self.assertEqual(len(feed.findall("a:entry", ns)), 4)
            self.assertEqual(feed.findtext("a:entry/a:title", namespaces=ns), "Publish & <draft>")
            self.assertEqual(len(ET.parse(site / "sitemap.xml").findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")), 12)
            spec = importlib.util.spec_from_file_location("publisher", site / "tools/new-note.py")
            publisher = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(publisher)
            tracked = ["index.html", "notes/index.html", "feed.xml", "sitemap.xml", "sw.js"]
            before = {name: (site / name).read_bytes() for name in tracked}
            publisher.sync_catalog()
            self.assertEqual(before, {name: (site / name).read_bytes() for name in tracked})
            for args in (["publish-test", str(draft)], ["../outside", str(draft)], ["invalid-date", str(draft), "--date", "not-a-date"]):
                rejected = subprocess.run(command + list(args), capture_output=True, text=True)
                self.assertNotEqual(rejected.returncode, 0)
            self.assertEqual(len(json.loads((site / "notes/catalog.json").read_text())), 4)
            self.assertEqual((site / "notes/rpc-scheduling/index.html").read_bytes(), existing)


if __name__ == "__main__":
    unittest.main()
