import org.graalvm.buildtools.gradle.tasks.BuildNativeImageTask

plugins {
    alias(libs.plugins.kotlinxKover)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.graalNative)
    alias(libs.plugins.shadow)
    alias(libs.plugins.ksp)
    application
}

application {
    mainClass = "io.joaoseidel.rmq.app.MainKt"
}

dependencies {
    implementation(project(":rmq-cli-core"))
    implementation(project(":rmq-cli-clikt"))

    implementation(libs.bundles.kotlinxEcosystem)
    implementation(libs.bundles.logging)
    implementation(libs.bundles.clikt)
    implementation(libs.bundles.koin)
    implementation(libs.bundles.rabbitMQ)

    ksp(libs.koinKsp)

    testImplementation(libs.bundles.testing)
}

ksp {
    arg("KOIN_CONFIG_CHECK", "true")
    arg("KOIN_DEFAULT_MODULE", "false")
}

// Distributions configuration (JVM and Native)

tasks.named<Zip>("distZip") {
    archiveBaseName.set("rmq")
    archiveClassifier.set("jvm")
    archiveVersion.set("")
}

graalvmNative {
    toolchainDetection.set(true)

    metadataRepository {
        enabled.set(true)
    }

    agent {
        enabled.set(true)
        defaultMode.set("standard")
        modes {
            standard {}
        }
        metadataCopy {
            inputTaskNames.add("run")
            outputDirectories.add("src/main/resources/META-INF/native-image")
        }
    }

    binaries {
        named("main") {
            imageName.set("rmq")
            debug.set(false)

            javaLauncher.set(javaToolchains.launcherFor {
                languageVersion.set(JavaLanguageVersion.of(23))
            })
        }
    }
}

tasks.withType<BuildNativeImageTask> {
    dependsOn("processResources")
}

graalvmNative {
    agent {
        modes {
            direct {
                options.add("config-output-dir=src/main/resources/META-INF/native-image")
            }
        }
    }
}