android {
    signingConfigs {
        create("release") {
            storeFile = file("../lingxi-release.jks")
            storePassword = "Lingxi2026"
            keyAlias = "lingxi"
            keyPassword = "Lingxi2026"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles("proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
