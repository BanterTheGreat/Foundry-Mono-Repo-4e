package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.powerChoiceColor
import dev.modern4e.builder.ui.screens.powerChoiceUsage
import dev.modern4e.builder.ui.screens.isUtilityPowerPicker
import org.junit.Assert.*
import org.junit.Test

class PowerChoiceColorsTest {
    @Test fun usageColorsMatchScheduledAndCatalogLabels() {
        assertEquals(powerChoiceColor("At-will power"), powerChoiceColor("AT_WILL"))
        assertEquals(powerChoiceColor("Paragon encounter power"), powerChoiceColor("ENCOUNTER"))
        assertEquals(powerChoiceColor("Daily attack"), powerChoiceColor("DAILY"))
        assertEquals(4, listOf("At-will", "Encounter", "Daily", "Utility").map { requireNotNull(powerChoiceColor(it)) }.toSet().size)
        assertNull(powerChoiceColor("Feat"))
    }

    @Test fun powerColorUsesProfileBeforeLegacyMarkup() {
        fun power(html: String, profile: PowerProfile? = null) =
            ContentEntry("power", EntryCategory.POWER, Presentation("Power", html),
                Mechanics(powerProfile = profile), Coverage(CoverageStatus.PARTIAL))

        assertEquals("At-will", powerChoiceUsage(power("<h1 class='atwillpower'>Power</h1>")))
        assertEquals("Encounter", powerChoiceUsage(power("<h1 class=encounterpower>Power</h1>")))
        assertEquals("Daily", powerChoiceUsage(power("<h1 class=encounterpower>Power</h1>", PowerProfile(1, "DAILY", "UTILITY"))))
        assertNull(powerChoiceUsage(power("Unclassified power")))
    }

    @Test fun onlyUtilitySlotsUseIndividualPickerColors() {
        val entry = ContentEntry("class", EntryCategory.CLASS, Presentation("Class"),
            Mechanics(choices = listOf(
                ChoiceDefinition.Entries("attack", 1, query = PowerQuery(powerKind = "ATTACK")),
                ChoiceDefinition.Entries("utility", 1, query = PowerQuery(powerKind = "UTILITY")),
            )), Coverage(CoverageStatus.PARTIAL))
        val sources = listOf(EngineEntry("class-instance", ChoiceSlotId("creation", "class", 0),
            ResolvedEntry(entry, PackageRevision("proof", "1"), "fingerprint"), granted = false))

        assertTrue(isUtilityPowerPicker(2, ChoiceSlotId("class-instance", "utility", 0), sources))
        assertFalse(isUtilityPowerPicker(1, ChoiceSlotId("class-instance", "attack", 0), sources))
        assertFalse(isUtilityPowerPicker(1, ChoiceSlotId("creation", "feat", 0), sources))
        assertTrue(isUtilityPowerPicker(17, ChoiceSlotId("advancement.17", "power", 0), sources))
        assertFalse(isUtilityPowerPicker(17, ChoiceSlotId("advancement.17", "power", 1), sources))
    }
}
