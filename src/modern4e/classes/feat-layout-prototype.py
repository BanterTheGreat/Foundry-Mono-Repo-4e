"""THROWAWAY: three print-first feat layouts; run with python classes/feat-layout-prototype.py.

Question: does grouping, a comparison ledger, or a chooser plus reference make
class feats easier to browse across Heroic, Paragon, and future Mystic tiers?
Builds a standalone HTML next to this file, then serves only that HTML on localhost.
No production Typst files are changed. No dependencies beyond Python.
"""

import base64
import json
from pathlib import Path
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def clean(text):
    text = re.sub(r"#(?:linebreak|colbreak)\(\);?", "", text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*", "\n", text)).strip()


def sorcerer():
    source = (HERE / "sorcerer.typ").read_text(encoding="utf-8")
    source = source.split("= Heroic #className Feats", 1)[1]
    matches = list(re.finditer(r'#theme.choiceBox\("([^"]+)"\);', source))
    feats = []
    for i, match in enumerate(matches):
        body = source[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(source)]
        # The only wrapping block is Lucky Shot. Remove layout syntax, keep prose.
        body = re.sub(r"#block\(\s*\[", "", body)
        body = re.sub(r"\],\s*breakable: false,\s*\);", "", body)
        body = re.sub(r"[\]\s}]+$", "", body)
        req = re.search(r"\*Requirements: (.*?)\*", body)
        if req:
            body = body[:req.start()] + body[req.end():]
        feats.append(dict(title=match[1], requirements=req[1] if req else None, description=clean(body)))
    return feats


def fighter():
    source = (HERE / "fighter.typ").read_text(encoding="utf-8")
    source = source.split("= Heroic #className Feats", 1)[1].split("= Paragon #className Feats", 1)[0]
    feats = []
    for match in re.finditer(r"#theme.featBlock\((.*?)\n      \);", source, re.S):
        block = match[1]
        title = re.search(r'title: "([^"]+)"', block)[1]
        req = re.search(r'requirements: "([^"]+)"', block)
        body = re.search(r"content: \[(.*?)\],\s*$", block, re.S)[1]
        feats.append(dict(title=title, requirements=req[1] if req else None, description=clean(body)))
    return feats


data = {
    "Sorcerer": {"Heroic": sorcerer(), "Paragon": [], "Mystic": []},
    "Fighter": {
        "Heroic": fighter(),
        "Paragon": json.loads((ROOT / "content/feats/paragon/fighter.json").read_text(encoding="utf-8"))["feats"],
        "Mystic": [],
    },
}

fonts = ""
font_dir = Path.home() / "AppData/Local/Microsoft/Windows/Fonts"
for name, file, weight in [("Rokkitt", "Rokkitt-Regular.ttf", 400), ("Rokkitt", "Rokkitt-Bold.ttf", 700), ("Merriweather", "Merriweather-Bold.ttf", 700)]:
    path = font_dir / file
    if path.exists():
        encoded = base64.b64encode(path.read_bytes()).decode()
        fonts += f"@font-face{{font-family:{name};font-weight:{weight};src:url(data:font/ttf;base64,{encoded})}}\n"

html = (HERE / "feat-layout-prototype.template.html").read_text(encoding="utf-8")
html = html.replace("/* EMBED_FONTS */", fonts).replace("/* EMBED_DATA */", "const DATA = " + json.dumps(data, ensure_ascii=False) + ";")
output = HERE / "feat-layout-prototype.html"
output.write_text(html, encoding="utf-8")
print("Built", output, flush=True)
print("Source feat counts:", {cls: {tier: len(feats) for tier, feats in tiers.items()} for cls, tiers in data.items()}, flush=True)
if "--build-only" not in sys.argv:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(output.read_bytes())

    print("Open http://localhost:8765/?variant=A — Ctrl+C to stop", flush=True)
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
