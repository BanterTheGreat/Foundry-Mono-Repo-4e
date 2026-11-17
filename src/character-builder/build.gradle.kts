plugins {
    kotlin("multiplatform") version "2.1.21" apply false
    kotlin("plugin.serialization") version "2.1.21" apply false
    kotlin("android") version "2.1.21" apply false
    kotlin("plugin.compose") version "2.1.21" apply false
    id("com.android.library") version "8.7.3" apply false
    id("com.android.application") version "8.7.3" apply false
}

plugins.withType<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsPlugin> {
    extensions.configure<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsEnvSpec> {
        version = "22.14.0"
    }
}

// Authoring validation and stale-byte detection precede platform publication.
tasks.register<Exec>("validateProductionContent") {
    workingDir(rootDir)
    commandLine("python", "-X", "utf8", "content/build.py", "--check")
}
