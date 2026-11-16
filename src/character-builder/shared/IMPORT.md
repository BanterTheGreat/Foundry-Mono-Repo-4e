# Shared character import and recovery

`CharacterImporter(store, newCharacterId)` contains the shared workflow for web and
Android. The ID factory supplies a fresh stable opaque character ID; it does not
change choice-slot, grant-instance, equipment or adjustment IDs. File selection and
presentation belong to platform adapters.

1. Call `inspect(json)` to validate the complete portable v1 format before any
   storage read or write. An unavailable result contains codec or storage diagnostics.
2. Present `incomingDetails`, `existingDetails` and `actions` from the available
   preview. Details include name, level, ID and the original saved timestamp.
3. Call `commit(preview, action)`. `IMPORT` creates a previously absent ID;
   `REPLACE` requires a collision; `COPY` changes only the character ID;
   `CANCEL` performs no storage operation and returns no receipt.

The coordinator never merges choices or normalizes timestamps. Mechanically invalid
and unresolved choices remain importable when their portable document is valid.
Copy-ID collisions fail through CREATE rather than overwriting another character.
The ID factory must return normally; storage adapters must report IO failures via
`ContractResult.Unavailable`, never throw or report success after failure.

## Store contract

`CharacterStore.save(document, mode, expected)` is an atomic operation:

- CREATE fails if the ID already exists.
- REPLACE_WITH_RECOVERY requires a non-null complete `expected` document matching
  the currently committed document. Comparison and publication must occur in the
  same transaction/critical section. A stale preview fails, even when savedAt is
  unchanged. Preserve a durable recovery copy before publishing the new document.
- Any recovery or publication failure leaves the old live document available.
  A recovery copy may remain after failed publication; that is safe and discoverable.
- Successful replacement returns a nonblank `SaveReceipt.recoveryId`.

Reads must return detached snapshots with immutable collections, so later store
edits do not change a preview or its expected document. Recovery copies do not
appear in ordinary `list()`. `listRecovery(characterId)` returns their IDs and
basic document metadata; `loadRecovery(recoveryId)` loads a snapshot. This separate
namespace avoids treating backups as ordinary playable characters. Delete removes
the live character only; recovery retention/deletion policy belongs to future
adapters and must not silently make a returned recovery ID unusable.

Use `recoveries(characterId)` for discovery and `inspectRecovery(recoveryId)` to
preview restoration. Restoration then uses the same explicit commit actions: a
replacement backs up the current character, a missing live character can be
created, and copy/cancel remain available. Restoration never consumes its backup.
Errors from discovery, loading, recovery creation and saving remain unavailable
results with their original diagnostic codes.

## Verification

`CharacterImportTest` runs in the shared common suite on JVM and Node/JS. Its failing
in-memory adapter exercises the same contract expected of the later IndexedDB and
Android file adapters: collision details, explicit decisions, preserved choices,
recovery-before-publication order, discovery/restoration, stale previews, failed
recovery/write/read operations, malformed and unsupported formats, and copy-ID
collisions. Actual platform persistence and file chooser UI remain later tickets.
