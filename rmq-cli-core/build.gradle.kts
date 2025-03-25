plugins {
    alias(libs.plugins.kotlinxKover)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
}

dependencies {
    compileOnly(libs.bundles.kotlinxEcosystem)
    compileOnly(libs.bundles.logging)
    compileOnly(libs.bundles.koin)
    compileOnly(libs.bundles.rabbitMQ)

    ksp(libs.koinKsp)

    testImplementation(libs.bundles.testing)
}

ksp {
    arg("KOIN_CONFIG_CHECK", "true")
    arg("KOIN_DEFAULT_MODULE", "false")
}