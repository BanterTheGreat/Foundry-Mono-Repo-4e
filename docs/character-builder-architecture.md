# 4e Character Builder Architecture

Status: agreed design; not yet implemented.

This document records the architecture agreed in the character-builder design discussion. It preserves the decisions for future implementation; it is not an implementation checklist.

Visual reference: [Architecture, content overrides, and character sharing](../outputs/character-builder-architecture.html).

## Purpose and scope

Build a D&D 4e character builder with a PC web application and a native Android application. The two applications have separate interfaces and share their rules, character model, content interpretation, validation, and portable file format.

Both applications work offline after their application resources and content are available locally. Initially there is no backend. The web application can be served by static hosting such as GitHub Pages.

The product is purely a character builder. Session state such as current HP, expended powers, and conditions is outside the scope.

The progression model accommodates levels 1–30, multiclassing, paragon paths, epic destinies, themes, backgrounds, and equipment. Implementation can start with a small set of classes. Hybrids are out of scope.

## Technology and sharing strategy

| Area | Decision |
| --- | --- |
| PC interface | React and TypeScript, designed for desktop browsers |
| Android interface | Kotlin and Jetpack Compose, designed separately for Android |
| Shared core | Kotlin Multiplatform, compiled for Android and JavaScript |
| Content packages | Identical generated JSON packages bundled with both apps |
| Web character persistence | IndexedDB behind a storage adapter |
| Android character persistence | Private JSON files behind a storage adapter |
| Character exchange | One portable JSON format, encoded and decoded by shared code |
| Server | None initially; static web hosting only |

Kotlin/JS exposes a small interface with plain data results to the web application. Android calls the shared Kotlin implementation directly. Shared code runs locally in each application; it is not a remote service.

The interfaces own presentation, navigation, and interaction. They do not implement independent prerequisite checks, progression rules, calculations, or content override behavior.

Kotlin documents this logic-sharing approach in its [Kotlin/JavaScript overview](https://kotlinlang.org/docs/js-overview.html).

## Shared core modules

| Module | Responsibility |
| --- | --- |
| Character model | Identity, selections by level, retraining, equipment, enabled packages, manual adjustments |
| Content catalog and resolver | Search entries, apply overrides, track provenance, identify unavailable content |
| Rules engine | Resolve grants and choices, calculate statistics, evaluate prerequisites and stacking |
| Validation | Report invalid choices, missing selections, unresolved content, and incomplete automation |
| Builder operations | Apply edits consistently, manage progression, preview package changes |
| Character file codec | Encode/decode JSON, preserve unresolved selections, detect changed content |
| Import handling | Detect matching character IDs and support replacement or copying |

The rules engine receives character data and resolved content. It does not perform network, filesystem, or browser-storage operations. Its results include calculation explanations and diagnostic information, not just totals.

Exact method signatures and physical module layout remain implementation details.

## Storage interfaces and platform adapters

Content access and character persistence are separate responsibilities.

| Interface | Contract |
| --- | --- |
| `ContentSource` | List package manifests and load package data |
| `CharacterStore` | List, load, save, and delete characters; preserve a recovery copy when replacing |
| File exchange adapter | Receive imported files and deliver exported files using platform facilities |

The shared content catalog sits above `ContentSource` and owns searching, resolution, and override behavior. The application and rules engine do not depend on the physical storage format or platform APIs.

Initially, the web content adapter reads bundled static JSON assets and the Android content adapter reads bundled app assets. Character storage uses IndexedDB on the web and private JSON files on Android, with safe file replacement for writes.

Both implementations use the same character document format. A later change to SQLite or another persistence mechanism should replace the relevant adapter without changing character calculations or UI behavior.

Storage errors must be surfaced explicitly. An interface must not indicate that a character was saved when persistence failed.

## Content production

The existing offline compendium snapshot remains source material:

- `src/modern4e/content/compendium/` contains JSONP data files, metadata indexes, searchable text, and HTML descriptions.
- `src/modern4e/scripts/compendium.py` already parses the JSON arguments without executing JavaScript.

A build-time conversion pipeline will extract and normalize this data, preserve IDs and descriptions, combine it with separately authored mechanical definitions, validate the result, and produce application packages.

Generated packages contain manifests, metadata/search indexes, and entry chunks. Metadata used for browsing can load separately from larger descriptions. The same generated files ship in both applications. JSON storage is sufficient as the initial design; SQLite is not a prerequisite.

Each entry distinguishes:

- Identity: stable entry ID and category.
- Presentation: title, description, publication information, and internal references.
- Mechanics: prerequisites, grants, choices, modifiers, and progression data.
- Automation coverage: supported, partial, or unimplemented mechanics.

HTML descriptions can be retained. Android may use a controlled WebView to display descriptions while its builder screens remain native.

## Packages and overrides

The developer authors secondary content packages. Standard content and supported custom packages ship with both applications initially. User package-file import is deferred.

Each package has a stable ID, revision, declared dependencies, and entries. Each character records its own ordered list of enabled packages. Standard 4e and Modern 4e characters can coexist in the same application.

Resolution starts with standard content and applies enabled packages in order. The last definition of an entry ID wins. Initially an override replaces the whole entry; fields are not automatically merged across definitions.

Overrides can replace classes, subclasses, powers, class features, and other entries by ID. Packages describe supported mechanics using a fixed vocabulary, such as granting a feature, offering a choice, adding a typed modifier, or setting class progression values.

Packages do not contain executable extensions or redefine deep engine rules. A new kind of mechanic requires an engine update. Until implemented, the entry can remain available with explicit incomplete-automation status.

Resolved entries retain their supplying package. Saved selections retain their entry ID, last-known title, supplying package ID, and a fingerprint of the definition last acknowledged by the user.

### Changed content

Existing characters use current installed definitions. If selected entries have changed, notify the user and allow them to continue. Preserve their choices, recalculate, and report any invalid or unresolved selections.

There is no historical content pinning or automatic character migration workflow. Fingerprints and last-seen revisions exist to detect changes, not to retain old rules. After acknowledgment, the saved comparison baseline can advance.

### Missing custom content

If the expected custom package or entry is unavailable:

- Show the selection's saved title with a warning.
- Prevent opening its entry details.
- Preserve the selection through saving and re-export.
- Mark dependent calculations and validation as unavailable.
- Allow editing unrelated portions where the required rules are available.

Do not silently substitute a standard entry when the expected custom override is missing, and do not treat missing mechanics as providing zero benefits.

### Deliberate package changes

Users can change an existing character's enabled packages. Preview affected selections, then resolve against the new package order and recalculate. Preserve selections by ID where possible and report invalid or unresolved choices.

A deliberate package switch may adopt another package's definition. This differs from an unexpectedly missing required package.

## Character document and progression

The portable document records player decisions. Calculated totals are derived from those decisions and current resolved content.

| Section | Contents |
| --- | --- |
| File metadata | Format version, stable character ID, saved timestamp |
| Identity | Name and descriptive information |
| Content configuration | Ordered package IDs and last-seen revisions |
| Progression | Starting choices, choices by level, replacements, and retraining |
| Selected entries | IDs, saved titles, supplying packages, definition fingerprints |
| Equipment | Selected items and relevant configuration |
| Manual adjustments | Target, operation, value, and bonus type where applicable |

Choices have stable choice-slot identifiers so repeated selections and multiple grants can be distinguished. Progression history is separate from content-version history.

Higher-level characters can be created directly by filling their level-specific choices. Multiclass feats and power replacements influence this model; hybrid rules do not.

Character files contain neither compendium content nor executable code. A receiving application needs the relevant bundled packages to resolve selections fully.

## Validation and manual adjustments

The shared engine returns derived values and their contributors, granted features and powers, available choices and eligibility, selection-specific diagnostics, missing dependencies, and automation coverage.

The builder distinguishes:

1. Unresolved content: required definitions are unavailable.
2. Incomplete automation: definitions exist, but some mechanics or prerequisites cannot be evaluated.
3. Invalid selections: available rules establish that a choice is invalid.

All three states permit saving and exporting. Normal selection screens offer eligible choices by default, with an explicit way to select an otherwise ineligible entry. Existing choices are not silently removed after an update.

Manual adjustments use supported modifier operations and stacking rules. Their calculation-breakdown label is **Manual Adjustment**. A reason is not required. They are saved in the portable character document and do not make unsupported mechanics count as fully validated.

## Import, export, and compatibility

PC and Android exchange the same character JSON files. There is no automatic synchronization or merging.

If an imported character ID already exists locally, offer replacement or importing as a new copy. Present basic character details and saved timestamps to support that decision. Replacing preserves a local recovery copy.

The web application uses file selection and downloads. Android uses platform file handling to open and export character files.

The character format has its own version, separate from content revisions. An unsupported format must produce a clear message without overwriting existing data. Omitting content migration workflows does not justify interpreting incompatible file formats as valid.

## Verification strategy

The central acceptance condition is equivalent results from the same character and content on Android and the web.

- Run shared engine fixtures on JVM and JavaScript targets.
- Verify character JSON round trips, including unresolved selections and manual adjustments.
- Cover package ordering, changed definitions, missing custom entries, and deliberate package switches.
- Cover typed-bonus stacking, progression, retraining, and multiclass choices.
- Verify storage adapters against a shared behavioral contract, including failure handling.
- Test each UI separately for editing, persistence, and file exchange.

## Initial proof of architecture

The proposed first implementation slice loads standard content plus one override, builds a character through the shared core, exercises level progression and a manual adjustment, and exchanges the character JSON between web and Android.

This is a suggested validation milestone, not an implemented feature or a tracked issue list. Track implementation work through GitHub Issues under the repository conventions.

## Deferred scope

- Hybrids.
- Play companion and session-state tracking.
- Backend services, accounts, and cloud synchronization.
- Shareable character links.
- User-imported content packages and an in-app content editor.
- Foundry export and formatted PDF output.
- Historical rules versions and automated content migration workflows.

Dedicated export adapters remain an extension point. Future work must preserve the separation between interfaces, shared rules, portable data, and platform storage.
