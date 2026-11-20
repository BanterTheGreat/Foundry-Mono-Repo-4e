"""Compile validated Zeitgeist theme authoring into the mechanics-v2 runtime package.

Themes, their level benefits (features) and their powers are emitted as one package,
``modern4e.themes``. Explicit grants compile to engine grants; authored constructs the
closed mechanics vocabulary cannot express (Gunsmith ``modifications``) stay in
``sharedData`` and are reported through ``mechanics.unsupported`` and coverage limitations.
"""
import copy
import importlib.util
import sys
from pathlib import Path

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
SPEC = importlib.util.spec_from_file_location("theme_authoring", SCRIPTS / "theme_content.py")
authoring = importlib.util.module_from_spec(SPEC)
sys.path.insert(0, str(SCRIPTS))
try:
    SPEC.loader.exec_module(authoring)
finally:
    sys.path.remove(str(SCRIPTS))

PACKAGE = "modern4e.themes"
CATEGORIES = {"modern4e.theme.": "THEME", "modern4e.feature.": "FEATURE", "modern4e.power.": "POWER"}


def category_of(entry_id):
    """Category from the validator-enforced identity prefix (loader entries carry no category)."""
    for prefix, category in CATEGORIES.items():
        if entry_id.startswith(prefix):
            return category
    raise ValueError(f"{entry_id}: not a theme, feature or power identity")


def load(content=None):
    """Strictly load and validate a theme catalog file (default: the authoritative one)."""
    path = Path(content) if content is not None else authoring.CONTENT
    return authoring.validate(authoring.shared.shared.load_json(path))


def compile_theme_entry(entry):
    """Compile one authored entry; keep unsupported authored constructs visible, never dropped."""
    source = copy.deepcopy(entry)
    runtime = class_runtime.compile_entry({**source, "category": category_of(source["id"])})
    runtime["sharedData"] = source
    mechanics = runtime["mechanics"]
    notes = []
    if source.get("modifications"):
        notes.append(
            f"Theme modification options ({len(source['modifications'])} feature IDs) are not an automatic "
            "grant or a finite entry choice: how many may be selected and when is defined only by "
            "benefit prose, so selection is unsupported; the list is preserved in shared data.")
    if source.get("choices") and runtime["category"] == "POWER":
        notes.append("Power choices are not compiled; they are preserved in shared data.")
    mechanics["unsupported"] += notes
    runtime["coverage"] = runtime_common.coverage(runtime["coverage"]["limitations"] + notes)
    return runtime


def build(content=None):
    """Return the deterministic asset map for the single ``modern4e.themes`` package."""
    entries = [compile_theme_entry(entry) for _, entry in sorted(load(content).items())]
    return runtime_common.package(PACKAGE, "Modern 4e shared themes", entries, revision="1")
