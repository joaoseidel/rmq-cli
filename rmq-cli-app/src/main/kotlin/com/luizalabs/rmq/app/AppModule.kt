package com.luizalabs.rmq.app

import com.luizalabs.rmq.clikt.CliktModule
import com.luizalabs.rmq.core.CoreModule
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Module

@Module(includes = [CliktModule::class, CoreModule::class])
@ComponentScan("com.luizalabs.rmq.app")
class AppModule