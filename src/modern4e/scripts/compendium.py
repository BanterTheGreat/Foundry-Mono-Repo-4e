#!/usr/bin/env python3
"""Download, verify, search, and read the local IWS 4e compendium."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "content/compendium"
BASE = "https://iws.mx/dnd/4e_database_files/"


def payload(path):
    text = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*od\.reader\.(\w+)\((.*)\)\s*;?\s*", text, re.S)
    if not match:
        raise ValueError(f"Unsupported data wrapper: {path}")
    # Site edits include JS identifier keys, trailing commas, and \\' escapes.
    # Normalize only tokens outside strings; never evaluate downloaded code.
    token = re.compile(r'''"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b[A-Za-z_$][\w$]*(?=\s*:)|,\s*(?=[}\]])''', re.S)

    def normalize(found):
        value = found[0]
        if value.startswith('"'):
            return re.sub(r"\\(.)", lambda escaped: "'" if escaped[1] == "'" else escaped[0], value)
        if value.startswith("'"):
            inner = re.sub(r'''\\.|"''', lambda escaped: "'" if escaped[0] == "\\'" else '\\"' if escaped[0] == '"' else escaped[0], value[1:-1])
            return '"' + inner + '"'
        if value.startswith(","):
            return ""
        return json.dumps(value)

    args = json.loads("[" + token.sub(normalize, match[2]) + "]")
    if isinstance(args[-1], str) and args[-1].startswith("T>t<;"):
        raise ValueError(f"Compressed payload requires decoding: {path}")
    return args


def category(entry):
    name = re.split(r"[.\d]", entry)[0].lower()
    return {"associate": "companion", "skill": "glossary", "terrain": "trap"}.get(name, name)


def entry_ids(value):
    if "://" in value:
        value = parse_qs(urlparse(value).query).get("view", [""])[0]
    ids = value.split(",")
    if not all(re.fullmatch(r"[A-Za-z]+\d+", item) for item in ids):
        raise ValueError("Expected an entry ID or a URL with ?view=<ID>")
    return ids


def batch_path(cat, entry):
    bucket = int(re.search(r"\d{1,2}$", entry)[0]) % 20
    return DATA / cat / f"data{bucket}.js"


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"br", "p", "div", "h1", "h2", "h3", "tr", "li"}:
            self.parts.append("\n")
        elif tag in {"td", "th"}:
            self.parts.append(" | ")

    def handle_endtag(self, tag):
        if tag in {"p", "div", "h1", "h2", "h3", "tr", "li"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self):
        return "\n".join(line.strip() for line in "".join(self.parts).splitlines() if line.strip())


def download():
    DATA.mkdir(parents=True, exist_ok=True)

    def fetch(path):
        request = Request(BASE + path, headers={"Accept-Encoding": "gzip"})
        for attempt in range(3):
            try:
                with urlopen(request, timeout=60) as response:
                    data = response.read()
                    if response.headers.get("Content-Encoding") == "gzip":
                        data = gzip.decompress(data)
                break
            except HTTPError as error:
                if error.code == 404:
                    return {"path": path, "status": 404}
                if attempt == 2:
                    raise
            except OSError:
                if attempt == 2:
                    raise
        target = DATA / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"path": path, "status": 200, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    records = [fetch("catalog.js")]
    catalog = payload(DATA / "catalog.js")[-1]
    paths = ["index.js"]
    for cat in catalog:
        paths.extend([f"{cat}/_listing.js", f"{cat}/_index.js"])
        paths.extend(f"{cat}/data{i}.js" for i in range(20))
    with ThreadPoolExecutor(max_workers=8) as pool:
        records.extend(pool.map(fetch, paths))
    manifest = {"source": BASE, "downloadedAt": datetime.now(timezone.utc).isoformat(), "files": sorted(records, key=lambda r: r["path"])}
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    verify()


def verify():
    manifest = json.loads((DATA / "manifest.json").read_text())
    total = 0
    entries = 0
    batches = {}
    count_differences = []
    for record in manifest["files"]:
        if record["status"] != 200:
            continue
        path = DATA / record["path"]
        data = path.read_bytes()
        if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
            raise ValueError(f"Checksum mismatch: {path}")
        payload(path)
        total += len(data)
    catalog = payload(DATA / "catalog.js")[-1]
    for cat, expected in catalog.items():
        rows = payload(DATA / cat / "_listing.js")[-1]
        if len(rows) != expected:
            count_differences.append(f"{cat}: catalog {expected}, listing {len(rows)}")
        for row in rows:
            path = batch_path(cat, row[0])
            if path not in batches:
                batches[path] = payload(path)[-1]
            if row[0] not in batches[path]:
                raise ValueError(f"Missing entry: {row[0]}")
            entries += 1
    missing = [r["path"] for r in manifest["files"] if r["status"] != 200]
    print(f"Verified {entries} entries, {total:,} bytes; unavailable files: {missing}")
    if count_differences:
        print("Source catalog discrepancies: " + "; ".join(count_differences))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    read = commands.add_parser("read", help="Read an entry ID or original website URL")
    read.add_argument("entry")
    read.add_argument("--html", action="store_true")
    search = commands.add_parser("search", help="Search names, or searchable body text")
    search.add_argument("query")
    search.add_argument("--category")
    search.add_argument("--full", action="store_true")
    search.add_argument("--limit", type=int, default=30)
    commands.add_parser("download", help="Refresh the snapshot from IWS")
    commands.add_parser("verify", help="Check hashes, format, counts, and entry coverage")
    args = parser.parse_args()
    if args.command == "download":
        download()
    elif args.command == "verify":
        verify()
    elif args.command == "read":
        for entry in entry_ids(args.entry):
            cat = category(entry)
            html = payload(batch_path(cat, entry))[-1][entry]
            print(f"{entry} — https://iws.mx/dnd/?view={entry}")
            if args.html:
                print(html)
            else:
                reader = PlainText()
                reader.feed(html)
                print(reader.text())
    else:
        catalog = payload(DATA / "catalog.js")[-1]
        cats = [args.category] if args.category else catalog
        count = 0
        for cat in cats:
            rows = payload(DATA / cat / "_listing.js")[-1]
            index = payload(DATA / cat / "_index.js")[-1] if args.full else {}
            for row in rows:
                text = index.get(row[0], "") if args.full else row[1]
                if args.query.casefold() in text.casefold():
                    print(f"{row[0]}\t{row[1]}")
                    count += 1
                    if count >= args.limit:
                        return


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        sys.exit(str(error))
