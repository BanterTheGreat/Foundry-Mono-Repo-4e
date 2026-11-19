package dev.modern4e.builder

import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.junit.runner.RunWith
import java.io.File
import kotlin.coroutines.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** Shared store behavioral contract, running on real Android private files. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidAdaptersJvmTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var original: CharacterDocument
    private fun <T> value(result: ContractResult<T>): T {
        check(result is ContractResult.Available) { result.toString() }
        return result.value
    }
    private fun run(block: suspend () -> Unit) {
        var completed = false
        var failure: Throwable? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                completed = true
                failure = result.exceptionOrNull()
            }
        })
        assertTrue(completed)
        failure?.let { throw it }
    }
    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        original = value(ContractCodec.decode(javaClass.classLoader!!.getResourceAsStream("character.json")!!.bufferedReader().use { it.readText() }))
    }
    @Test fun storageImportAndRecoveryContract() = run {
        val store = AndroidCharacterStore(context)
        assertTrue(value(store.list()).isEmpty())
        assertTrue(store.load(original.id) is ContractResult.Unavailable)
        value(store.save(original, SaveMode.CREATE))
        assertTrue(store.save(original, SaveMode.CREATE) is ContractResult.Unavailable)
        val changed = original.copy(identity = original.identity.copy(name = "Replacement"))
        val importer = CharacterImporter(store) { "copy-id" }
        val preview = value(importer.inspect(ContractCodec.encode(changed)))
        value(importer.commit(preview, ImportAction.CANCEL))
        assertEquals(original, value(store.load(original.id)))
        value(importer.commit(preview, ImportAction.COPY))
        assertEquals(changed.copy(id = "copy-id"), value(store.load("copy-id")))
        value(importer.commit(preview, ImportAction.REPLACE))
        val reopened = AndroidCharacterStore(context)
        assertEquals(changed, value(reopened.load(original.id)))
        assertEquals(2, value(reopened.list()).size)
        assertTrue(reopened.save(original, SaveMode.REPLACE_WITH_RECOVERY, original) is ContractResult.Unavailable)
        val backup = value(reopened.listRecovery(original.id)).single()
        assertEquals(original, value(reopened.loadRecovery(backup.recoveryId)))
        val restorer = CharacterImporter(reopened) { "restored" }
        value(restorer.commit(value(restorer.inspectRecovery(backup.recoveryId)), ImportAction.REPLACE))
        assertEquals(original, value(reopened.load(original.id)))
        assertEquals(2, value(reopened.listRecovery(original.id)).size)
        assertTrue(value(reopened.delete(original.id)))
        assertFalse(value(reopened.delete(original.id)))
        assertEquals(original, value(reopened.loadRecovery(backup.recoveryId)))
    }
    @Test fun failedAndInterruptedReplacementRetainsGoodSave() = run {
        val store = AndroidCharacterStore(context)
        value(store.save(original, SaveMode.CREATE))
        val changed = original.copy(identity = original.identity.copy(name = "Uncommitted"))
        val failing = AndroidCharacterStore(context) { throw java.io.IOException("Injected failure") }
        assertTrue(failing.save(changed, SaveMode.REPLACE_WITH_RECOVERY, original) is ContractResult.Unavailable)
        assertEquals(original, value(AndroidCharacterStore(context).load(original.id)))
        assertTrue(value(store.listRecovery(original.id)).isEmpty())
        File(context.filesDir, "characters/store.pending").writeText("interrupted")
        assertEquals(original, value(AndroidCharacterStore(context).load(original.id)))
    }
    @Test fun ioMalformedAndCancellationFailures() = run {
        val directory = File(context.filesDir, "characters")
        directory.writeText("cannot be a directory")
        assertTrue(AndroidCharacterStore(context).save(original, SaveMode.CREATE) is ContractResult.Unavailable)
        directory.delete()
        directory.mkdirs()
        File(directory, "store.json").writeText("malformed")
        assertTrue(AndroidCharacterStore(context).list() is ContractResult.Unavailable)
        val exchange = AndroidFileExchange(context.contentResolver, { null }, { null })
        assertNull(value(exchange.receive()))
        assertTrue(exchange.deliver(ExchangeFile("hero.json", ContractCodec.encode(original))) is ContractResult.Unavailable)
        assertTrue(exchange.deliver(ExchangeFile("bad.json", "{}")) is ContractResult.Unavailable)
        val denied = AndroidFileExchange(context.contentResolver, { throw SecurityException("denied") }, { throw SecurityException("denied") })
        assertTrue(denied.receive() is ContractResult.Unavailable)
        assertTrue(denied.deliver(ExchangeFile("hero.json", ContractCodec.encode(original))) is ContractResult.Unavailable)
    }
    @Test fun generatedPackagesLoadWithoutAndroidInterpretation() = run {
        val source = AndroidContentSource(context.assets)
        val manifests = value(source.listPackages())
        assertEquals(setOf("modern4e.classes", "modern4e.ancestries",
            "modern4e.themes", "modern4e.feats", "modern4e.utilities", "modern4e.equipment", "modern4e.paths"), manifests.map { it.id }.toSet())
        for (manifest in manifests) {
            for (index in manifest.indexes) {
                assertTrue(value(source.loadIndex(manifest.id, index)).entries.isNotEmpty())
            }
            for (chunk in manifest.chunks) {
                assertEquals(chunk, value(source.loadChunk(manifest.id, chunk)).id)
            }
        }
        assertTrue(source.loadChunk("..", "missing") is ContractResult.Unavailable)
        assertTrue(source.loadIndex("modern4e.classes", "missing") is ContractResult.Unavailable)
        assertEquals(original, value(ContractCodec.decode(ContractCodec.encode(original))))
    }
    @Test fun fileExchangeRoundTripAndCloseFailure() = run {
        val uri = android.net.Uri.parse("content://test/hero.json")
        val resolver = context.contentResolver
        val shadow = org.robolectric.Shadows.shadowOf(resolver)
        val bytes = java.io.ByteArrayOutputStream()
        shadow.registerOutputStream(uri, bytes)
        val exchange = AndroidFileExchange(resolver, { uri }, { uri })
        value(exchange.deliver(ExchangeFile("hero.json", ContractCodec.encode(original))))
        shadow.registerInputStream(uri, java.io.ByteArrayInputStream(bytes.toByteArray()))
        val received = value(exchange.receive())!!
        assertEquals(original, value(ContractCodec.decode(received.json)))
        val store = AndroidCharacterStore(context)
        val importer = CharacterImporter(store) { "copied" }
        value(importer.commit(value(importer.inspect(received.json)), ImportAction.IMPORT))
        assertEquals(original, value(store.load(original.id)))
        shadow.registerOutputStream(uri, object : java.io.ByteArrayOutputStream() {
            override fun close() { throw java.io.IOException("Provider close failed") }
        })
        assertTrue(exchange.deliver(ExchangeFile("hero.json", received.json)) is ContractResult.Unavailable)
    }

}
