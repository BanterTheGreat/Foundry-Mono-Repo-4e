package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.advancementDetail
import dev.modern4e.builder.ui.screens.powerBlockText
import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class AdvancementDetailTest {
    @Test fun everyBundledThemeShowsAllProseFeaturesAndPowers() {
        val entries = ContractCodec.json.decodeFromString<EntryChunk>(
            File("../content/production-generated/modern4e.themes/entries-0000.json").readText(Charsets.UTF_8)
        ).entries
        val definitions = entries.associateBy { it.id }
        val themes = entries.filter { it.category == EntryCategory.THEME }
        assertEquals(9, themes.size)
        themes.forEach { theme ->
            val sections = theme.sharedData!!.getValue("sections").jsonObject.entries
                .sortedBy { it.key.removePrefix("text-").toInt() }.map { it.value.jsonPrimitive.content }
            val detail = advancementDetail(theme, definitions)
            assertEquals(theme.id, sections.take(2).joinToString("\n\n"), detail.introduction)
            assertEquals(theme.id, sections.drop(2).joinToString("\n\n"), detail.conclusion)
            assertEquals(theme.id, listOf(1, 5, 10), detail.levels.map { it.level })
            assertTrue(theme.id, detail.levels.all { it.features.size == 1 })
            assertTrue(theme.id, detail.levels.first().powers.isNotEmpty())
            assertTrue(theme.id, detail.levels.first().powers.all { powerBlockText(it.presentation.description) != null })
            assertEquals(theme.id, if (theme.id.endsWith(".gunsmith")) 5 else 0, detail.modifications.size)
        }
    }

    @Test fun laterAdvancementUsesGrantLevelsAndFallsBackToItsDescription() {
        val power = entry("power", EntryCategory.POWER)
        val feature = entry("feature", EntryCategory.FEATURE)
        for (category in listOf(EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY)) {
            val entry = entry("advancement", category).copy(
                mechanics = Mechanics(grants = listOf(
                    Grant.Entry("power", power.id, atLevel = 30),
                    Grant.Entry("feature", feature.id, atLevel = 21),
                    Grant.Entry("missing", "unknown", atLevel = 24),
                )),
                sharedData = JsonObject(mapOf("sections" to JsonPrimitive(false), "modifications" to JsonPrimitive(false))),
            )
            val detail = advancementDetail(entry, listOf(power, feature).associateBy { it.id })
            assertEquals(entry.presentation.description, detail.introduction)
            assertEquals(listOf(21, 30), detail.levels.map { it.level })
            assertEquals(listOf(feature), detail.levels.first().features)
            assertEquals(listOf(power), detail.levels.last().powers)
            assertTrue(detail.modifications.isEmpty())
            assertTrue(detail.conclusion.isBlank())
        }
    }

    private fun entry(id: String, category: EntryCategory) =
        ContentEntry(id, category, Presentation(id, "$id description"), Mechanics(), Coverage(CoverageStatus.PARTIAL))
}
