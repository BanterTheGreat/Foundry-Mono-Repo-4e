package dev.modern4e.builder

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.File

/** A portrait is device-local: choosing, importing, exporting and deleting characters must respect that. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PortraitSessionTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore
    private lateinit var portraits: PortraitStore
    private val journal get() = File(context.filesDir, "characters/store.json")
    private fun sample(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value
    private fun session() = BuilderSession(store, AndroidContentSource(context.assets), portraits, ::sample).also { it.listings.settleMillis = 0 }
    private fun choosing(text: String?) = PortraitChooser { text?.let { ByteArrayInputStream(it.toByteArray()) } }
    private val files get() = File(context.filesDir, "portraits").list().orEmpty().toSet()

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        File(context.filesDir, "portraits").deleteRecursively()
        store = AndroidCharacterStore(context)
        portraits = PortraitStore(File(context.filesDir, "portraits")) { source, _, target -> target.write(source) }
    }

    @Test fun choosingAPortraitStoresItForTheOpenCharacterWithoutTouchingSavedData() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        val before = journal.readBytes()
        val documentBefore = model.current!!.document
        val revision = model.portraitRevision
        assertNull(model.portrait(id))
        model.choosePortrait(choosing("face"))
        assertEquals("face", model.portrait(id)!!.readText())
        assertTrue(model.portraitRevision > revision)
        assertNull(model.notice)
        // Nothing about the character, its saved JSON or its export changed.
        assertArrayEquals(before, journal.readBytes())
        assertEquals(documentBefore, model.current!!.document)
        assertFalse(ContractCodec.encode(model.current!!.document).contains("portrait", ignoreCase = true))
        assertEquals(setOf("$id.png"), files)
    }

    @Test fun cancellingChangesNothingAndUnusableFilesAreReported() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        model.choosePortrait(choosing("keep"))
        val revision = model.portraitRevision
        model.choosePortrait(choosing(null))
        assertEquals(revision, model.portraitRevision)
        assertNull(model.notice)
        model.choosePortrait { throw java.io.IOException("Provider went away") }
        assertEquals("Provider went away", model.notice)
        assertEquals("keep", model.portrait(id)!!.readText())
        model.notice = null
        model.choosePortrait(choosing("replacement"))
        assertEquals("replacement", model.portrait(id)!!.readText())
    }

    @Test fun importingNeverCarriesAPortraitInOrErasesOrReplacesOne() = runBlocking {
        val model = session()
        val original = sample()
        model.inspect(ContractCodec.encode(original))
        model.import(ImportAction.IMPORT)
        // An imported character starts without a portrait.
        assertNull(portraits.current(original.id))
        portraits.save(original.id, ByteArrayInputStream("mine".toByteArray()))
        model.inspect(ContractCodec.encode(original.copy(identity = CharacterIdentity("Replacement"))))
        model.import(ImportAction.REPLACE)
        assertEquals("Replacement", (store.load(original.id) as ContractResult.Available).value.identity.name)
        assertEquals("mine", portraits.current(original.id)!!.readText())
        // Copies get a new id and no portrait; the original keeps its own.
        model.inspect(ContractCodec.encode(original))
        model.import(ImportAction.COPY)
        val copy = model.characters.single { it.id != original.id }
        assertNull(portraits.current(copy.id))
        assertEquals("mine", portraits.current(original.id)!!.readText())
        assertEquals(setOf("${original.id}.png"), files)
    }

    @Test fun exportedDocumentIsIdenticalWithOrWithoutAPortrait() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        val without = ContractCodec.encode((store.load(id) as ContractResult.Available).value)
        model.choosePortrait(choosing("face"))
        val with = ContractCodec.encode((store.load(id) as ContractResult.Available).value)
        assertEquals(without, with)
    }

    @Test fun deletingACharacterDeletesItsPortraitOnly() = runBlocking {
        val model = session()
        model.create()
        val first = model.current!!.document.id
        model.choosePortrait(choosing("one"))
        model.create()
        val second = model.current!!.document.id
        model.choosePortrait(choosing("two"))
        assertEquals(setOf("$first.png", "$second.png"), files)
        model.requestDeletion(model.characters.single { it.id == first })
        model.confirmDeletion()
        assertEquals(setOf("$second.png"), files)
        assertNull(model.portrait(first))
        assertEquals("two", model.portrait(second)!!.readText())
    }

    @Test fun failedDeletionKeepsThePortrait() = runBlocking {
        val failing = object : CharacterStore by store {
            override suspend fun delete(id: String): ContractResult<Boolean> =
                ContractResult.Unavailable(listOf(Diagnostic("test.delete", DiagnosticKind.IO_FAILURE, "Cannot delete")))
        }
        val model = BuilderSession(failing, AndroidContentSource(context.assets), portraits, ::sample)
        model.create()
        val id = model.current!!.document.id
        model.choosePortrait(choosing("keep"))
        model.requestDeletion(model.characters.single())
        model.confirmDeletion()
        assertEquals("keep", portraits.current(id)!!.readText())
    }
}
