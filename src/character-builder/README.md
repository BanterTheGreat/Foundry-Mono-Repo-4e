# Modern 4e Character Builder

Foundation for issue #4, shared contracts for issue #5 and portable character codec for issue #6. This standalone project has no Foundry manifest and must never be deployed to Foundry. Shared character/content contracts and validated portable JSON exchange are implemented. Character creation, rules execution, persistence adapters, production content packages and offline provisioning are not implemented.

## Layout and boundaries

- `shared/`: Kotlin Multiplatform library with common implementation/tests, JVM test target, Android library and a small Kotlin/JS adapter. No platform IO or UI in common code.
- `web/`: React/TypeScript desktop shell. Imports the generated ES module and TypeScript declarations, not a handwritten substitute.
- `android/`: native Compose application calling common Kotlin directly.
- Root Gradle wrapper/settings: standalone build; not part of the Foundry tooling.

The smoke fixture remains an engineering check. Shared contracts are defined in `shared/src/commonMain/kotlin/dev/modern4e/builder/`; checked-in JSON goldens live in `shared/fixtures/`. The implementation baseline is Modern 4e abilities and proficiencies only.

## Toolchains

Pinned Gradle 8.11.1 (wrapper with distribution SHA-256), Kotlin/Compose compiler 2.1.21, Android Gradle Plugin 8.7.3. Use JDK 21, Node 24.16.0/npm 11.13.0 and Android SDK platform 34 plus build-tools 34.0.0. Android Studio is optional. Accept SDK licenses and set `ANDROID_HOME` to your SDK directory (or configure an ignored `local.properties`). Gradle downloads dependencies on the first build; network access is required for setup. npm dependency versions are exact with a committed lockfile. Kotlin/JS uses its own downloaded Node 22.14.0 and committed `kotlin-js-store/yarn.lock`; the web tooling uses the Node version in `.nvmrc`.

## Build and test

Build-time package generation and validation live in [content/README.md](content/README.md). The checked-in representative assets use existing v1 contracts unchanged and are tested on JVM/JS. Full compendium extraction remains explicitly unimplemented automation; the authored proof is partial Modern 4e content.

From this directory in PowerShell:

```powershell
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
.\gradlew.bat :android:assembleDebug :android:assembleDebugAndroidTest
```

On Linux/macOS use `bash ./gradlew` in place of `.\gradlew.bat`. The Android SDK must be configured even for shared-only tasks because Android projects are configured together. The JS distribution must be built before web commands; rerun its Gradle task after editing shared code. Generated files live in `shared/build/dist/js/productionLibrary/` and are ignored. TypeScript resolves the generated declarations, and Vite consumes the matching `.mjs` module directly.

Start the web shell with `npm run dev --prefix web` after generating the shared distribution. The debug APK is `android/build/outputs/apk/debug/android-debug.apk`; install with `adb install -r <path>` or Android Studio. This is a local debug artifact, not a release/store build.

## Runtime tests

Start one Android API 34 emulator (or connect a device with API 26+) and run:

```powershell
.\gradlew.bat :android:connectedDebugAndroidTest
```

The instrumentation test launches the real activity and checks both shared fixture fields. CI uses an API 34 x86_64 emulator on Linux with KVM. An APK compilation or JVM test alone does not prove this UI check passed.

Shared tests check identical stable results and independent calls on JVM and JS. Web tests consume the actual compiled Kotlin module, verify a plain serializable JS object, independent results, and server-rendered shell output. No mocked Kotlin boundary is used.

## Validation recorded for the foundation

Local Windows validation on 2026-11-16 with JDK 21.0.5, Node 24.16.0 and the installed API 34 SDK:

- Clean Gradle output rebuild: `clean :shared:clean :android:clean :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution :android:assembleDebug :android:assembleDebugAndroidTest :android:connectedDebugAndroidTest` succeeded. Common fixture: 2 JVM tests and 2 JS tests; real Compose UI: 1 test on the existing API 34 Pixel 3a emulator.
- `npm ci --prefix web`: succeeded; audit reported 0 vulnerabilities in the web dependency tree.
- `npm test --prefix web`: 3 passed against the generated Kotlin distribution.
- `npm run build --prefix web`: TypeScript and production bundle succeeded.
- Repository deployment-exclusion test passed. Broader root `npm test`: 10 passed, 1 unrelated existing failure in `scripts/test/foundry-test-harness.test.mjs` (cleanup fixture lacks `game.folders`); no Foundry code was changed.

CI has been added but has not been run on GitHub. Local verification rebuilt from clean generated outputs, using existing download caches; a separate fresh clone was not tested. Browser visual review is still manual. Kotlin 2.1 tooling emits configuration-time npm resolution warnings, and generated Kotlin source maps can report missing source files in Vitest; these do not fail the tests/build. Android packages the Compose native graphics library without stripping when an NDK is absent; no NDK is required for this shell.

## Version 1 contracts

`CharacterDocument` stores player decisions, not derived totals: identity, ordered package revisions, main ability and direct point allocation, level decisions (1?30), sourced proficiency slots, advancements, entry choices, targeted progression/retraining replacements, equipment instances and typed manual adjustments. Each entry choice has its own persistent `instanceId`, which child grants use as their source. Baseline creation/background sources use stable reserved IDs. Source-instance IDs are persistent opaque IDs owned by the granting occurrence; `(sourceInstanceId, choiceId, ordinal)` identifies one choice across saves. Repeated grants must receive different source-instance IDs. Replacements point to the exact old slot and preserve a new slot. A saved entry keeps its ID, saved title, supplier package and acknowledged fingerprint even if unavailable.

The active class reference assigns 4 main-ability points and 5 non-main points, normally at most 2 each, with the optional ?1 tradeoff. The fixture uses this current baseline, not the stale skill summary's 6-point allocation. Proficiency choices include background environment/upbringing and two free creation slots. Skills use the current 16 Modern 4e identities and default mappings; individual checks may use the GM-selected ability. These contracts record decisions; allocation legality, advancement scheduling and +5 proficiency calculations await the engine. Levels through 30 can be represented without claiming those rules are fully automated.

`PackageManifest` lists dependencies (required revision), index IDs and chunk IDs. `ContentIndex` supplies browse metadata; `EntryChunk` contains complete definitions. Package revisions are opaque strings, not ordered semantic versions. Manifest format version is independent of character format version. `ContractCodec.decodeManifest` rejects unsupported manifest versions before loading index/chunks. Entry identity/category, presentation/references, mechanics and coverage remain separate. Whole-entry overrides keep the entry ID and replace the entire definition; resolution/order/dependency validation will be implemented separately.

The fixed vocabulary comprises entry/proficiency grants; entry, proficiency and main-ability choices; minimum-level, selected-entry, direct ability-point and proficiency prerequisites; explicit unadapted prerequisites; typed integer ADD/SET/MINIMUM modifiers; and level-specific class grants, choices and modifiers. Targets enumerate supported statistics, with explicit ability or skill qualifiers where required. Bonus types are fixed data. No expression evaluator or executable extension exists. Engine implementations must surface unadapted prerequisites as incomplete automation, and must never interpret source score thresholds using vanilla math. Coverage is supported/partial/unimplemented with limitations. These DTOs define vocabulary, not a claim that the engine evaluates it yet.

`ContractCodec` strictly encodes/decodes character v1. Missing/future versions, unknown fields and unknown mechanic variants are rejected; unresolved selections are valid portable data. No import writes to storage. Unsupported future formats require an explicit future codec, never silent migration. Content remains bundled separately; portable characters carry neither entry descriptions nor calculated statistics. See the portable codec policy below for validation and web APIs.

Fingerprints are `sha256-v1:` plus lowercase SHA-256 of UTF-8 canonical JSON for the **whole serialized entry**, including presentation and coverage. All v1 default fields are emitted, object keys are recursively sorted lexicographically by UTF-16 code units, arrays retain order, strings use kotlinx.serialization JSON escaping, and integer values use JSON decimal encoding. Package ID/revision are outside the entry digest and retained separately. The prefix versions this algorithm. Fingerprints detect changes; they provide no historical pinning or signature/authenticity guarantee. Fixtures include an independently generated digest. Presentation-only edits also count as changed definitions.

`ContractResult.Available` carries a value and optional diagnostics; `Unavailable` requires diagnostics and has no value. Missing dependencies must propagate unavailable dependent totals, never zero. Diagnostic kinds distinguish unresolved content, incomplete automation, invalid selections, incompatible format and IO failure. `CalculatedValue` and its contributors are derived result data, never fields of a saved character. Manual adjustment contributors must use the label **Manual Adjustment**; a reason is optional.

`ContentSource` lists bundled manifests and loads logical index/chunk IDs. `CharacterStore` distinguishes CREATE (fail if the ID exists) from REPLACE_WITH_RECOVERY (fail if it does not); replacement must preserve a recovery document before atomically publishing the new one. `SaveReceipt.recoveryId` identifies a recovery copy retrievable through `load`; failed recovery/write operations return unavailable and leave the prior save intact. `delete` returns whether a character existed. Implementations must report IO errors, not success. `FileExchange` receives/delivers JSON without performing storage or rules work; cancellation is an available null receive result. These are interfaces only; adapter behavioral tests belong with their implementations.

The proof Fighter and small whole-entry override are contract fixtures, not production content or full Fighter automation. No UI workflow, catalog resolver, rules evaluator or storage adapter is added by these milestones. The JS smoke boundary remains available; character exchange uses the JSON wrappers below rather than exposing Kotlin collections.

## Portable codec policy (#6)

Android calls `ContractCodec.decode(text)` and `encodeChecked(document)` directly. Both return `ContractResult`; unavailable results carry `INCOMPATIBLE_FORMAT` diagnostics and no value. `encode(document)` remains a convenience for validated callers and throws `IllegalArgumentException` on invalid metadata. Adapters must check availability before saving or reporting export success. The codec has no storage dependency and cannot overwrite a save.

Web imports generated `decodeCharacterJson(text)` and `encodeCharacterJson(documentJson)` from `@modern4e/shared`. Each returns a JSON string containing `{ type: "available", value, diagnostics }` or `{ type: "unavailable", diagnostics }`. Decode's value is the character object; encode's value is the portable JSON string. Parse the envelope with `JSON.parse`. Concrete result serializers preserve the value type on the Kotlin/JS boundary.

- `formatVersion` must be the JSON integer `1`, explicitly present. It is independent of opaque content revisions; no content lookup, pinning or migration occurs.
- Required fields and nested JSON types are checked, including enum names and integer map values. Numeric strings, unquoted strings, fractional/out-of-range integers and explicit nulls for non-null fields are rejected. Diagnostics identify field paths; constructor invariant failures return a malformed-document diagnostic describing the constraints.
- Omitted optional fields use declared DTO defaults and exports emit those defaults. Unknown fields anywhere, including additional content/derived totals, are rejected rather than silently discarded. Duplicate members, including escaped spellings of the same key, are also rejected. Configuration maps retain their arbitrary string keys and values.
- JSON lexemes are checked before tree decoding: leading-zero or malformed numbers, invalid escapes, unescaped string controls and non-JSON whitespace are rejected with offset diagnostics.
- IDs, source/choice/instance IDs, supplier IDs, fingerprints and revisions use explicit `@OpaqueIdentifier` model annotations rather than a field-name whitelist and must be nonblank strings. They are otherwise opaque; unknown content and fingerprint algorithms remain portable. Slot ordinals, unique level records, level ranges and equipment quantities retain the contract's structural constraints.
- `savedAt` must be a calendar-valid RFC 3339 timestamp with four-digit year, seconds 00–59, optional fractional seconds and an explicit `Z` or numeric timezone offset. Leap-second timestamps are not supported. Encoding never generates a timestamp, ID or revision.
- All stored decisions, ordered packages, source slots, advancements, both replacement kinds, unresolved selections, equipment configuration and manual adjustments survive semantic round trips. Whitespace and JSON object-key order are not preserved. Content availability, ability budgets and choice eligibility are engine concerns; mechanically invalid characters remain exportable when their document structure is valid.

Validation on 2026-11-16: shared JVM/JS tests and JS production distribution, Android debug assembly, compiled web boundary tests and TypeScript/Vite production build. This change has no UI; emulator instrumentation and browser visual checks are not required or rerun. Existing Gradle configuration and Kotlin source-map warnings remain. See `tests/README.md` for the commands.

## Validation recorded for contracts (#5)

Local Windows validation on 2026-11-16, using the foundation's installed toolchains (`GRADLE_USER_HOME=C:\Users\Imre\.gradle`, `ANDROID_HOME=C:\Users\Imre\AppData\Local\Android\Sdk`):

- `.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution :android:assembleDebug`: passed; 8 new contract tests plus 2 existing smoke tests on each shared target (20 total), JS production distribution and Android debug APK built successfully.
- `npm test --prefix web`: 3 passed against the generated Kotlin distribution.
- `npm run build --prefix web`: TypeScript and Vite production build passed.
- `git diff --check`: passed.

The existing configuration-time Gradle/npm resolution warning remains. This milestone did not change either UI; emulator instrumentation and visual review were not rerun. CI has not been run for these changes. Storage adapter behavior, catalog resolution and rule evaluation remain later-ticket work; the contract fixtures do not prove those behaviors.

## Codec review fixes

Validation: `:shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution :android:assembleDebug` passed (21 shared tests per target). `npm test --prefix web` passed 7 tests against the rebuilt Kotlin distribution; `npm run build --prefix web` and `git diff --check` passed. Regression coverage includes malformed number tokens, all unescaped string control characters, invalid escapes, every identifier occurrence in the golden character and unrestricted configuration text.

## Shared catalog

`ContentCatalog.open(source, standardPackageId, character.packages)` creates independent
catalogs for each character. The standard package is first, followed by enabled packages
in saved order; repeated package IDs are rejected. Dependencies must be explicitly enabled
and match the exact installed revision declared by the manifest. Character last-seen revisions
are acknowledgment history, not pins: current installed definitions are used.

`search` filters winning IDs/titles and optional categories without requesting chunks.
`lookup` loads the winning whole definition and returns supplier revision, codec fingerprint,
and incomplete-automation diagnostics. An ordinary miss is an available null.
`resolveReferences` resolves presentation reference IDs through the same catalog.

`resolve(savedSelection)` requires the expected supplier to remain usable and index the saved
entry ID, preventing silent fallback when custom content disappears. A deliberate package
switch is explicit (`deliberatePackageSwitch = true`). Resolved selections expose
`acknowledgmentRequired` when the supplier or fingerprint changed; this is not an invalid-choice
verdict. Neither operation modifies the saved selection or acknowledgment baseline.

Missing/unusable packages produce diagnostics and are excluded (including dependent packages),
so unrelated definitions stay accessible. Missing standard content, ambiguous manifests/indexes
and index IO failures prevent catalog construction. Chunk errors fail the requested detail
without fallback. Adapters must return structured IO failures via `ContractResult`.
The catalog reads metadata once per construction, loads chunks on demand without caching,
and should be recreated after installed content changes. There is no platform IO, UI,
character calculation, package import, historical pinning or automated migration here.

Catalog validation (2026-11-16, JDK 21 and installed Android SDK):
`./gradlew.bat :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution :shared:compileDebugKotlinAndroid`
passed: 32 tests on each of JVM and Node/JS (11 catalog tests per target), production JS
library generation and Android shared Kotlin compilation. `git diff --check` passed.
Set `ANDROID_HOME=C:\Users\Imre\AppData\Local\Android\Sdk` and
`GRADLE_USER_HOME=C:\Users\Imre\.gradle` for this Windows installation.
Existing Gradle configuration-time npm resolution warnings remain. No UI or emulator tests
were rerun because this change adds shared catalog logic only. Generated pipeline packages
from issue #7 are not available in this worktree; the existing v1 JSON fixtures exercise the
same unchanged manifest/index/chunk contracts directly.
