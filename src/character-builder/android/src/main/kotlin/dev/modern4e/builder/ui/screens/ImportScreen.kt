package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Renders the import destination using the retained session. */
@Composable
internal fun ImportScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit, exchange: FileExchange) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Choose a character file from your device to add it to your character list.", color = Dim, modifier = Modifier.padding(bottom = 24.dp))
        FolioButton("Choose a file", !model.busy) { task {
            when (val result = exchange.receive()) {
                is ContractResult.Available -> if (result.value != null) {
                    inspect(result.value!!.json)
                }
                is ContractResult.Unavailable -> errors = result.diagnostics
            }
        } }
    }
}
