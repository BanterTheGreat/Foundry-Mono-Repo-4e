package dev.modern4e.builder

import android.app.Activity
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Saves an exported character through the system Create-document dialog, so the user picks the folder and name.
 * Success requires a completed stream close, and the written document can be read back or removed again.
 */
class AndroidSaveExportTarget(
    private val resolver: ContentResolver,
    private val create: suspend (String) -> Uri?,
) : ExportTarget {
    constructor(resolver: ContentResolver, picker: AndroidDocumentPicker) : this(resolver, picker::create)

    override val confirmsWithMessage = true

    /**
     * Opens the Create-document dialog suggesting [fileName] and writes [bytes] to the chosen document.
     *
     * @return the written document, or null when the user cancelled the dialog.
     */
    override suspend fun write(fileName: String, bytes: ByteArray): ExportedFile? {
        val uri = create(fileName) ?: return null
        withContext(Dispatchers.IO) {
            val stream = checkNotNull(resolver.openOutputStream(uri, "wt")) { "Document provider returned no stream" }
            stream.use { it.write(bytes) }
        }
        return SavedDocument(resolver, uri, withContext(Dispatchers.IO) { displayNameOf(uri) } ?: fileName)
    }

    /** The provider's real name for [uri], which may differ from the suggestion; null when it cannot say. */
    private fun displayNameOf(uri: Uri): String? = try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                cursor.getString(0)?.takeIf { it.isNotBlank() }
            } else {
                null
            }
        }
    } catch (error: Exception) {
        null
    }

    /** A document the user chose, read back and removed through the same resolver. */
    private class SavedDocument(
        private val resolver: ContentResolver,
        private val uri: Uri,
        override val displayName: String,
    ) : ExportedFile {
        override suspend fun read(): ByteArray = withContext(Dispatchers.IO) {
            val stream = checkNotNull(resolver.openInputStream(uri)) { "Document provider returned no stream" }
            stream.use { it.readBytes() }
        }

        /** Deletes the document, or empties it when the provider cannot delete. */
        override suspend fun discard() {
            withContext(Dispatchers.IO) {
                val deleted = try {
                    DocumentsContract.deleteDocument(resolver, uri)
                } catch (error: Exception) {
                    false
                }
                if (!deleted) {
                    resolver.openOutputStream(uri, "wt")?.close()
                }
            }
        }

        override suspend fun present() = Unit
    }
}

/**
 * Hands an exported character to the Android share sheet through a private cache file and a [FileProvider] uri.
 * The system takes the file over once shared, so no message is shown.
 *
 * @param share receives the finished chooser intent; defaults to starting it from [context].
 * @param uriFor turns the cache file into the content uri the chooser shares; defaults to this app's [FileProvider].
 */
class AndroidShareExportTarget(
    private val context: Context,
    private val share: (Intent) -> Unit = { context.startActivity(it) },
    private val uriFor: (File) -> Uri = { FileProvider.getUriForFile(context, "${context.packageName}.exports", it) },
) : ExportTarget {
    override val confirmsWithMessage = false

    /** Writes [bytes] to `exports/[fileName]` in the cache directory after clearing files left by earlier exports. */
    override suspend fun write(fileName: String, bytes: ByteArray): ExportedFile? = withContext(Dispatchers.IO) {
        val directory = exportDirectory(context)
        deleteStaleExports(context)
        check(directory.isDirectory || directory.mkdirs()) { "Cannot create the export folder" }
        val file = File(directory, fileName)
        file.writeBytes(bytes)
        SharedFile(context, share, uriFor, file)
    }

    /** A cache file that can be read back, deleted, or offered to the share sheet. */
    private class SharedFile(
        private val context: Context,
        private val share: (Intent) -> Unit,
        private val uriFor: (File) -> Uri,
        private val file: File,
    ) : ExportedFile {
        override val displayName: String = file.name

        override suspend fun read(): ByteArray = withContext(Dispatchers.IO) { file.readBytes() }

        override suspend fun discard() {
            withContext(Dispatchers.IO) { file.delete() }
        }

        /** Opens the system chooser for the file; the chooser gets a read grant for the shared uri. */
        override suspend fun present() {
            val uri = uriFor(file)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, file.name)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, null).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                if (context !is Activity) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            share(chooser)
        }
    }

    companion object {
        private const val DIRECTORY = "exports"

        /** The cache folder that holds files waiting to be shared. */
        fun exportDirectory(context: Context): File = File(context.cacheDir, DIRECTORY)

        /** Deletes export temp files left by earlier shares; safe to call at app start. */
        fun deleteStaleExports(context: Context) {
            exportDirectory(context).listFiles()?.forEach { it.deleteRecursively() }
        }
    }
}
