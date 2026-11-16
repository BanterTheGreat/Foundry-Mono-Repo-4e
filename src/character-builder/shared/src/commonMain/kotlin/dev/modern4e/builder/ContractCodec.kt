package dev.modern4e.builder

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

/** Strict v1 codec: incompatible data is rejected before any storage operation. */
object ContractCodec {
    val json = Json { encodeDefaults = true }

    /** Emit decisions without resolving or dropping missing selections. */
    fun encode(document: CharacterDocument): String {
        val errors = CharacterValidation.validate(json.encodeToJsonElement(document))
        require(errors.isEmpty()) { errors.joinToString("; ") { it.message } }
        return json.encodeToString(document)
    }

    /** Structured export failure for adapters; no timestamps or decisions are regenerated. */
    fun encodeChecked(document: CharacterDocument): ContractResult<String> {
        val errors = CharacterValidation.validate(json.encodeToJsonElement(document))
        return if (errors.isEmpty()) {
            ContractResult.Available(json.encodeToString(document))
        } else {
            ContractResult.Unavailable(errors)
        }
    }

    /** Reject incompatible formats without IO or mutation of existing saves. */
    fun decode(text: String): ContractResult<CharacterDocument> {
        return try {
            val tree = json.parseToJsonElement(text)
            val errors = CharacterValidation.duplicateFields(text) + CharacterValidation.validate(tree)
            if (errors.isNotEmpty()) {
                ContractResult.Unavailable(errors)
            } else {
                ContractResult.Available(json.decodeFromJsonElement<CharacterDocument>(tree))
            }
        } catch (error: IllegalArgumentException) {
            ContractResult.Unavailable(listOf(Diagnostic("character.malformed", DiagnosticKind.INCOMPATIBLE_FORMAT, "Malformed character document: check JSON syntax, levels (1–30, unique and no higher than the character), nonnegative slot ordinals, positive equipment quantities and modifier qualifiers. ${error.message.orEmpty()}")))
        }
    }

    /** Validate the package format before accepting asset references or mechanics. */
    fun decodeManifest(text: String): ContractResult<PackageManifest> {
        return try {
            val version = json.parseToJsonElement(text).jsonObject["formatVersion"]?.jsonPrimitive?.intOrNull
            if (version != 1) {
                ContractResult.Unavailable(listOf(Diagnostic("package.format", DiagnosticKind.INCOMPATIBLE_FORMAT, "Unsupported or missing package format version: $version")))
            } else {
                ContractResult.Available(json.decodeFromString<PackageManifest>(text))
            }
        } catch (error: IllegalArgumentException) {
            ContractResult.Unavailable(listOf(Diagnostic("package.malformed", DiagnosticKind.INCOMPATIBLE_FORMAT, error.message ?: "Malformed package manifest")))
        }
    }

    /** Full definition, including presentation and coverage. Object order is irrelevant; array order matters. */
    fun fingerprint(entry: ContentEntry): String = "sha256-v1:" + sha256(canonical(json.encodeToJsonElement(entry)).encodeToByteArray())

    internal fun canonical(value: JsonElement): String = when (value) {
        is JsonObject -> value.keys.sorted().joinToString(",", "{", "}") { key -> json.encodeToString(key) + ":" + canonical(value.getValue(key)) }
        is JsonArray -> value.joinToString(",", "[", "]") { canonical(it) }
        else -> value.toString()
    }
}

/** SHA-256 over UTF-8 canonical JSON, using only common Kotlin integer operations. */
internal fun sha256(bytes: ByteArray): String {
    val constants = longArrayOf(
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ).map { it.toInt() }
    val state = longArrayOf(0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19).map { it.toInt() }.toIntArray()
    val padded = bytes.copyOf(((bytes.size + 9 + 63) / 64) * 64)
    padded[bytes.size] = 0x80.toByte()
    val bits = bytes.size.toLong() * 8
    for (i in 0..7) {
        padded[padded.lastIndex - i] = (bits ushr (8 * i)).toByte()
    }
    fun rotate(x: Int, n: Int): Int = (x ushr n) or (x shl (32 - n))
    for (offset in padded.indices step 64) {
        val w = IntArray(64)
        for (i in 0..15) {
            for (j in 0..3) {
                w[i] = (w[i] shl 8) or (padded[offset + i * 4 + j].toInt() and 255)
            }
        }
        for (i in 16..63) {
            val a = w[i - 15]; val b = w[i - 2]
            w[i] = w[i - 16] + (rotate(a, 7) xor rotate(a, 18) xor (a ushr 3)) + w[i - 7] + (rotate(b, 17) xor rotate(b, 19) xor (b ushr 10))
        }
        var a = state[0]; var b = state[1]; var c = state[2]; var d = state[3]
        var e = state[4]; var f = state[5]; var g = state[6]; var h = state[7]
        for (i in 0..63) {
            val t1 = h + (rotate(e, 6) xor rotate(e, 11) xor rotate(e, 25)) + ((e and f) xor (e.inv() and g)) + constants[i] + w[i]
            val t2 = (rotate(a, 2) xor rotate(a, 13) xor rotate(a, 22)) + ((a and b) xor (a and c) xor (b and c))
            h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2
        }
        intArrayOf(a,b,c,d,e,f,g,h).forEachIndexed { i, value -> state[i] += value }
    }
    return state.joinToString("") { it.toUInt().toString(16).padStart(8, '0') }
}
