package dev.modern4e.builder

import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Recovery navigation and explicit restore decisions against the real private journal. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RecoverySessionTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore
    private lateinit var original: CharacterDocument

    private fun <T> value(result: ContractResult<T>): T {
        check(result is ContractResult.Available) { result.toString() }
        return result.value
    }

    private fun session(storage: CharacterStore = store) =
        BuilderSession(storage, AndroidContentSource(context.assets)) { original }.also { it.listings.close() }

    @Before
    fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
        original = value(ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
            .readText(Charsets.UTF_8))).copy(savedAt = "${LocalDate.now()}T09:00:00Z")
    }

    /** Creates a recovery without loading the character's rules into a session. */
    private suspend fun replace(document: CharacterDocument, name: String, hour: Int): CharacterDocument {
        val changed = document.copy(identity = document.identity.copy(name = name),
            savedAt = "${LocalDate.now()}T${hour.toString().padStart(2, '0')}:00:00Z")
        value(store.save(changed, SaveMode.REPLACE_WITH_RECOVERY, document))
        return changed
    }

    @Test
    fun mainMenuDiscoveryShowsOneDailyCopyPerCharacterIncludingDeletedCharacters() = runBlocking {
        value(store.save(original, SaveMode.CREATE))
        val edited = replace(original, "Morning edit", 10)
        replace(edited, "Latest edit", 11)
        val deleted = original.copy(id = "deleted-character", identity = original.identity.copy(name = "Deleted hero"))
        value(store.save(deleted, SaveMode.CREATE))
        replace(deleted, "Deleted latest", 12)
        value(store.delete(deleted.id))

        val model = session()
        model.openRecoveries()

        assertEquals("recovery", model.page)
        assertTrue(model.errors.isEmpty())
        val copies = model.recoveries!!
        assertEquals(2, copies.size)
        assertEquals(setOf(original.id, deleted.id), copies.map { it.character.id }.toSet())
        assertEquals("Morning edit", copies.single { it.character.id == original.id }.character.name)
        assertEquals("Deleted hero", copies.single { it.character.id == deleted.id }.character.name)
        model.navigateBack()
        assertEquals("home", model.page)
        // Left set, the copies would reappear as the recovery dialog over Home.
        assertNull(model.recoveries)
    }

    @Test
    fun emptyRecoveryHistoryStillOpensTheRecoveryScreen() = runBlocking {
        val model = session()
        model.openRecoveries()
        assertEquals("recovery", model.page)
        assertEquals(emptyList<RecoverySummary>(), model.recoveries)
        assertTrue(model.errors.isEmpty())
    }

    @Test
    fun reviewingAndCancellingRecoveryLeavesTheLiveCharacterAndListUntouched() = runBlocking {
        value(store.save(original, SaveMode.CREATE))
        val changed = replace(original, "Current hero", 10)
        val model = session()
        model.openRecoveries()
        val copies = model.recoveries
        model.recover(copies!!.single().recoveryId)

        assertEquals(original, model.preview!!.incoming)
        assertEquals(changed, model.preview!!.existing)
        assertTrue(ImportAction.REPLACE in model.preview!!.actions)
        assertEquals(changed, value(store.load(original.id)))
        model.import(ImportAction.CANCEL)

        assertNull(model.preview)
        assertEquals("recovery", model.page)
        assertEquals(copies, model.recoveries)
        assertEquals(changed, value(store.load(original.id)))
    }

    @Test
    fun replacingFromRecoveryRestoresTheSaveAndProtectsTheReplacedCharacter() = runBlocking {
        value(store.save(original, SaveMode.CREATE))
        val changed = replace(original, "Current hero", 10)
        val model = session()
        model.openRecoveries()
        model.recover(model.recoveries!!.single().recoveryId)
        model.import(ImportAction.REPLACE)

        assertTrue(model.errors.isEmpty())
        assertEquals(original, value(store.load(original.id)))
        assertEquals("library", model.page)
        assertNull(model.recoveries)
        assertNull(model.preview)
        assertEquals(original.summary(), model.characters.single())
        assertTrue(value(store.listRecovery(original.id)).any {
            value(store.loadRecovery(it.recoveryId)) == changed
        })
    }

    @Test
    fun recoveringAsCopyPreservesTheExistingCharacter() = runBlocking {
        value(store.save(original, SaveMode.CREATE))
        val changed = replace(original, "Current hero", 10)
        val model = session()
        model.openRecoveries()
        model.recover(model.recoveries!!.single().recoveryId)
        model.import(ImportAction.COPY)

        assertTrue(model.errors.isEmpty())
        assertEquals(changed, value(store.load(original.id)))
        val copied = value(store.list()).single { it.id != original.id }
        assertEquals(original.copy(id = copied.id), value(store.load(copied.id)))
        assertEquals("library", model.page)
        assertEquals(2, model.characters.size)
    }

    @Test
    fun deletedCharacterCanBeRecoveredThroughTheImportDecision() = runBlocking {
        value(store.save(original, SaveMode.CREATE))
        replace(original, "Last live version", 10)
        value(store.delete(original.id))
        val model = session()
        model.openRecoveries()
        model.recover(model.recoveries!!.single().recoveryId)

        assertNull(model.preview!!.existing)
        assertTrue(ImportAction.IMPORT in model.preview!!.actions)
        model.import(ImportAction.IMPORT)

        assertEquals(original, value(store.load(original.id)))
        assertEquals("library", model.page)
        assertTrue(model.errors.isEmpty())
    }

    @Test
    fun failedDiscoveryReportsAnOperationalErrorWithoutOpeningAnEmptyScreen() = runBlocking {
        val diagnostic = Diagnostic("test.recovery", DiagnosticKind.IO_FAILURE, "Cannot read journal")
        val failed = object : CharacterStore by store {
            override suspend fun listAllRecovery(): ContractResult<List<RecoverySummary>> =
                ContractResult.Unavailable(listOf(diagnostic))
        }
        val model = session(failed)
        model.openRecoveries()

        assertEquals("home", model.page)
        assertNull(model.recoveries)
        assertEquals(listOf(diagnostic), model.errors)
    }
}
