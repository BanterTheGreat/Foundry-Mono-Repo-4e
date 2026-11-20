package dev.modern4e.builder

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import java.io.File

/** Android-only native shell; shared Kotlin owns decisions, rules and import coordination. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val picker = AndroidDocumentPicker(this)
        val exchange = AndroidFileExchange(contentResolver, picker)
        val portraitChooser = AndroidPortraitChooser(contentResolver, picker)
        val exports = ExportTargets(AndroidSaveExportTarget(contentResolver, picker), AndroidShareExportTarget(this))
        if (savedInstanceState == null) {
            // Only on a fresh launch, so a rotation cannot delete a file the share sheet is still reading.
            AndroidShareExportTarget.deleteStaleExports(this)
        }
        val model = ViewModelProvider(this, object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val portraits = PortraitStore(File(applicationContext.filesDir, "portraits"), BitmapPortraitEncoder)
                @Suppress("UNCHECKED_CAST")
                return BuilderSession(AndroidCharacterStore(applicationContext), AndroidContentSource(assets), portraits) {
                    val json = assets.open("samples/sample-modern-fighter.json").bufferedReader().use { it.readText() }
                    (ContractCodec.decode(json) as ContractResult.Available).value
                } as T
            }
        })[BuilderSession::class.java]
        setContent { BuilderApp(model, exchange, portraitChooser, exports = exports) }
    }
}
