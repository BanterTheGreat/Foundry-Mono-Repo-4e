package dev.modern4e.builder

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/** Android-only native shell; shared Kotlin owns decisions, rules and import coordination. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val picker = AndroidDocumentPicker(this)
        val exchange = AndroidFileExchange(contentResolver, picker)
        val model = ViewModelProvider(this, object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return BuilderSession(AndroidCharacterStore(applicationContext), AndroidContentSource(assets)) {
                    val json = assets.open("samples/sample-modern-fighter.json").bufferedReader().use { it.readText() }
                    (ContractCodec.decode(json) as ContractResult.Available).value
                } as T
            }
        })[BuilderSession::class.java]
        setContent { BuilderApp(model, exchange) }
    }
}
