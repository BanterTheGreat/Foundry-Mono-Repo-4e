package dev.modern4e.builder

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.nio.file.Files

/** Checks portrait file handling with the image codec replaced by a recorder, so no bitmaps are needed. */
class PortraitStoreTest {
    private lateinit var directory: File
    private var maxEdges = mutableListOf<Int>()
    private val copying = PortraitEncoder { source, maxEdge, target ->
        maxEdges += maxEdge
        require(source.isNotEmpty()) { "That file is not an image that can be used as a portrait." }
        target.write(source)
    }
    private fun store(encoder: PortraitEncoder = copying) = PortraitStore(File(directory, "portraits"), encoder)
    private fun bytes(text: String): InputStream = ByteArrayInputStream(text.toByteArray())

    @Before fun create() {
        directory = Files.createTempDirectory("portraits").toFile()
    }
    @After fun clean() {
        directory.deleteRecursively()
    }

    @Test fun characterWithoutPortraitHasNone() {
        assertNull(store().current("a"))
    }

    @Test fun savedPortraitIsFoundByCharacterIdAndLimitedToTheMaximumEdge() {
        val portraits = store()
        val saved = (portraits.save("a", bytes("first")) as ContractResult.Available).value
        assertEquals(saved, portraits.current("a"))
        assertEquals("a.png", saved.name)
        assertEquals("first", saved.readText())
        assertEquals(listOf(PortraitStore.MAX_EDGE), maxEdges)
        assertNull(portraits.current("b"))
    }

    @Test fun replacingKeepsOnePortraitPerCharacter() {
        val portraits = store()
        portraits.save("a", bytes("first"))
        portraits.save("b", bytes("other"))
        portraits.save("a", bytes("second"))
        assertEquals("second", portraits.current("a")!!.readText())
        assertEquals("other", portraits.current("b")!!.readText())
        assertEquals(setOf("a.png", "b.png"), File(directory, "portraits").list()!!.toSet())
    }

    @Test fun unusableImageIsReportedAndKeepsTheExistingPortrait() {
        val portraits = store()
        portraits.save("a", bytes("keep me"))
        val failed = portraits.save("a", bytes("")) as ContractResult.Unavailable
        assertEquals("android.portrait.image", failed.diagnostics.single().code)
        assertEquals("keep me", portraits.current("a")!!.readText())
        assertEquals(listOf("a.png"), File(directory, "portraits").list()!!.toList())
    }

    @Test fun encoderCrashIsAFailureNotAnException() {
        val portraits = store { _, _, _ -> throw IllegalStateException("codec exploded") }
        val failed = portraits.save("a", bytes("x")) as ContractResult.Unavailable
        assertEquals("android.portrait.io", failed.diagnostics.single().code)
        assertNull(portraits.current("a"))
    }

    @Test fun oversizedSourceIsRejectedBeforeDecoding() {
        val portraits = store()
        val limit = PortraitStore.MAX_SOURCE_BYTES + 2L
        val huge = object : InputStream() {
            var served = 0L
            override fun read() = if (served++ < limit) 1 else -1
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                val count = minOf(length.toLong(), limit - served).toInt()
                if (count <= 0) {
                    return -1
                }
                served += count
                return count
            }
        }
        val failed = portraits.save("a", huge) as ContractResult.Unavailable
        assertEquals("android.portrait.large", failed.diagnostics.single().code)
        assertTrue(maxEdges.isEmpty())
        assertNull(portraits.current("a"))
    }

    @Test fun deleteRemovesOnlyThatCharactersPortrait() {
        val portraits = store()
        portraits.save("a", bytes("1"))
        portraits.save("b", bytes("2"))
        assertTrue(portraits.delete("a"))
        assertFalse(portraits.delete("a"))
        assertNull(portraits.current("a"))
        assertNotNull(portraits.current("b"))
    }

    @Test fun idsThatAreNotPlainFileNamesCannotEscapeTheDirectory() {
        val portraits = store()
        val ids = listOf("../../evil", "a/b", "..", "C:\\x", "")
        for (id in ids) {
            val saved = (portraits.save(id, bytes("x")) as ContractResult.Available).value
            assertEquals(File(directory, "portraits").canonicalFile, saved.canonicalFile.parentFile)
            assertEquals(saved, portraits.current(id))
        }
        assertNotEquals(portraits.fileFor("a/b"), portraits.fileFor("a_b"))
        assertEquals(ids.size, File(directory, "portraits").list()!!.size)
    }
}
