plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    // Side by side with the TWA (io.github.quoterg.ironnotes) until the cut-over (docs/NATIVE.md).
    namespace = "io.github.quoterg.ironnotes.next"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.quoterg.ironnotes.next"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // The owner signs release builds (keys never committed). CI builds with the debug key only
            // so the size budget can be checked on a shrunk build.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = false
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "DebugProbesKt.bin", "kotlin-tooling-metadata.json")
    }

    dependenciesInfo {
        // No Google-encrypted dependency blob in the APK (F-Droid friendly).
        includeInApk = false
        includeInBundle = false
    }
}

kotlin {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
}

dependencies {
    implementation(project(":core"))
    // Compose foundation only — no Material or other component libraries (as on the web).
    implementation(platform("androidx.compose:compose-bom:2025.12.00"))
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.11.0")
    // Applies the baseline profile on install (cold start).
    implementation("androidx.profileinstaller:profileinstaller:1.4.1")
}
