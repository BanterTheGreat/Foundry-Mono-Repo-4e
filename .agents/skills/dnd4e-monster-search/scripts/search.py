#!/usr/bin/env python3
"""Search local monster metadata, prioritizing Monster Manual 3 and Monster Vault."""

import argparse
import importlib.util
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", nargs="?", default="")
    parser.add_argument("--min-level", type=int, default=0)
    parser.add_argument("--max-level", type=int, default=40)
    parser.add_argument("--role")
    parser.add_argument("--rank")
    parser.add_argument("--source", help="Exact source code, e.g. MM3, MV, MM2")
    parser.add_argument("--preferred-only", action="store_true")
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    if args.min_level > args.max_level or args.limit < 1:
        parser.error("Require min-level <= max-level and limit >= 1")

    root = Path(__file__).resolve().parents[4]
    spec = importlib.util.spec_from_file_location(
        "local_compendium", root / "src/modern4e/scripts/compendium.py"
    )
    compendium = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compendium)
    listing = compendium.payload(compendium.DATA / "monster/_listing.js")
    rows = [dict(zip(listing[-2], row)) for row in listing[-1]]
    matches = []
    for row in rows:
        sources = {source.strip() for source in row["SourceBook"].split(",")}
        preferred = bool(sources & {"MM3", "MV"})
        level_text = row["Level"]
        if not re.fullmatch(r"\d+", level_text):
            continue
        level = int(level_text)
        if not args.min_level <= level <= args.max_level:
            continue
        if args.term.casefold() not in (row["Name"] + " " + row["CreatureType"]).casefold():
            continue
        if args.role and args.role.casefold() != row["CombatRole"].casefold():
            continue
        if args.rank and args.rank.casefold() != row["GroupRole"].casefold():
            continue
        if args.source and args.source.casefold() not in {s.casefold() for s in sources}:
            continue
        if args.preferred_only and not preferred:
            continue
        matches.append((not preferred, level, row["Name"], row))

    matches.sort(key=lambda match: match[:3])
    print(f"{len(matches)} matches; showing {min(len(matches), args.limit)} (MM3/MV first)")
    for conversion, level, name, row in matches[:args.limit]:
        status = "recalculate" if conversion else "preferred"
        print(f"{row['ID']}\t{name}\tLevel {level} {row['GroupRole']} {row['CombatRole']}"
              f"\t{row['SourceBook']}\t{status}\thttps://iws.mx/dnd/?view={row['ID']}")


if __name__ == "__main__":
    main()
