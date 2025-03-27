package io.joaoseidel.rmq.core

/**
 * Converts the string, interpreted as a glob pattern, into a regular expression.
 *
 * This function transforms a glob pattern into a regular expression by:
 * - Escaping dots (`.`) to match literal dots.
 * - Converting asterisks (`*`) to match zero or more arbitrary characters.
 * - Converting question marks (`?`) to match a single arbitrary character.
 *
 * The resulting regular expression can then be used for pattern matching.
 *
 * @receiver The string containing the glob pattern to be converted.
 * @return A [Regex] object equivalent to the original glob pattern.
 */
fun String.toGlobRegex() = this.replace(".", "\\.")
    .replace("*", ".*")
    .replace("?", ".")
    .toRegex()

/**
 * Removes glob pattern special characters (`.`, `*`, `?`) from the string.
 *
 * This function is useful for sanitizing strings by stripping away
 * characters commonly used in glob patterns, leaving only the literal content.
 *
 * @receiver The string from which glob pattern characters will be removed.
 * @return A new string without the glob pattern characters.
 */
fun String.removeGlob() = this.replace(".", "")
    .replace("*", "")
    .replace("?", "")

/**
 * Truncates the string to include only the section around a matched pattern, with additional context before and after.
 *
 * This function searches the string for a specified pattern, keeping a user-defined number of characters (`contextSize`)
 * on both sides of the match. If the pattern is not found, or the string is already short enough, it returns the
 * original string. The match process is case-insensitive, and glob pattern special characters from the search string
 * are removed before searching.
 *
 * If the string is truncated, ellipses (`...`) are used as prefix or suffix to denote omitted portions of the string.
 *
 * @receiver The string to truncate.
 * @param pattern The string pattern to search for. Supports glob-style patterns but removes special characters before searching.
 * @param contextSize The number of characters to retain around the matched pattern. Defaults to 10.
 * @return A truncated string containing the pattern and the surrounding context, or the original string if conditions for truncation are not met.
 */
fun String.truncateAroundPattern(pattern: String, contextSize: Int = 10): String {
    if (pattern.isBlank() || this.length <= contextSize * 2 + pattern.length) {
        return this
    }

    val searchRegex = pattern.removeGlob().toRegex(RegexOption.IGNORE_CASE)
    val matchResult = searchRegex.find(this) ?: return this

    val start = matchResult.range.first
    val end = matchResult.range.last + 1

    val startPos = (start - contextSize).coerceAtLeast(0)
    val endPos = (end + contextSize).coerceAtMost(this.length)

    val prefix = if (startPos > 0) "..." else ""
    val suffix = if (endPos < this.length) "..." else ""

    return prefix + this.substring(startPos, endPos) + suffix
}