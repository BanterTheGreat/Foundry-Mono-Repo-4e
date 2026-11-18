package dev.modern4e.builder

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

/**
 * Turns the bytes of a chosen image into the stored portrait, never larger than a bounded edge.
 * Implementations throw [IllegalArgumentException] with a user-readable message for unusable images.
 */
fun interface PortraitEncoder {
    /**
     * @param source the raw bytes the user picked, in any format the platform can decode.
     * @param maxEdge the longest edge the stored image may have, in pixels.
     * @param target receives the encoded portrait.
     */
    fun encode(source: ByteArray, maxEdge: Int, target: OutputStream)
}

/**
 * Device-local portraits, one file per character id under [directory].
 *
 * A portrait is presentation data of this installation only: it is not part of the character
 * document, so exports never carry it and imports neither bring one in nor remove an existing one.
 * Operations are blocking file work; call them from an IO dispatcher.
 */
class PortraitStore(private val directory: File, private val encoder: PortraitEncoder) {
    /**
     * The file a character's portrait is stored in, whether or not it exists. Ids that are not
     * plain file-name characters (imported documents choose their own ids) are hashed, so no id
     * can reach outside [directory].
     */
    fun fileFor(characterId: String): File {
        val safe = SAFE_ID.matches(characterId)
        val name = if (safe) characterId else "~" + MessageDigest.getInstance("SHA-256").digest(characterId.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return File(directory, "$name.png")
    }

    /** The stored portrait, or null when the character has none. */
    fun current(characterId: String): File? = fileFor(characterId).takeIf { it.isFile }

    /**
     * Replace the character's portrait with the image read from [source]. A failed attempt leaves
     * any existing portrait untouched.
     */
    fun save(characterId: String, source: InputStream): ContractResult<File> = synchronized(lock) {
        val staged = File(directory, "staging.pending")
        try {
            val bytes = readLimited(source) ?: return failure("large", "That file is too large to use as a portrait.")
            check(directory.isDirectory || directory.mkdirs()) { "Cannot create portrait storage" }
            staged.outputStream().use { encoder.encode(bytes, MAX_EDGE, it) }
            val target = fileFor(characterId)
            Files.move(staged.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            ContractResult.Available(target)
        } catch (error: IllegalArgumentException) {
            failure("image", error.message ?: "That file is not an image that can be used as a portrait.")
        } catch (error: Exception) {
            failure("io", error.message ?: "The portrait could not be saved.")
        } finally {
            staged.delete()
        }
    }

    /** Remove the character's portrait, if any. Returns whether a portrait was removed. */
    fun delete(characterId: String): Boolean = synchronized(lock) { fileFor(characterId).delete() }

    private fun readLimited(source: InputStream): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        source.use { stream ->
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) {
                    break
                }
                out.write(buffer, 0, count)
                if (out.size() > MAX_SOURCE_BYTES) {
                    return null
                }
            }
        }
        return out.toByteArray()
    }

    private fun failure(code: String, message: String) =
        ContractResult.Unavailable(listOf(Diagnostic("android.portrait.$code", DiagnosticKind.IO_FAILURE, message)))

    companion object {
        /** Longest edge of a stored portrait; the panel is small, so this keeps memory per portrait modest. */
        const val MAX_EDGE = 512
        /** Largest source file read into memory. */
        const val MAX_SOURCE_BYTES = 32 * 1024 * 1024
        private val SAFE_ID = Regex("[A-Za-z0-9_-]{1,100}")
        private val lock = Any()
    }
}
