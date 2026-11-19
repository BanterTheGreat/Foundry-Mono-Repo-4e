package dev.modern4e.builder.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.folioScroll
import dev.modern4e.builder.ui.theme.Ink
import dev.modern4e.builder.ui.theme.Wash

/** An ordered group of rows with a stable section identity. */
internal data class ListSection<T>(val key: String, val title: String, val rows: List<T>)

/** Renders section headings and caller-supplied rows in a single folio scroll region. */
@Composable
internal fun <T> SectionedChoiceList(
    sections: List<ListSection<T>>,
    rowKey: (T) -> String,
    modifier: Modifier = Modifier,
    footer: (@Composable () -> Unit)? = null,
    rowContent: @Composable (T) -> Unit,
) {
    val scroll = rememberLazyListState()
    LazyColumn(
        modifier.fillMaxWidth().folioScroll(scroll),
        state = scroll,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        sections.filter { it.rows.isNotEmpty() }.forEach { section ->
            item(key = "section:${section.key}") {
                Text(
                    section.title,
                    Modifier.fillMaxWidth().background(Wash).padding(horizontal = 8.dp, vertical = 3.dp)
                        .semantics { heading() },
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Ink,
                )
            }
            items(section.rows, key = { "row:${rowKey(it)}" }) { rowContent(it) }
        }
        if (footer != null) {
            item(key = "footer") { footer() }
        }
    }
}
