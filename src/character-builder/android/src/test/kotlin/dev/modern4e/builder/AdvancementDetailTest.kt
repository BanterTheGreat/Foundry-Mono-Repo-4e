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
            assertTrue(theme.id, detail.levels.first().powers.all { powerBlockText(it) != null })
            assertEquals(theme.id, if (theme.id.endsWith(".gunsmith")) 5 else 0, detail.modifications.size)
        }
    }

    @Test fun ancestryPreviewShowsAttributesNestedPowersAndSeparatePowerChoices() {
        val entries = File("../content/production-generated/modern4e.ancestries").listFiles().orEmpty()
            .filter { it.name.startsWith("entries-") }
            .flatMap { ContractCodec.json.decodeFromString<EntryChunk>(it.readText(Charsets.UTF_8)).entries }
        val definitions = entries.associateBy { it.id }
        val human = advancementDetail(definitions.getValue("modern4e.ancestry.human"), definitions)
        assertEquals(mapOf("Size" to "Medium", "Speed" to "6 squares", "Vision" to "Normal",
            "Languages" to "Common, choose 1"), human.attributes.toMap())
        val humanLevel = human.levels.single()
        assertEquals(0, humanLevel.level)
        assertEquals(3, humanLevel.features.size)
        assertEquals("modern4e.power.heroic-effort", humanLevel.powers.single().id)
        assertTrue(humanLevel.powerChoices.isEmpty())

        val dragonborn = advancementDetail(definitions.getValue("modern4e.ancestry.dragonborn"), definitions)
        val dragonbornLevel = dragonborn.levels.single()
        assertTrue(dragonbornLevel.powers.isEmpty())
        val options = dragonbornLevel.powerChoices.single()
        assertEquals(1, options.count)
        assertEquals(listOf("modern4e.power.dragon-breath", "modern4e.power.dragonfear"), options.powers.map { it.id })
        val dragonfear = requireNotNull(powerBlockText(options.powers.last()))
        assertEquals("Encounter", dragonfear.usage)
        assertEquals("Minor action", dragonfear.action)
        assertEquals("Close burst 5", dragonfear.range)
        assertEquals(listOf("Fear"), dragonfear.keywords)
        val rules = dragonfear.phases.single().rules
        assertEquals(listOf("Target", "Attack", "Hit"), rules.map { it.label })
        assertEquals("Each enemy in the burst", rules[0].text)
        assertTrue(rules[1].text.contains("Main Ability vs. Will"))
        assertTrue(rules[1].text.contains("Close Burst 10"))
        assertTrue(rules[2].text.contains("grants combat advantage"))
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
