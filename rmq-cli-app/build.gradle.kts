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
    mainClass = "com.luizalabs.rmq.app.MainKt"
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
                vendor.set(JvmVendorSpec.GRAAL_VM)
            })
        }
    }
}

tasks.withType<BuildNativeImageTask> {
    dependsOn("processResources")
}

tasks.register<JavaExec>("runWithAgent") {
    group = "application"
    description = "Runs the application with the GraalVM tracing agent"

    mainClass.set("com.luizalabs.rmq.app.MainKt")
    classpath = sourceSets["main"].runtimeClasspath

//    jvmArgs = listOf(
//        "-agentlib:native-image-agent=config-output-dir=src/main/resources/META-INF/native-image/com.luizalabs.rmq/rmq-cli-app,config-write-period-secs=5,config-write-initial-delay-secs=5"
//    )

    args = listOf(
        "connection", "list",
    )
}