package dev.modern4e.builder

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.io.IOException
import java.time.LocalDate

/** Export file naming, the pre-report verification, and the session workflow around an [ExportTarget]. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CharacterExportTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore
    private val day = LocalDate.of(2026, 11, 19)
    private fun sample(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value
    private fun session(storage: CharacterStore = store) =
        BuilderSession(storage, AndroidContentSource(context.assets), ::sample).also { it.warmupSettleMillis = 0 }

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    /** A session with a freshly created, fully warmed character open. */
    private suspend fun openSession(storage: CharacterStore = store): BuilderSession {
        val model = session(storage)
        model.create()
        model.awaitWarmup()
        assertTrue(model.errors.isEmpty())
        return model
    }

    private fun named(name: String, level: Int = 5) = ExportFileName.of(level, name, day)
    private fun encode(document: CharacterDocument) = ContractCodec.encode(document).toByteArray(Charsets.UTF_8)
    private fun bonus(id: String) = BuilderEdit.Adjustment(ManualAdjustment(id, TypedModifier(
        ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 1), id))

    // ---- ExportFileName ----

    @Test fun fileNameHasLevelNameAndZeroPaddedDayFirstDate() {
        assertEquals("Level 5 Thorin Oakenshield 19-11-2026.json", ExportFileName.of(5, "Thorin Oakenshield", day))
        assertEquals("Level 12 Mira 05-01-2026.json", ExportFileName.of(12, "Mira", LocalDate.of(2026, 1, 5)))
        assertEquals("Level 1 Mira 01-02-0999.json", ExportFileName.of(1, "Mira", LocalDate.of(999, 2, 1)))
    }

    @Test fun fileNameStripsIllegalAndControlCharacters() {
        assertEquals("Level 5 ab 19-11-2026.json", named("a\\/:*?\"<>|b"))
        assertEquals("Level 5 Thorin 19-11-2026.json", named("Tho\u0000r\u0007i\tn\n"))
        assertEquals("Level 5 Thorin Oakenshield 19-11-2026.json", named("Thorin: Oakenshield"))
        // Stripping happens before whitespace is collapsed, so a removed character never leaves a double space behind.
        assertEquals("Level 5 a b 19-11-2026.json", named("a / b"))
    }

    @Test fun fileNameCollapsesRepeatedLeadingAndTrailingWhitespace() {
        assertEquals("Level 5 Thorin Oakenshield 19-11-2026.json", named("   Thorin \t  Oakenshield  "))
    }

    @Test fun fileNameCapsTheNamePartAtEightyCharacters() {
        assertEquals("Level 5 ${"x".repeat(80)} 19-11-2026.json", named("x".repeat(200)))
        assertEquals("Level 5 ${"x".repeat(80)} 19-11-2026.json", named("x".repeat(80)))
        assertEquals("Level 5 ${"x".repeat(79)} 19-11-2026.json", named("x".repeat(79)))
        // A cut that ends on a space does not leave a trailing space before the date.
        assertEquals("Level 5 ${"a".repeat(79)} 19-11-2026.json", named("a".repeat(79) + " " + "b".repeat(10)))
    }

    @Test fun fileNameCapNeverSplitsAnEmojiIntoALoneSurrogate() {
        val wizard = "🧙"
        assertEquals("Level 5 ${"a".repeat(79)}$wizard 19-11-2026.json", named("a".repeat(79) + wizard))
        assertEquals("Level 5 ${"a".repeat(79)}$wizard 19-11-2026.json", named("a".repeat(79) + wizard + "tail"))
        val name = named("a".repeat(80) + wizard)
        assertEquals("Level 5 ${"a".repeat(80)} 19-11-2026.json", name)
        assertFalse(name.any { Character.isSurrogate(it) })
    }

    @Test fun fileNameOfOnlyDotsAndSpacesFallsBack() {
        for (name in listOf(" . . ", ". .", "Thorin. .")) {
            val expected = if (name.startsWith("Thorin")) "Level 5 Thorin 19-11-2026.json" else "Level 5 Character 19-11-2026.json"
            assertEquals("'$name'", expected, named(name))
        }
    }

    @Test fun fileNameFallsBackToCharacterWhenNothingUsableRemains() {
        val fallback = "Level 5 Character 19-11-2026.json"
        for (name in listOf("", "   ", "\t\n", "\\/:*?\"<>|", " / : ", "...")) {
            assertEquals("'$name'", fallback, named(name))
        }
    }

    @Test fun fileNameTrimsTrailingDotsAndKeepsInnerOnes() {
        assertEquals("Level 5 Thorin 19-11-2026.json", named("Thorin..."))
        assertEquals("Level 5 Thorin 19-11-2026.json", named("Thorin. "))
        assertEquals("Level 5 Mr. Thorin 19-11-2026.json", named("Mr. Thorin"))
        assertEquals("Level 5 Thorin 19-11-2026.json", named("Thorin."))
    }

    @Test fun fileNameKeepsUnicodeNames() {
        assertEquals("Level 5 Þórin Eikinskjaldi 19-11-2026.json", named("Þórin Eikinskjaldi"))
        assertEquals("Level 5 勇者アレク 19-11-2026.json", named("勇者アレク"))
        assertEquals("Level 5 Zoë 🧙 19-11-2026.json", named("Zoë 🧙"))
    }

    // ---- ExportVerifier ----

    private fun assertRejected(result: ContractResult<Unit>) {
        assertTrue("Expected a rejection but got $result", result is ContractResult.Unavailable)
        assertTrue((result as ContractResult.Unavailable).diagnostics.first().message.isNotBlank())
    }

    @Test fun verifierAcceptsTheBundledCharacterFile() = runBlocking {
        val text = javaClass.classLoader!!.getResourceAsStream("character.json")!!.bufferedReader().use { it.readText() }
        val expected = (ContractCodec.decode(text) as ContractResult.Available).value
        assertTrue(ExportVerifier.verify(text.toByteArray(Charsets.UTF_8), expected) is ContractResult.Available)
    }

    @Test fun verifierAcceptsADocumentCreatedThroughTheSession() = runBlocking {
        val model = openSession()
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Zoë 🧙 \"Q\"")))
        val document = model.current!!.document
        assertTrue(ExportVerifier.verify(encode(document), document) is ContractResult.Available)
    }

    @Test fun verifierRejectsBytesThatDoNotDecodeOrImport() = runBlocking {
        val document = sample()
        val good = encode(document)
        assertRejected(ExportVerifier.verify(good + byteArrayOf(0xFF.toByte(), 0xFE.toByte()), document))
        assertRejected(ExportVerifier.verify(byteArrayOf(0xC3.toByte(), 0x28), document))
        assertRejected(ExportVerifier.verify("not json at all".toByteArray(), document))
        assertRejected(ExportVerifier.verify(ByteArray(0), document))
        assertRejected(ExportVerifier.verify("[]".toByteArray(), document))
        assertRejected(ExportVerifier.verify(good.copyOf(good.size / 2), document))
        assertRejected(ExportVerifier.verify(good.copyOf(good.size - 1), document))
        assertRejected(ExportVerifier.verify(
            String(good, Charsets.UTF_8).replaceFirst("{", "{\"surprise\":1,").toByteArray(Charsets.UTF_8), document))
    }

    @Test fun verifierRejectsAValidFileOfADifferentCharacter() = runBlocking {
        val document = sample()
        val renamed = document.copy(identity = document.identity.copy(name = document.identity.name + " II"))
        assertRejected(ExportVerifier.verify(encode(renamed), document))
        assertRejected(ExportVerifier.verify(encode(document.copy(id = "another-id")), document))
        assertRejected(ExportVerifier.verify(encode(document.copy(savedAt = "2000-01-01T00:00:00Z")), document))
    }

    @Test fun verifierNeverTouchesTheRealStorage() = runBlocking {
        val document = sample()
        assertTrue(store.save(document, SaveMode.CREATE) is ContractResult.Available)
        val journal = File(context.filesDir, "characters/store.json")
        val before = journal.readBytes()
        // The same id exists in the real store; a check against it would report a collision instead of a clean import.
        assertTrue(ExportVerifier.verify(encode(document), document) is ContractResult.Available)
        assertRejected(ExportVerifier.verify(encode(document.copy(identity = document.identity.copy(name = "Other"))), document))
        assertArrayEquals(before, journal.readBytes())
        assertEquals(listOf(document.id), (store.list() as ContractResult.Available).value.map { it.id })
        assertEquals(document, (store.load(document.id) as ContractResult.Available).value)
    }

    // ---- BuilderSession.export ----

    /** Records each call as an event and lets a test script every failure a real destination could have. */
    private class FakeTarget(override val confirmsWithMessage: Boolean, private val renamedTo: String? = null) : ExportTarget {
        val events = mutableListOf<String>()
        val writes = mutableListOf<Pair<String, ByteArray>>()
        var cancel = false
        var writeFailure: Exception? = null
        var readFailure: Exception? = null
        var discardFailure: Exception? = null
        var presentFailure: Exception? = null
        /** Turns the bytes handed to write() into what the destination later reads back. */
        var storedAs: (ByteArray) -> ByteArray = { it }
        /** While set, write() waits here after announcing itself on [entered]. */
        var gate: CompletableDeferred<Unit>? = null
        val entered = CompletableDeferred<Unit>()
        val reads get() = events.count { it == "read" }
        val discards get() = events.count { it == "discard" }
        val presents get() = events.count { it == "present" }

        override suspend fun write(fileName: String, bytes: ByteArray): ExportedFile? {
            events += "write"
            entered.complete(Unit)
            gate?.await()
            writeFailure?.let { throw it }
            if (cancel) {
                return null
            }
            writes += fileName to bytes.copyOf()
            return object : ExportedFile {
                override val displayName = renamedTo ?: fileName
                override suspend fun read(): ByteArray {
                    events += "read"
                    readFailure?.let { throw it }
                    return storedAs(bytes.copyOf())
                }
                override suspend fun discard() {
                    events += "discard"
                    discardFailure?.let { throw it }
                }
                override suspend fun present() {
                    events += "present"
                    presentFailure?.let { throw it }
                }
            }
        }
    }

    private fun assertQuiet(model: BuilderSession) {
        assertTrue(model.errors.isEmpty())
        assertFalse(model.exporting)
        assertFalse(model.busy)
    }

    @Test fun savedExportWritesTheEncodedDocumentAndReportsTheRealFileName() = runBlocking {
        val model = openSession()
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Thorin: Oakenshield")))
        val document = model.current!!.document
        val storedBefore = (store.load(document.id) as ContractResult.Available).value
        val journal = File(context.filesDir, "characters/store.json").readBytes()
        val target = FakeTarget(confirmsWithMessage = true)

        model.export(target, day)

        val (name, bytes) = target.writes.single()
        assertEquals("Level ${document.level} Thorin Oakenshield 19-11-2026.json", name)
        assertArrayEquals(encode(document), bytes)
        assertEquals(listOf("write", "read"), target.events)
        assertEquals("Exported $name", model.exportedMessage)
        assertNull(model.exportFailure)
        assertQuiet(model)
        // The open character and its stored copy are untouched by exporting.
        assertSame(document, model.current!!.document)
        assertEquals(storedBefore, (store.load(document.id) as ContractResult.Available).value)
        assertArrayEquals(journal, File(context.filesDir, "characters/store.json").readBytes())
    }

    @Test fun theMessageNamesTheFileTheDestinationReallyHasEvenWhenRenamed() = runBlocking {
        val model = openSession()
        val target = FakeTarget(confirmsWithMessage = true, renamedTo = "My Hero (1).json")
        model.export(target, day)
        assertNotEquals("My Hero (1).json", target.writes.single().first)
        assertEquals("Exported My Hero (1).json", model.exportedMessage)
        assertNull(model.exportFailure)
    }

    @Test fun exportedBytesImportIntoAFreshStoreAsTheSameCharacter() = runBlocking {
        val model = openSession()
        model.edit(bonus("round-trip"))
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Zoë 🧙 \"Q\"", notes = "line1\nline2")))
        val document = model.current!!.document
        val target = FakeTarget(confirmsWithMessage = true)
        model.export(target, day)
        assertNull(model.exportFailure)

        File(context.filesDir, "characters").deleteRecursively()
        val fresh = AndroidCharacterStore(context)
        assertTrue((fresh.list() as ContractResult.Available).value.isEmpty())
        val importer = CharacterImporter(fresh) { "unused" }
        val text = String(target.writes.single().second, Charsets.UTF_8)
        val preview = (importer.inspect(text) as ContractResult.Available).value
        assertNull(preview.existing)
        assertEquals(document, preview.incoming)
        assertTrue(importer.commit(preview, ImportAction.IMPORT) is ContractResult.Available)
        assertEquals(document, (fresh.load(document.id) as ContractResult.Available).value)
    }

    @Test fun sharedExportPresentsTheCheckedFileExactlyOnceAndShowsNoMessage() = runBlocking {
        val model = openSession()
        val target = FakeTarget(confirmsWithMessage = false)
        model.export(target, day)
        assertEquals("Present follows the read-back check and happens once", listOf("write", "read", "present"), target.events)
        assertNull(model.exportedMessage)
        assertNull(model.exportFailure)
        assertQuiet(model)
    }

    @Test fun cancellingWritesNothingAndReportsNothing() = runBlocking {
        val model = openSession()
        for (confirms in listOf(true, false)) {
            val target = FakeTarget(confirmsWithMessage = confirms).also { it.cancel = true }
            model.export(target, day)
            assertEquals(listOf("write"), target.events)
            assertNull(model.exportedMessage)
            assertNull(model.exportFailure)
            assertQuiet(model)
        }
    }

    @Test fun aFileThatReadsBackWrongIsDiscardedNeverPresentedAndFailsWithoutBlockingTheSession() = runBlocking {
        val model = openSession()
        val document = model.current!!.document
        val variants = mapOf<String, (ByteArray) -> ByteArray>(
            "truncated" to { it.copyOf(it.size / 2) },
            "empty" to { ByteArray(0) },
            "tampered" to { it.copyOf().also { copy -> copy[copy.lastIndex] = 'X'.code.toByte() } },
            "invalid utf-8" to { it + byteArrayOf(0xFF.toByte()) },
            "other character" to { encode(document.copy(identity = document.identity.copy(name = "Someone Else"))) },
        )
        for ((label, corrupt) in variants) {
            for (confirms in listOf(true, false)) {
                val target = FakeTarget(confirmsWithMessage = confirms).also { it.storedAs = corrupt }
                model.exportedMessage = null
                model.export(target, day)
                assertEquals("$label confirms=$confirms", listOf("write", "read", "discard"), target.events)
                assertFalse(label, model.exportFailure.isNullOrBlank())
                assertNull(label, model.exportedMessage)
                assertQuiet(model)
            }
        }
        // A failed check is not a storage error: the session keeps working and the next export succeeds.
        model.edit(bonus("after-failure"))
        assertTrue(model.canExport)
        val good = FakeTarget(confirmsWithMessage = true)
        model.export(good, day)
        assertNull(model.exportFailure)
        assertEquals("Exported ${good.writes.single().first}", model.exportedMessage)
        assertEquals(listOf("after-failure"), model.current!!.document.manualAdjustments.map { it.id })
    }

    @Test fun aSuccessfulExportClearsTheEarlierFailure() = runBlocking {
        val model = openSession()
        model.export(FakeTarget(true).also { it.writeFailure = IOException("Disk full") }, day)
        assertEquals("Disk full", model.exportFailure)
        model.export(FakeTarget(true), day)
        assertNull(model.exportFailure)
        assertNotNull(model.exportedMessage)
    }

    @Test fun aFailedWriteIsShownLeavesNoFileToDiscardAndKeepsErrorsEmpty() = runBlocking {
        val model = openSession()
        val target = FakeTarget(confirmsWithMessage = true).also { it.writeFailure = IOException("Disk full") }
        model.run { export(target, day) }
        assertEquals("Disk full", model.exportFailure)
        assertEquals(listOf("write"), target.events)
        assertNull(model.exportedMessage)
        assertQuiet(model)

        val silent = FakeTarget(confirmsWithMessage = false).also { it.writeFailure = IllegalStateException() }
        model.export(silent, day)
        assertEquals("The file could not be exported.", model.exportFailure)
        assertEquals(listOf("write"), silent.events)
        assertQuiet(model)
    }

    @Test fun aFailedReadBackDiscardsTheFileAndReportsTheReadFailure() = runBlocking {
        val model = openSession()
        val target = FakeTarget(confirmsWithMessage = true).also { it.readFailure = IOException("Provider went away") }
        model.export(target, day)
        assertEquals("Provider went away", model.exportFailure)
        assertEquals(listOf("write", "read", "discard"), target.events)
        assertNull(model.exportedMessage)
        assertQuiet(model)
    }

    @Test fun aDiscardThatFailsNeverReplacesTheOriginalFailure() = runBlocking {
        val model = openSession()
        val unreadable = FakeTarget(confirmsWithMessage = true).also {
            it.readFailure = IOException("Provider went away")
            it.discardFailure = IOException("Cannot delete")
        }
        model.export(unreadable, day)
        assertEquals("Provider went away", model.exportFailure)
        assertEquals(1, unreadable.discards)

        val corrupted = FakeTarget(confirmsWithMessage = false).also {
            it.storedAs = { bytes -> bytes.copyOf(bytes.size / 2) }
            it.discardFailure = IOException("Cannot delete")
        }
        model.exportFailure = null
        model.export(corrupted, day)
        assertFalse(model.exportFailure.isNullOrBlank())
        assertNotEquals("Cannot delete", model.exportFailure)
        assertEquals(listOf("write", "read", "discard"), corrupted.events)
        assertQuiet(model)
    }

    @Test fun aSharePresentationThatFailsDiscardsTheFileAndReportsTheFailure() = runBlocking {
        val model = openSession()
        val target = FakeTarget(confirmsWithMessage = false).also { it.presentFailure = IllegalStateException("No app can share this") }
        model.export(target, day)
        assertEquals("No app can share this", model.exportFailure)
        assertEquals(listOf("write", "read", "present", "discard"), target.events)
        assertNull(model.exportedMessage)
        assertQuiet(model)
    }

    @Test fun exportingWithNoOpenCharacterDoesNothing() = runBlocking {
        val model = session()
        val target = FakeTarget(confirmsWithMessage = true)
        assertFalse(model.canExport)
        model.export(target, day)
        model.run { export(target, day) }
        assertTrue(target.events.isEmpty())
        assertNull(model.exportedMessage)
        assertNull(model.exportFailure)
        assertQuiet(model)
    }

    @Test fun exportBlocksTheScreenWhileTheTargetIsWriting() = runBlocking {
        val model = openSession()
        assertTrue(model.canExport)
        val target = FakeTarget(confirmsWithMessage = true).also { it.gate = CompletableDeferred() }
        val running = launch(Dispatchers.Default) { model.run { export(target, day) } }
        target.entered.await()
        assertTrue(model.exporting)
        assertTrue("The run holds the screen busy", model.busy)
        assertFalse(model.canExport)
        assertNull(model.exportedMessage)
        target.gate!!.complete(Unit)
        running.join()
        assertQuiet(model)
        assertTrue(model.canExport)
        assertEquals("Exported ${target.writes.single().first}", model.exportedMessage)
    }

    @Test fun exportAfterQueuedEditsWaitsForThemAndContainsTheLatestChoice() = runBlocking {
        val storage = GatedSave(store)
        val model = openSession(storage)
        storage.blocking = true
        model.submitEdit(bonus("late"))
        assertFalse(model.canExport)
        val target = FakeTarget(confirmsWithMessage = true)
        val running = launch(Dispatchers.Default) { model.run { export(target, day) } }
        storage.entered.await()
        delay(100)
        assertTrue("Nothing is written while an edit is still being stored", target.events.isEmpty())
        storage.gate.complete(Unit)
        running.join()
        val exported = (ContractCodec.decode(String(target.writes.single().second, Charsets.UTF_8)) as ContractResult.Available).value
        assertEquals(listOf("late"), exported.manualAdjustments.map { it.id })
        assertEquals(model.current!!.document, exported)
        assertNull(model.exportFailure)
        assertQuiet(model)
    }

    /** A store whose saves wait at [gate] once [blocking] is set. */
    private class GatedSave(private val real: CharacterStore) : CharacterStore by real {
        @Volatile var blocking = false
        val gate = CompletableDeferred<Unit>()
        val entered = CompletableDeferred<Unit>()
        override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> {
            if (blocking) {
                entered.complete(Unit)
                gate.await()
            }
            return real.save(document, mode, expected)
        }
    }

    @Test fun returningHomeClearsEveryExportState() = runBlocking {
        val model = openSession()
        model.exportChoice = true
        model.export(FakeTarget(true).also { it.writeFailure = IOException("Disk full") }, day)
        model.exportedMessage = "Exported something.json"
        assertTrue(model.exportChoice)
        assertNotNull(model.exportFailure)
        model.returnHomeAfterError()
        assertFalse(model.exportChoice)
        assertNull(model.exportFailure)
        assertNull(model.exportedMessage)
        assertFalse(model.exporting)
    }
}
