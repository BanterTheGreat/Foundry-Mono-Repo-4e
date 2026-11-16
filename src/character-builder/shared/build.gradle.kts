plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("com.android.library")
}
kotlin {
    jvm()
    androidTarget()
    js(IR) {
        nodejs()
        browser()
        binaries.library()
        useEsModules()
        generateTypeScriptDefinitions()
    }
    jvmToolchain(21)
    sourceSets {
        commonMain.dependencies { implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1") }
        commonTest.dependencies { implementation(kotlin("test")) }
    }
}
android {
    namespace = "dev.modern4e.builder.shared"
    compileSdk = 34
    buildToolsVersion = "34.0.0"
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

// Embed the same checked-in golden JSON in common tests on both JVM and JS.
val generateContractFixtures by tasks.registering {
    val fixtures = layout.projectDirectory.dir("fixtures")
    val output = layout.buildDirectory.dir("generated/contractFixtures")
    inputs.dir(fixtures)
    outputs.dir(output)
    doLast {
        val target = output.get().file("ContractFixtures.kt").asFile
        target.parentFile.mkdirs()
        val entries = fixtures.asFile.listFiles()!!.sortedBy { it.name }.joinToString(",\n") {
            val escaped = it.readText().replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("$", "\\$")
            "    \"${it.name}\" to \"$escaped\""
        }
        target.writeText("package dev.modern4e.builder\ninternal val contractFixtures = mapOf(\n$entries\n)\n")
    }
}
kotlin.sourceSets.commonTest { kotlin.srcDir(generateContractFixtures) }

// Production fixtures remain separate from hand-authored contract goldens.
val generateProductionFixtures by tasks.registering {
    val fixtures = layout.projectDirectory.dir("../content/generated")
    val output = layout.buildDirectory.dir("generated/productionFixtures")
    inputs.dir(fixtures)
    outputs.dir(output)
    doLast {
        val target = output.get().file("ProductionFixtures.kt").asFile
        target.parentFile.mkdirs()
        val entries = fixtures.asFile.walkTopDown().filter { it.isFile && it.extension == "json" }
            .sortedBy { it.relativeTo(fixtures.asFile).invariantSeparatorsPath }.joinToString(",\n") {
                val name = it.relativeTo(fixtures.asFile).invariantSeparatorsPath
                val escaped = it.readText().replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("$", "\\$")
                "    \"$name\" to \"$escaped\""
            }
        target.writeText("package dev.modern4e.builder\ninternal val productionFixtures = mapOf(\n$entries\n)\n")
    }
}
kotlin.sourceSets.commonTest { kotlin.srcDir(generateProductionFixtures) }

