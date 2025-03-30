dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver") version "0.9.0"
}

rootProject.name = "rmq-cli"

// Production code projects
include("rmq-cli-core")
include("rmq-cli-clikt")
include("rmq-cli-app")

// Toolchain repository configuration
toolchainManagement {
    jvm {
        javaRepositories {
            repository("foojay") {
                resolverClass.set(org.gradle.toolchains.foojay.FoojayToolchainResolver::class.java)
            }
        }
    }
}
