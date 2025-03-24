plugins {
    alias(libs.plugins.kotlinxKover)
    alias(libs.plugins.ksp)
}

dependencies {
    compileOnly(project(":rmq-cli-core"))
    compileOnly(libs.bundles.kotlinxEcosystem)
    compileOnly(libs.bundles.logging)
    compileOnly(libs.bundles.clikt)
    compileOnly(libs.bundles.koin)
    compileOnly(libs.rabbitMQ)

    ksp(libs.koinKsp)

    testImplementation(libs.bundles.testing)
}

ksp {
    arg("KOIN_CONFIG_CHECK", "true")
    arg("KOIN_DEFAULT_MODULE", "false")
}