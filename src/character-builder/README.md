# Modern 4e Character Builder

Foundation for issue #4. This standalone project has no Foundry manifest and must never be deployed to Foundry. Character creation, rules, persistence, content packages and offline provisioning are not implemented.

## Layout and boundaries

- `shared/`: Kotlin Multiplatform library with common implementation/tests, JVM test target, Android library and a small Kotlin/JS adapter. No platform IO or UI in common code.
- `web/`: React/TypeScript desktop shell. Imports the generated ES module and TypeScript declarations, not a handwritten substitute.
- `android/`: native Compose application calling common Kotlin directly.
- Root Gradle wrapper/settings: standalone build; not part of the Foundry tooling.

The smoke fixture is an engineering check, not a character/document contract. Ticket #5 will establish those contracts. The implementation baseline is Modern 4e abilities and proficiencies only.

## Toolchains

Pinned Gradle 8.11.1 (wrapper with distribution SHA-256), Kotlin/Compose compiler 2.1.21, Android Gradle Plugin 8.7.3. Use JDK 21, Node 24.16.0/npm 11.13.0 and Android SDK platform 34 plus build-tools 34.0.0. Android Studio is optional. Accept SDK licenses and set `ANDROID_HOME` to your SDK directory (or configure an ignored `local.properties`). Gradle downloads dependencies on the first build; network access is required for setup. npm dependency versions are exact with a committed lockfile. Kotlin/JS uses its own downloaded Node 22.14.0 and committed `kotlin-js-store/yarn.lock`; the web tooling uses the Node version in `.nvmrc`.

## Build and test

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
