"""Shared assembly and cross-package validation for Modern 4e runtime packages (mechanics v2).

Each category compiler (ancestries, themes, feats, utilities, equipment) returns the same
deterministic asset map as ``class_runtime.build``: ``<package>/manifest.json``,
``<package>/index.json`` and ``<package>/entries-NNNN.json`` chunks.
"""

import itertools

CHUNK_SIZE = 100


def power_scope(class_ids):
    """Scope function for selectable powers: the class a power's access condition names, otherwise None."""
    def scope(entry):
        access = entry["mechanics"].get("access") or {}
        if entry["category"] == "POWER" and access.get("type") == "entry" and access["entryId"] in class_ids:
            return access["entryId"]
        return None
    return scope


def package(package_id, title, entries, revision="1", chunk_size=CHUNK_SIZE, scope=None):
    """Assemble sorted, chunked package assets from compiled runtime entries.

    `scope(entry)` may name the class an entry is selectable by. Scoped entries are grouped so each class
    fills its own chunks, and their index rows carry `classId`, letting a loader skip other classes' chunks.
    """
    scope = scope or (lambda entry: None)
    ordered = sorted(entries, key=lambda entry: (scope(entry) or "", entry["id"]))
    ids = [entry["id"] for entry in ordered]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{package_id}: duplicate entry IDs")
    assets, index, chunks = {}, [], []
    batches = []
    for _, group in itertools.groupby(ordered, key=lambda entry: scope(entry) or ""):
        group = list(group)
        batches += [group[start:start + chunk_size] for start in range(0, len(group), chunk_size)]
    for number, chunk in enumerate(batches):
        chunk_id = f"entries-{number:04d}"
        chunks.append(chunk_id)
        assets[f"{package_id}/{chunk_id}.json"] = {"id": chunk_id, "entries": chunk}
        index += [{"id": e["id"], "title": e["presentation"]["title"], "category": e["category"],
                   "chunkId": chunk_id, **({"classId": scope(e)} if scope(e) else {})} for e in chunk]
    assets[f"{package_id}/index.json"] = {"entries": index}
    assets[f"{package_id}/manifest.json"] = {"formatVersion": 2, "id": package_id, "revision": revision,
                                            "title": title, "indexes": ["index"], "chunks": chunks}
    return assets


def entries_of(assets):
    """Every compiled entry across a combined asset map."""
    return [entry for name, value in sorted(assets.items()) if "/entries" in name for entry in value["entries"]]


def referenced_ids(entry):
    """Entry IDs the runtime mechanics depend on (grants, finite choices, entry conditions)."""
    mechanics = entry["mechanics"]
    progressions = mechanics.get("progression", [])
    grants = mechanics.get("grants", []) + [grant for step in progressions for grant in step.get("grants", [])]
    refs = [key for grant in grants if grant.get("type") == "entry"
            for key in [grant["entryId"]] + grant.get("replacementEntryIds", [])]
    for choice in mechanics.get("choices", []) + [choice for step in progressions for choice in step.get("choices", [])]:
        refs += choice.get("entryIds", [])
    pending = [mechanics.get("access")] + list(mechanics.get("prerequisites", []))
    while pending:
        node = pending.pop()
        if not node:
            continue
        if node["type"] == "entry":
            refs.append(node["entryId"])
        pending += node.get("conditions", [])
    return refs


def validate_references(assets):
    """Fail when a mechanical reference is absent from the whole combined catalog."""
    entries = entries_of(assets)
    known = {entry["id"] for entry in entries}
    for entry in entries:
        for ref in referenced_ids(entry):
            if ref not in known:
                raise ValueError(f"{entry['id']}: mechanical reference {ref} is absent from the production catalog")
