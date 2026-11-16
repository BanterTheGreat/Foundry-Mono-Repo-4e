@file:OptIn(ExperimentalJsExport::class)

import dev.modern4e.builder.CharacterDocument
import dev.modern4e.builder.ContractCodec
import dev.modern4e.builder.ContractResult
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.*

/** JSON result envelope keeps Kotlin collections and exceptions out of the web boundary. */
@JsExport
fun decodeCharacterJson(text: String): String {
    return when (val result = ContractCodec.decode(text)) {
        is ContractResult.Available -> envelope("available",
            ContractResult.Available.serializer(CharacterDocument.serializer()), result,
        )
        is ContractResult.Unavailable -> envelope("unavailable", ContractResult.Unavailable.serializer(), result)
    }
}

/** Validate document JSON and return an envelope containing the portable export string. */
@JsExport
fun encodeCharacterJson(documentJson: String): String {
    val result = when (val decoded = ContractCodec.decode(documentJson)) {
        is ContractResult.Available -> ContractCodec.encodeChecked(decoded.value)
        is ContractResult.Unavailable -> decoded
    }
    return when (result) {
        is ContractResult.Available -> envelope("available",
            ContractResult.Available.serializer(String.serializer()), result,
        )
        is ContractResult.Unavailable -> envelope("unavailable", ContractResult.Unavailable.serializer(), result)
    }
}

/** Use concrete serializers: generic sealed-result serializers erase the value type on JS. */
private fun <T> envelope(type: String, serializer: SerializationStrategy<T>, result: T): String {
    val fields = ContractCodec.json.encodeToJsonElement(serializer, result).jsonObject
    return JsonObject(mapOf("type" to JsonPrimitive(type)) + fields).toString()
}
