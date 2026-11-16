plugins {
    kotlin("multiplatform")
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

