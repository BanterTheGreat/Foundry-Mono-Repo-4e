---
name: zeitgeist
description: Consult the user's local ZEITGEIST 4e adventure path books for adventure, setting, character, and campaign information.
---

# ZEITGEIST reference books

## Choose the book

Choose the most relevant book from the question and briefly state that choice;
proceed with the lookup without asking the user to select a book. Honor an
explicit book selection.

- **Players Guide** — player-facing rules and player-safe lore. Start here for
  character options, equipment, and rules for the constables.
- **Campaign Guide** — GM-facing setting information and an overview of the
  entire campaign.
- **Acts 1, 2, and 3** — the campaign story. Choose the relevant act for adventure
  events, encounters, and story characters.
- **Act 1** also includes the Players Guide and Campaign Guide. Use it as a
  wildcard when unsure which of those two guides contains the answer.

Start with the chosen book; consult another relevant book if needed to resolve
the question, respecting any source limits the user specifies.

## Locate the books

On **Windows**, the book directory is:

```text
C:\Users\Imre\Documents\Tabletop\4E\Zeitgeist 4e
```

This path is Windows-only. On **Mac**, first ask the user where the books are
stored; wait for that location before attempting a lookup. Use their answer
for the current task and add the confirmed Mac location to this skill for
future use, preserving the Windows location. On other platforms, or if the
configured directory is missing, ask for the book directory rather than
guessing a translated path.

Once the location and book are known, list the directory to resolve the actual
filename; the choices above are book labels, not guaranteed filenames. If a
choice matches several files, ask which edition or file to use.

## Read and answer

Use the selected local book as the source. For PDFs, follow the available PDF
skill when extracting text or inspecting pages. Cite the book and printed page
number when available; distinguish PDF page numbers when they differ.

When adapting material into Modern 4e, also follow the
[modern4e skill](../modern4e/SKILL.md) and distinguish the published adventure
material from local rulebook changes.
