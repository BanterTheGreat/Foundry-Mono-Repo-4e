"""Shared assembly and cross-package validation for Modern 4e runtime packages (mechanics v2).

Each category compiler (ancestries, themes, feats, utilities, equipment) returns the same
deterministic asset map as ``class_runtime.build``: ``<package>/manifest.json``,
``<package>/index.json`` and ``<package>/entries-NNNN.json`` chunks.
"""

CHUNK_SIZE = 100


def package(package_id, title, entries, revision="1", chunk_size=CHUNK_SIZE):
    """Assemble sorted, chunked package assets from compiled runtime entries."""
    ordered = sorted(entries, key=lambda entry: entry["id"])
    ids = [entry["id"] for entry in ordered]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{package_id}: duplicate entry IDs")
    assets, index, chunks = {}, [], []
    for start in range(0, len(ordered), chunk_size):
        chunk_id = f"entries-{start // chunk_size:04d}"
        chunk = ordered[start:start + chunk_size]
        chunks.append(chunk_id)
        assets[f"{package_id}/{chunk_id}.json"] = {"id": chunk_id, "entries": chunk}
        index += [{"id": e["id"], "title": e["presentation"]["title"], "category": e["category"],
                   "chunkId": chunk_id} for e in chunk]
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
    refs = [grant["entryId"] for grant in mechanics.get("grants", []) if grant.get("type") == "entry"]
    for choice in mechanics.get("choices", []):
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
