package io.joaoseidel.rmq.core

fun String.toGlobRegex() = this.replace(".", "\\.")
    .replace("*", ".*")
    .replace("?", ".")
    .toRegex()

fun String.removeGlob() = this.replace(".", "")
    .replace("*", "")
    .replace("?", "")