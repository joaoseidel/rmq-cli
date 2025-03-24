package com.luizalabs.rmq.core

fun String.toGlobRegex() = this.replace(".", "\\.")
    .replace("*", ".*")
    .replace("?", ".")
    .toRegex()

fun String.removeGlob() = this.replace(".", "")
    .replace("*", "")
    .replace("?", "")