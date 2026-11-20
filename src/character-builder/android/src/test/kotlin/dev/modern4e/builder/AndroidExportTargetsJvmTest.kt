package dev.modern4e.builder

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Document provider backed by cache files; deletes through the documents `call` protocol and names files plainly. */
open class FileBackedDocumentProvider : ContentProvider() {
    private fun root() = File(context!!.cacheDir, "test-documents").apply { mkdirs() }
    protected fun fileOf(uri: Uri) = File(root(), uri.lastPathSegment!!)
    protected open fun displayNameOf(name: String): String = name
    protected open val supportsDelete = true
    protected open val opensFiles = true
    protected open val reportsNames = true

    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        if (!opensFiles) {
            return null
        }
        return ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.parseMode(mode))
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, order: String?): Cursor? {
        val file = fileOf(uri)
        if (!reportsNames || !file.exists()) {
            return null
        }
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME)).apply { addRow(arrayOf(displayNameOf(file.name))) }
    }

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        if (method != "android:deleteDocument" || !supportsDelete) {
            throw UnsupportedOperationException("Unsupported method $method")
        }
        @Suppress("DEPRECATION")
        val uri = extras!!.getParcelable<Uri>("uri")!!
        fileOf(uri).delete()
        return Bundle()
    }

    override fun getType(uri: Uri): String? = "application/json"
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?) = 0
}

/** Provider that renames every document, like a destination that rewrites the suggested file name. */
class RenamingDocumentProvider : FileBackedDocumentProvider() {
    override fun displayNameOf(name: String) = "Renamed $name"
}

/** Provider that cannot delete documents, so discard has to empty them instead. */
class NoDeleteDocumentProvider : FileBackedDocumentProvider() {
    override val supportsDelete = false
}

/** Provider that gives out no stream at all, as a broken document provider can. */
class NoStreamDocumentProvider : FileBackedDocumentProvider() {
    override val opensFiles = false
}

/** Provider that cannot say what a document is called. */
class NoNameDocumentProvider : FileBackedDocumentProvider() {
    override val reportsNames = false
}

/** Export targets against fake Android storage: native documents and the share sheet's cache file. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidExportTargetsJvmTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var original: CharacterDocument
    private val authority = "dev.modern4e.test.documents"
    private val fileName = "Level 5 Thorin Oakenshield 19-11-2026.json"

    @Before fun reset() {
        File(context.cacheDir, "test-documents").deleteRecursively()
        AndroidShareExportTarget.exportDirectory(context).deleteRecursively()
        val json = javaClass.classLoader!!.getResourceAsStream("character.json")!!.bufferedReader().use { it.readText() }
        original = (ContractCodec.decode(json) as ContractResult.Available).value
    }

    /** Stands in for FileProvider, which cannot map Windows cache paths on the JVM; the manifest test covers its declaration. */
    private fun cacheUri(file: File): Uri = Uri.parse("content://${context.packageName}.exports/exports/${Uri.encode(file.name)}")

    private fun documentUri(name: String = fileName): Uri = Uri.parse("content://$authority/document/${Uri.encode(name)}")

    private fun <T : ContentProvider> provider(type: Class<T>, name: String = authority): T =
        Robolectric.buildContentProvider(type).create(name).get()

    private fun documentFile(name: String = fileName) = File(File(context.cacheDir, "test-documents"), name)

    private fun saveTarget(picked: Uri? = documentUri()) = AndroidSaveExportTarget(context.contentResolver) { picked }

    @Test fun saveTargetWritesExactUtf8BytesAndReadsThemBack() = runBlocking {
        provider(FileBackedDocumentProvider::class.java)
        val bytes = "{\"name\":\"Thorin Öakenshield ⚔\"}".toByteArray(Charsets.UTF_8)
        var suggested: String? = null
        val target = AndroidSaveExportTarget(context.contentResolver) { suggested = it; documentUri(it) }
        assertTrue(target.confirmsWithMessage)
        val file = target.write(fileName, bytes)!!
        assertEquals(fileName, suggested)
        assertEquals(fileName, file.displayName)
        assertArrayEquals(bytes, documentFile().readBytes())
        assertArrayEquals(bytes, file.read())
        file.present()
    }

    @Test fun saveTargetReportsTheProvidersRealName() = runBlocking {
        provider(RenamingDocumentProvider::class.java)
        val file = saveTarget().write(fileName, "{}".toByteArray())!!
        assertEquals("Renamed $fileName", file.displayName)
    }

    @Test fun saveTargetFallsBackToTheSuggestedNameWhenTheProviderCannotSayIt() = runBlocking {
        provider(NoNameDocumentProvider::class.java)
        val file = saveTarget().write(fileName, "{}".toByteArray())!!
        assertEquals(fileName, file.displayName)
    }

    @Test fun cancelledPickerWritesNothing() = runBlocking {
        provider(FileBackedDocumentProvider::class.java)
        assertNull(saveTarget(null).write(fileName, "{}".toByteArray()))
        assertFalse(documentFile().exists())
    }

    @Test fun providerWithoutAnOutputStreamFailsWithAMessage() = runBlocking {
        provider(NoStreamDocumentProvider::class.java)
        try {
            saveTarget().write(fileName, "{}".toByteArray())
            fail("Expected a failure")
        } catch (error: IllegalStateException) {
            assertEquals("Document provider returned no stream", error.message)
        }
    }

    @Test fun failingCloseIsNotReportedAsSuccess() = runBlocking {
        val uri = Uri.parse("content://test/hero.json")
        org.robolectric.Shadows.shadowOf(context.contentResolver).registerOutputStream(uri, object : java.io.ByteArrayOutputStream() {
            override fun close() {
                throw java.io.IOException("Provider close failed")
            }
        })
        try {
            saveTarget(uri).write(fileName, "{}".toByteArray())
            fail("Expected a failure")
        } catch (error: java.io.IOException) {
            assertEquals("Provider close failed", error.message)
        }
    }

    @Test fun throwingPickerPropagates() = runBlocking {
        val target = AndroidSaveExportTarget(context.contentResolver) { throw SecurityException("denied") }
        try {
            target.write(fileName, "{}".toByteArray())
            fail("Expected a failure")
        } catch (error: SecurityException) {
            assertEquals("denied", error.message)
        }
    }

    @Test fun discardRemovesTheWrittenDocument() = runBlocking {
        provider(FileBackedDocumentProvider::class.java)
        val file = saveTarget().write(fileName, "{}".toByteArray())!!
        assertTrue(documentFile().exists())
        file.discard()
        assertFalse(documentFile().exists())
    }

    @Test fun discardEmptiesTheDocumentWhenDeletionIsUnsupported() = runBlocking {
        provider(NoDeleteDocumentProvider::class.java)
        val file = saveTarget().write(fileName, "{\"keep\":false}".toByteArray())!!
        file.discard()
        assertTrue(documentFile().exists())
        assertEquals(0L, documentFile().length())
    }

    @Test fun shareTargetWritesToTheCacheAndBuildsAChooser() = runBlocking {
        val shared = mutableListOf<Intent>()
        val target = AndroidShareExportTarget(context, { shared += it }, ::cacheUri)
        assertFalse(target.confirmsWithMessage)
        val bytes = "{\"hero\":true}".toByteArray(Charsets.UTF_8)
        val file = target.write(fileName, bytes)!!
        val stored = File(File(context.cacheDir, "exports"), fileName)
        assertEquals(fileName, file.displayName)
        assertArrayEquals(bytes, stored.readBytes())
        assertArrayEquals(bytes, file.read())
        assertTrue(shared.isEmpty())

        file.present()
        val chooser = shared.single()
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        assertTrue(chooser.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        @Suppress("DEPRECATION")
        val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("application/json", send.type)
        assertEquals(fileName, send.getStringExtra(Intent.EXTRA_SUBJECT))
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        @Suppress("DEPRECATION")
        val stream = send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
        assertEquals("content", stream.scheme)
        assertEquals("${context.packageName}.exports", stream.authority)
        assertEquals("/exports/$fileName", Uri.decode(stream.path))
        assertEquals(fileName, stream.lastPathSegment)
    }

    @Test fun manifestDeclaresAPrivateFileProviderForExports() {
        val info = context.packageManager.resolveContentProvider("${context.packageName}.exports", android.content.pm.PackageManager.GET_META_DATA)!!
        assertEquals("androidx.core.content.FileProvider", info.name)
        assertFalse(info.exported)
        assertTrue(info.grantUriPermissions)
        assertTrue(info.metaData.containsKey("android.support.FILE_PROVIDER_PATHS"))
    }

    @Test fun shareFromAnActivityDoesNotForceANewTask() = runBlocking {
        val activity = Robolectric.buildActivity(androidx.activity.ComponentActivity::class.java).create().get()
        val shared = mutableListOf<Intent>()
        AndroidShareExportTarget(activity, { shared += it }, ::cacheUri).write(fileName, "{}".toByteArray())!!.present()
        assertEquals(0, shared.single().flags and Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    @Test fun shareTargetCleansStaleFilesAndDiscardDeletes() = runBlocking {
        val directory = File(context.cacheDir, "exports").apply { mkdirs() }
        File(directory, "old export.json").writeText("stale")
        File(directory, "nested").apply { mkdirs() }.resolve("deep.json").writeText("stale")
        val target = AndroidShareExportTarget(context, { })
        target.write(fileName, "{}".toByteArray())!!
        assertEquals(listOf(fileName), directory.list()!!.toList())

        File(directory, "left over.json").writeText("stale")
        AndroidShareExportTarget.deleteStaleExports(context)
        assertEquals(0, directory.list()!!.size)

        val second = target.write(fileName, "{}".toByteArray())!!
        assertTrue(File(directory, fileName).exists())
        second.discard()
        assertFalse(File(directory, fileName).exists())
    }

    @Test fun readBackBytesFromEachTargetVerifyAgainstTheCharacter() = runBlocking {
        provider(FileBackedDocumentProvider::class.java)
        val bytes = ContractCodec.encode(original).toByteArray(Charsets.UTF_8)
        val targets = listOf(saveTarget(), AndroidShareExportTarget(context, { }))
        for (target in targets) {
            val file = target.write(fileName, bytes)!!
            val readBack = file.read()
            assertArrayEquals(bytes, readBack)
            assertTrue(ExportVerifier.verify(readBack, original) is ContractResult.Available)
            val other = original.copy(identity = original.identity.copy(name = "Someone Else"))
            assertTrue(ExportVerifier.verify(readBack, other) is ContractResult.Unavailable)
            file.discard()
        }
    }
}
