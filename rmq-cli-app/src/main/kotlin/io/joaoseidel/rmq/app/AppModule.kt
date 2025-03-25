package io.joaoseidel.rmq.app

import io.joaoseidel.rmq.clikt.CliktModule
import io.joaoseidel.rmq.core.CoreModule
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Module

@Module(includes = [CliktModule::class, CoreModule::class])
@ComponentScan("io.joaoseidel.rmq.app")
class AppModule