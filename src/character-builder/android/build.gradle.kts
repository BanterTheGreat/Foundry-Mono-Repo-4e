plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.compose")
}
android {
    namespace = "dev.modern4e.builder"
    compileSdk = 34
    buildToolsVersion = "34.0.0"
    defaultConfig {
        applicationId = "dev.modern4e.builder"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/bundledAssets"))
    sourceSets["androidTest"].assets.srcDir("../shared/fixtures")
    testOptions.unitTests.isIncludeAndroidResources = true
    sourceSets["test"].resources.srcDir("../shared/fixtures")
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}
kotlin { jvmToolchain(21) }
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    implementation(project(":shared"))
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.12.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.6.2")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// Copy generated packages byte-for-byte, without Android-specific conversion.
val bundleContent by tasks.registering(Sync::class) {
    from("../content/generated")
    into(layout.buildDirectory.dir("generated/bundledAssets/content"))
    doLast {
        val packages = file("../content/generated").listFiles()!!.filter { it.isDirectory }.map { it.name }.sorted()
        layout.buildDirectory.file("generated/bundledAssets/content-packages.txt").get().asFile.writeText(packages.joinToString("\n"))
    }
}
tasks.named("preBuild") { dependsOn(bundleContent) }
