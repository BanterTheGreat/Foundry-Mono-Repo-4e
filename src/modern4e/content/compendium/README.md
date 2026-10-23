# IWS D&D 4e compendium snapshot

Source: <https://iws.mx/dnd/>, data under
<https://iws.mx/dnd/4e_database_files/>.

This directory preserves the site's data files after HTTP decompression. The
snapshot contains published 4e source material, separate from this rulebook's
local adaptations. Original publication credits remain inside each entry.
The viewer project's software license does not establish a license for the
underlying game content.

The source catalog understates the current listings: feats list 3,272 entries
against 3,261 in the catalog, and glossary lists 545 against 536. All 25,626
listed entries are present. `poison/data0.js` returns 404 on the source site;
no listed entry requires that batch.

`manifest.json` records retrieval time, byte sizes, SHA-256 hashes, and any 404s.
Read or search offline from the repository root:

```bash
python3 scripts/compendium.py read 'https://iws.mx/dnd/?view=glossary322'
python3 scripts/compendium.py search 'Aid Another'
python3 scripts/compendium.py verify
```

Refresh with `python3 scripts/compendium.py download`. This requires network access
and replaces the snapshot files and manifest. The data is not imported by Typst.
