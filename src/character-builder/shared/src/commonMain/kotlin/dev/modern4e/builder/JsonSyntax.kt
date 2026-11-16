package dev.modern4e.builder

/** Checks JSON lexemes before kotlinx.serialization builds a tree (which accepts some invalid lexemes). */
internal object JsonSyntax {
    fun validate(text: String) {
        var offset = 0
        fun invalid(message: String): Nothing = throw IllegalArgumentException("JSON offset $offset: $message")
        while (offset < text.length) {
            when (val char = text[offset]) {
                ' ', '\t', '\r', '\n', '{', '}', '[', ']', ':', ',' -> offset++
                '"' -> {
                    offset++
                    var closed = false
                    while (offset < text.length) {
                        val current = text[offset++]
                        if (current == '"') {
                            closed = true
                            break
                        }
                        if (current < ' ') {
                            invalid("Escape control characters inside strings.")
                        }
                        if (current == '\\') {
                            if (offset == text.length) {
                                invalid("Incomplete string escape.")
                            }
                            when (text[offset++]) {
                                '"', '\\', '/', 'b', 'f', 'n', 'r', 't' -> Unit
                                'u' -> repeat(4) {
                                    if (offset == text.length || text[offset] !in "0123456789abcdefABCDEF") {
                                        invalid("Unicode escapes require four hexadecimal digits.")
                                    }
                                    offset++
                                }
                                else -> invalid("Unknown string escape.")
                            }
                        }
                    }
                    if (!closed) {
                        invalid("Unterminated string.")
                    }
                }
                else -> {
                    val start = offset
                    while (offset < text.length && text[offset] !in " \t\r\n{}[]:,") {
                        offset++
                    }
                    val token = text.substring(start, offset)
                    if (token !in setOf("true", "false", "null") && !number.matches(token)) {
                        invalid("Invalid JSON token '$token'; quote strings and use JSON number syntax.")
                    }
                }
            }
        }
    }

    private val number = Regex("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")
}
