import org.gradle.api.tasks.testing.logging.TestLogEvent

plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.kotlinxKover) apply false
}

allprojects {
    group = "io.joaoseidel.rmq"
    version = "0.1.0-SNAPSHOT"

    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "kotlin")

    // Testing configurations
    tasks.withType<Test> {
        useJUnitPlatform()

        testLogging {
            displayGranularity = 2

            events(
                TestLogEvent.PASSED,
                TestLogEvent.FAILED,
                TestLogEvent.SKIPPED,
            )
        }

        defaultCharacterEncoding = "UTF-8"
    }

    // Dependencies
    dependencies {
        implementation(kotlin("stdlib"))
        implementation(kotlin("reflect"))
    }
}

configurations {
    compileOnly {
        extendsFrom(configurations.annotationProcessor.get())
    }
}

// Toolchain configuration
kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
    }

    jvmToolchain(23)
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(23)
    }
}