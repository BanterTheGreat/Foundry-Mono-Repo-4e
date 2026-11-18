package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.zeitgeistThemeDescription
import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class ZeitgeistThemeDescriptionTest {
    @Test fun allBundledZeitgeistThemesUseTheirIntroductoryFlavor() {
        val chunk = ContractCodec.json.decodeFromString<EntryChunk>(
            File("../content/production-generated/modern4e.themes/entries-0000.json").readText(Charsets.UTF_8)
        )
        val themes = chunk.entries.filter { it.category == EntryCategory.THEME }
        assertEquals(9, themes.size)
        themes.forEach { theme ->
            val sections = requireNotNull(theme.sharedData).getValue("sections").jsonObject
            val expected = listOf("text-1", "text-2").joinToString("\n\n") { sections.getValue(it).jsonPrimitive.content }
            assertEquals(theme.id, expected, zeitgeistThemeDescription(theme))
        }
        val nonThemes = chunk.entries.filter { it.category != EntryCategory.THEME }
        assertTrue(nonThemes.all { zeitgeistThemeDescription(it) == null })
    }

    @Test fun missingOrMalformedFlavorLetsThePickerUseItsNormalDescription() {
        val theme = ContentEntry("modern4e.theme.custom", EntryCategory.THEME, Presentation("Custom theme", "Description"),
            Mechanics(), Coverage(CoverageStatus.PARTIAL))
        assertNull(zeitgeistThemeDescription(theme))
        assertNull(zeitgeistThemeDescription(theme.copy(sharedData = JsonObject(mapOf("sections" to JsonPrimitive(false))))))
    }
}
