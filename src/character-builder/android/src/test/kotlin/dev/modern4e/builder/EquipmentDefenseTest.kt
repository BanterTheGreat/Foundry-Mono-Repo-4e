package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.defenseDisplay
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Exercises the Equipment picker through the persisted session and Stats defense display. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EquipmentDefenseTest {
    @Test fun changingEquippedArmorAndShieldUpdatesStatsAndSurvivesReopen() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val store = AndroidCharacterStore(context)
        val source = AndroidContentSource(context.assets)
        val fixture = File("../shared/fixtures/sample-accepted-fighter-1.json").readText()
        val unarmored = (ContractCodec.decode(fixture) as ContractResult.Available).value.copy(equipment = emptyList())
        val session = BuilderSession(store, source) { unarmored }
        session.create()
        val characterId = checkNotNull(session.current).document.id
        session.assertDefenses(ac = "12", reflex = "14")

        session.equip(EquipmentSlot.ARMOR, "modern4e.armor.scale")
        session.assertDefenses(ac = "16", reflex = "14")
        session.equip(EquipmentSlot.SHIELD, "modern4e.shield.heavy-shield")
        session.assertDefenses(ac = "18", reflex = "16")
        session.equip(EquipmentSlot.ARMOR, "modern4e.armor.leather")
        session.assertDefenses(ac = "16", reflex = "16")
        session.equip(EquipmentSlot.SHIELD, "modern4e.shield.light-shield")
        session.assertDefenses(ac = "15", reflex = "15")

        val reopened = BuilderSession(store, source) { unarmored }
        reopened.load(characterId)
        reopened.assertDefenses(ac = "15", reflex = "15")
        val equipment = checkNotNull(reopened.current).document.equipment
        assertEquals(setOf("modern4e.armor.leather", "modern4e.shield.light-shield"),
            equipment.map { it.selection.entryId }.toSet())
        assertEquals(2, equipment.size)
        assertTrue(equipment.all { it.equipped })

        reopened.selectEquipment(EquipmentSlot.SHIELD, null)
        reopened.assertDefenses(ac = "14", reflex = "14")
        reopened.selectEquipment(EquipmentSlot.ARMOR, null)
        reopened.assertDefenses(ac = "12", reflex = "14")
        session.load(characterId)
        session.assertDefenses(ac = "12", reflex = "14")
        assertTrue(checkNotNull(session.current).document.equipment.isEmpty())
    }

    /** Select a proficient item using the same option and edit calls as the Equipment picker. */
    private suspend fun BuilderSession.equip(slot: EquipmentSlot, entryId: String) {
        val option = equipmentOptions(slot).eligible.single { it.entry.id == entryId }
        selectEquipment(slot, option)
    }

    /** Verify the displayed defenses, including the two unaffected by this equipment. */
    private fun BuilderSession.assertDefenses(ac: String, reflex: String) {
        assertTrue(errors.toString(), errors.isEmpty())
        val rules = checkNotNull(current).rules
        assertEquals(ac, rules.defenseDisplay(Statistic.AC))
        assertEquals(reflex, rules.defenseDisplay(Statistic.REFLEX))
        assertEquals("18", rules.defenseDisplay(Statistic.FORTITUDE))
        assertEquals("12", rules.defenseDisplay(Statistic.WILL))
    }
}
