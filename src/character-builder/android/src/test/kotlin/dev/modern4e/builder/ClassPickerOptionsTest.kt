package dev.modern4e.builder

import dev.modern4e.builder.ui.components.choiceExpansionOnTap
import dev.modern4e.builder.ui.components.classPickerSections
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ClassPickerOptionsTest {
    private fun row(title: String, role: String?, eligibility: Eligibility = Eligibility.ELIGIBLE): BuilderOptionRow {
        val supplier = PackageRevision("standard", "1")
        val metadata = CatalogEntry(EntryMetadata(title, EntryCategory.CLASS, title, "classes"), supplier)
        val profile = role?.let {
            ClassProfile(
                role = it,
                powerSources = listOf("ARCANE"),
                mainAbilities = listOf(Ability.INTELLIGENCE),
                secondaryAbilities = emptyList(),
                proficiencies = listOf("armor", "shields", "weapons", "implements").associateWith { emptyList() },
                statistics = listOf(Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL,
                    Statistic.HIT_POINTS, Statistic.HEALING_SURGES).associateWith { ClassFormula(10) },
            )
        }
        val entry = ContentEntry(title, EntryCategory.CLASS, Presentation(title),
            Mechanics(version = 2, classProfile = profile), Coverage(CoverageStatus.SUPPORTED))
        return BuilderOptionRow(metadata,
            BuilderOption(ResolvedEntry(entry, supplier, "fingerprint"), eligibility, emptyList()), checked = true)
    }

    @Test fun roleGroupsFollowThePickerOrderAndSortClassesByTitle() {
        val wizard = row("Wizard", "CONTROLLER")
        val druid = row("Druid", "CONTROLLER")
        val fighter = row("Fighter", "DEFENDER")
        val bard = row("Bard", "LEADER")
        val ranger = row("Ranger", "STRIKER")
        val options = PickerOptions.Ready(listOf(ranger, wizard, bard, fighter, druid), emptyList())

        val sections = classPickerSections(options, showIneligible = false)

        assertEquals(listOf("Controller", "Defender", "Leader", "Striker"), sections.map { it.title })
        assertEquals(listOf(listOf(druid, wizard), listOf(fighter), listOf(bard), listOf(ranger)),
            sections.map { it.rows })
    }

    @Test fun revealingBlockedClassesKeepsThemInTheirRolesAndPreservesUnclassifiedRows() {
        val wizard = row("Wizard", "CONTROLLER")
        val invoker = row("Invoker", "CONTROLLER", Eligibility.INELIGIBLE)
        val ranger = row("Ranger", "STRIKER", Eligibility.INELIGIBLE)
        val unavailable = row("Unknown class", null).copy(option = null)
        val options = PickerOptions.Ready(listOf(wizard), listOf(ranger, unavailable, invoker))

        val hidden = classPickerSections(options, showIneligible = false)
        assertEquals(listOf("Controller"), hidden.map { it.title })
        assertEquals(listOf(wizard), hidden.single().rows)

        val visible = classPickerSections(options, showIneligible = true)
        assertEquals(listOf("Controller", "Striker", "Unclassified"), visible.map { it.title })
        assertEquals(listOf(listOf(invoker, wizard), listOf(ranger), listOf(unavailable)), visible.map { it.rows })
    }

    @Test fun tappingADifferentClassExpandsItAndRetappingTheSelectedClassTogglesIt() {
        assertEquals("Fighter", choiceExpansionOnTap("Fighter", selected = null, expanded = null))
        assertEquals("Wizard", choiceExpansionOnTap("Wizard", selected = "Fighter", expanded = "Fighter"))
        assertNull(choiceExpansionOnTap("Wizard", selected = "Wizard", expanded = "Wizard"))
        assertEquals("Wizard", choiceExpansionOnTap("Wizard", selected = "Wizard", expanded = null))
    }
}
