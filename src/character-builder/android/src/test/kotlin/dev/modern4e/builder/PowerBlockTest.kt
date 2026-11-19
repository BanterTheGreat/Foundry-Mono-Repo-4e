package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.PowerRule
import dev.modern4e.builder.ui.screens.powerBlockText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.*
import org.junit.Test

class PowerBlockTest {
    @Test
    fun lightningStriderKeepsEachHitAndTeleportWithItsAttack() {
        val description = """
            Your body becomes like a bolt of lightning as you shoot from enemy to enemy, launching attack after attack.

            DAILY / STANDARD

            Melee weapon

            Target: One creature

            Effect: Teleport 4 squares

            Primary Attack: Intelligence vs. AC

            Hit: 1[W] + Strength lightning damage.

            Effect: You can teleport 3 squares, and then make a secondary attack.
            Secondary Target: One creature other than the primary target.
            Secondary Attack: Intelligence vs. AC
            Hit: 1[W] lightning damage.

            Effect: You can teleport 2 squares, and then make a tertiary attack.

            Tertiary Target: One creature other than the primary and secondary targets.
            Tertiary Attack: Intelligence vs. AC
            Hit: 1[W] lightning damage.
        """.trimIndent()

        val block = requireNotNull(powerBlockText(description))
        assertEquals("Daily", block.usage)
        assertEquals("Standard action", block.action)
        assertEquals("Melee weapon", block.range)
        assertEquals(description.lineSequence().first(), block.flavor)
        assertEquals(listOf("Primary attack", "Secondary attack", "Tertiary attack"), block.phases.map { it.title })
        assertEquals(listOf(4, 4, 4), block.phases.map { it.rules.size })
        assertEquals(listOf("1[W] + Strength lightning damage.", "1[W] lightning damage.", "1[W] lightning damage."),
            block.phases.map { it.rules.last().text })
        assertEquals(listOf("Teleport 4 squares", "You can teleport 3 squares, and then make a secondary attack.",
            "You can teleport 2 squares, and then make a tertiary attack."),
            block.phases.map { phase -> phase.rules.single { it.label == "Effect" }.text })
    }

    @Test
    fun repeatedAttackLabelsAndGrantedPowerStayInSeparateBlocks() {
        val block = requireNotNull(powerBlockText("""
            ENCOUNTER / IMMEDIATE_REACTION
            Personal
            Primary Attack: Intelligence vs. Reflex
            Hit: Lightning damage.
            Effect: Make a ranged secondary attack.
            Secondary Attack: Intelligence vs. Reflex
            Hit: More lightning damage.
            Secondary Attack: This attack ignores cover.
            Grants: Another power
            AT_WILL / FREE
            Melee weapon
        """.trimIndent()))
        assertEquals("Immediate reaction", block.action)
        assertEquals(listOf("Primary attack", "Secondary attack"), block.phases.map { it.title })
        assertEquals(listOf("Effect", "Secondary Attack", "Hit", "Secondary Attack"),
            block.phases.last().rules.map { it.label })
        val (title, granted) = block.granted.single()
        assertEquals("Another power", title)
        assertEquals("At-will", granted.usage)
        assertEquals("Free action", granted.action)
        assertEquals("Melee weapon", granted.range)
    }

    @Test
    fun maliciousShadowKeepsSustainOnDailyAndTriggerOnAtWill() {
        val description = """
            DAILY / STANDARD
            Ranged 5
            Target: One creature
            Attack: Charisma vs. Reflex
            Hit: 3d8 + Charisma cold and necrotic damage.
            Miss: Half damage.
            Effect: You conjure a malicious shadow.
            Sustain Minor: The shadow persists until the end of your next turn.

            Grants: Malicious Shadow Secondary Power

            AT_WILL / IMMEDIATE_INTERRUPT

            Melee 1
            Trigger: An enemy willingly leaves a square adjacent to the shadow on its turn.
            Requirement: The power Malicious Shadow must be active in order to use this power.
            Target: The triggering enemy
            Attack: Charisma vs. Reflex
            Hit: 10 cold and necrotic damage, and the target is immobilized until the end of its turn.
        """.trimIndent()
        val block = requireNotNull(powerBlockText(description))
        val (title, granted) = block.granted.single()
        assertEquals("Daily", block.usage)
        assertEquals("Sustain Minor", block.phases.single().rules.last().label)
        assertEquals("Malicious Shadow Secondary Power", title)
        assertEquals("At-will", granted.usage)
        assertEquals("Immediate interrupt", granted.action)
        assertEquals("Melee 1", granted.range)
        assertEquals(listOf("Trigger", "Requirement", "Target", "Attack", "Hit"), granted.phases.single().rules.map { it.label })
    }

    @Test
    fun grantsWithoutInlinePowerKeepTheirRuleText() {
        val block = requireNotNull(powerBlockText("DAILY / STANDARD\nPersonal\nGrants: Another power"))
        assertEquals(listOf(PowerRule("Grants", "Another power")), block.phases.single().rules)
        assertTrue(block.granted.isEmpty())
    }

    @Test
    fun headerlessRulesKeepLineBreaksAndMarkupUsesLegacyFallback() {
        val block = requireNotNull(powerBlockText("Hit: Fire damage.\n\n- Level 11: More damage.\nSpecial: See below."))
        assertNull(block.usage)
        assertNull(block.range)
        assertEquals("", block.flavor)
        assertEquals(listOf(PowerRule("Hit", "Fire damage."), PowerRule(null, "- Level 11: More damage."),
            PowerRule("Special", "See below.")), block.phases.single().rules)
        assertNull(powerBlockText("<h1 class=dailypower>Legacy</h1><p><b>Effect:</b> Shift 1 square.</p>"))
    }

    @Test
    fun secondaryTargetWithoutAnAttackIsLabeledAsATarget() {
        val block = requireNotNull(powerBlockText("Target: One creature\nAttack: Charisma vs. Reflex\nHit: Damage.\nSecondary Target: A nearby creature\nEffect: Additional damage."))
        assertEquals(listOf("Primary attack", "Secondary target"), block.phases.map { it.title })
    }

    @Test
    fun structuredThemePowerKeepsMetadataAndRulesMissingFromItsDescription() {
        val entry = authoredPower("Hit: Deal damage.")
        val block = requireNotNull(powerBlockText(entry, useStructuredFallback = true))

        assertEquals("Encounter", block.usage)
        assertEquals("Free action", block.action)
        assertEquals("Close burst 5", block.range)
        assertEquals(listOf("Martial", "Weapon"), block.keywords)
        assertEquals("You rush into the fray.", block.flavor)
        assertEquals(
            listOf("Trigger", "Requirement", "Target", "Attack", "Hit", "Special"),
            block.phases.single().rules.map { it.label },
        )
        assertEquals("Main Ability vs. AC", block.phases.single().rules[3].text)
    }

    @Test
    fun structuredFallbackPreservesExistingPowerFormats() {
        val headerless = authoredPower("Hit: Deal damage.")
        val withHeader = authoredPower("DAILY / STANDARD\nPersonal\nEffect: Shift 1 square.")
        val legacy = authoredPower("<b>Effect:</b> Shift 1 square.")

        assertEquals(powerBlockText(headerless.presentation.description), powerBlockText(headerless, useStructuredFallback = false))
        assertEquals(powerBlockText(withHeader.presentation.description), powerBlockText(withHeader, useStructuredFallback = true))
        assertNull(powerBlockText(legacy, useStructuredFallback = true))
    }

    private fun authoredPower(description: String) = ContentEntry(
        "structured.power", EntryCategory.POWER, Presentation("Structured power", description), Mechanics(),
        Coverage(CoverageStatus.UNIMPLEMENTED),
        Json.parseToJsonElement("""
            {
              "flavor": "You rush into the fray.",
              "keywords": ["MARTIAL", "WEAPON"],
              "activations": [{
                "action": "FREE",
                "usage": {"frequency": "ENCOUNTER"},
                "range": {"type": "CLOSE_BURST", "size": {"base": 5}},
                "trigger": "An enemy hits an ally.",
                "requirement": "You must be bloodied.",
                "targets": "targets",
                "bindings": {"targets": {"kind": "TARGET_SET", "text": "The triggering enemy"}},
                "blocks": [
                  {
                    "type": "attack",
                    "label": "Attack",
                    "text": "Main Ability vs. AC",
                    "comparisons": [{"outcomes": {"hit": [{"label": "Hit", "text": "Deal damage."}]}}]
                  },
                  {"type": "effect", "label": "Special", "text": "This power does not provoke opportunity attacks."}
                ]
              }]
            }
        """).jsonObject,
    )
}
