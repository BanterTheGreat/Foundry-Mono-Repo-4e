# Throwaway class-feat layout study

Question: which structure makes long class-feat lists easiest to browse while
keeping complete rules and a consistent Heroic / Paragon / future Mystic hierarchy?

Open `feat-layout-prototype.html` directly, or run from the repository root:

```powershell
python classes/feat-layout-prototype.py
```

Then open <http://localhost:8765/?variant=A>. The Python command regenerates the
standalone HTML from local source and serves that HTML only. Stop with Ctrl+C.
Use `--build-only` to regenerate without starting a server.

- **A — Grouped reference:** complete two-column rules organized by related
  choices. Suggested starting direction for the printed book.
- **B — Comparison ledger:** alphabetical rows with separate feat, requirement,
  and full-effect columns. Makes prerequisites visible at the cost of width.
- **C — Chooser + reference:** grouped navigation index followed by alphabetical
  full rules. Useful for large lists, with extra pages and a lookup step.

Use the bottom arrows or keyboard left/right to switch layouts. Class, tier,
and variant are stored in the URL, with no persistent character state. Print /
Save PDF prints only the currently selected class, tier, and layout.

Data: all 18 Sorcerer Heroic feats, all 28 Fighter Heroic feats, and all 26
Fighter Paragon feats, read from the current local class files and Fighter JSON.
Requirements and effects are preserved; grouping is editorial navigation, not
an eligibility rule. Mystic has an explicit empty example, with no invented
feat mechanics or assumed minimum level. Sorcerer Paragon is also empty because
the local Sorcerer file contains no such entries.

The prototype embeds installed Rokkitt and Merriweather fonts when available,
uses the book's colors and page dimensions, and avoids splitting feat entries.
Browser layout approximates Typst; page counts are not production pagination.

Validation: the initial rendered version was checked across all 18 combinations
of class, tier, and layout: every source feat appeared once as a full rules entry,
and no column/body overflow was detected. The final spacing adjustment was built
successfully; the browser preview host became unavailable before it could be
visually rechecked. No Typst files were changed or book compile performed.

No design has been selected or promoted. After selection, implement the chosen
structure in Typst, validate the affected book pages, and archive this study on
a throwaway branch with a pointer from the implementation issue or commit.
Existing uncommitted book edits were left untouched.
