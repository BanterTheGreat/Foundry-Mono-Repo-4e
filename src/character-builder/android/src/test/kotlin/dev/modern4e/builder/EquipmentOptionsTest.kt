package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.equipmentPickerSections
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EquipmentOptionsTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    private fun sample(): CharacterDocument =
        (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json").readText()) as ContractResult.Available)
            .value.copy(equipment = emptyList())

    private fun session(source: ContentSource = AndroidContentSource(context.assets)) =
        BuilderSession(store, source, ::sample).also { it.warmupSettleMillis = 60_000 }

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    @Test fun homeWarmsDefinitionsAndPickerUsesClassProficiency() = runBlocking {
        val real = AndroidContentSource(context.assets)
        val equipmentReads = AtomicInteger()
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                if (packageId == "modern4e.equipment") {
                    equipmentReads.incrementAndGet()
                }
                return real.loadChunk(packageId, chunkId)
            }
        }
        val model = session(source)
        model.preloadHomePickers()
        val warmedReads = equipmentReads.get()
        assertTrue(warmedReads > 0)
        assertNull(model.current)

        model.create("modern4e.class.rogue")
        val readsBeforePicker = equipmentReads.get()
        val weapons = model.equipmentOptions(EquipmentSlot.WEAPON_ONE)
        assertTrue(weapons.diagnostics.isEmpty())
        assertEquals(readsBeforePicker, equipmentReads.get())
        assertEquals(setOf("Dagger", "Shortsword", "Sling", "Unarmed Attack"), weapons.eligible.map { it.entry.presentation.title }.toSet())
        assertTrue(weapons.ineligible.any { it.entry.id == "modern4e.weapon.greatsword" })
        assertTrue(weapons.eligible.first().entry.presentation.description.contains("Damage"))
        assertEquals(setOf("Light Shield"), model.equipmentOptions(EquipmentSlot.SHIELD).eligible
            .map { it.entry.presentation.title }.toSet())
    }

    @Test fun improvisedWeaponsCanBeSavedWithoutProficiency() = runBlocking {
        val model = session()
        model.create("modern4e.class.rogue")
        val slot = EquipmentSlot.WEAPON_TWO
        val unarmed = model.equipmentOptions(slot).eligible.single { it.entry.presentation.title == "Unarmed Attack" }
        assertTrue(unarmed.entry.meetsEquipmentProficiencyRequirement(emptySet()))
        model.selectEquipment(slot, unarmed)
        assertTrue(model.errors.isEmpty())
        assertEquals(unarmed.entry.id, model.equipmentOptions(slot).selected?.selection?.entryId)
        assertTrue(model.current!!.rules.diagnostics.none { it.code == "android.equipment.unproficient" })
    }

    @Test fun equipmentPickerShowsEveryOptionInItsAuthoredSection() = runBlocking {
        val model = session()
        model.create("modern4e.class.rogue")

        for (slot in listOf(EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO)) {
            val weapons = model.equipmentOptions(slot)
            val sections = equipmentPickerSections(slot, weapons)
            assertEquals(listOf("Simple", "Military", "Superior", "Improvised"), sections.map { it.title })
            assertEquals((weapons.eligible + weapons.ineligible).map { it.entry.id }.toSet(),
                sections.flatMap { it.rows }.map { it.option.entry.id }.toSet())
            val military = sections.single { it.title == "Military" }
            assertTrue(military.rows.single { it.option.entry.presentation.title == "Shortsword" }.eligible)
            assertFalse(military.rows.single { it.option.entry.presentation.title == "Greatsword" }.eligible)
            val titles = military.rows.map { it.option.entry.presentation.title }
            assertEquals(titles.sortedBy { it.lowercase() }, titles)
        }

        val armor = equipmentPickerSections(EquipmentSlot.ARMOR, model.equipmentOptions(EquipmentSlot.ARMOR))
        assertEquals(listOf("Light Armor", "Heavy Armor"), armor.map { it.title })
        assertTrue(armor.first().rows.any { it.eligible })
        assertTrue(armor.last().rows.none { it.eligible })
        assertEquals(setOf("Chainmail", "Plate", "Scale"),
            armor.last().rows.map { it.option.entry.presentation.title }.toSet())
    }

    @Test fun broadArmorProficiencyCoversEveryArmorInTheCategory() = runBlocking {
        val model = session()
        model.create("modern4e.class.paladin")
        val options = model.equipmentOptions(EquipmentSlot.ARMOR)
        assertEquals(setOf("Cloth", "Leather", "Hide", "Chainmail", "Scale", "Plate"),
            options.eligible.map { it.entry.presentation.title }.toSet())
        assertTrue(options.ineligible.isEmpty())
    }

    @Test fun implementSelectionLinksTheSpecificWeaponAndCanSwitchToAStandaloneImplement() = runBlocking {
        val model = session()
        model.create("modern4e.class.wizard")
        val implementSlot = EquipmentSlot.IMPLEMENT
        val weaponSlot = EquipmentSlot.WEAPON_TWO
        val weapon = model.equipmentOptions(weaponSlot).eligible.single { it.entry.id == "modern4e.weapon.quarterstaff" }
        model.selectEquipment(weaponSlot, weapon)
        val link = model.equipmentOptions(implementSlot).linkedWeapons.single()
        assertEquals(weaponSlot, link.slot)
        model.selectEquipment(implementSlot, link.definition, link.selection.instanceId)

        val reopened = session()
        reopened.load(model.current!!.document.id)
        assertEquals(1, reopened.current!!.document.equipment.size)
        assertEquals(weaponSlot.instanceId, reopened.equipmentOptions(implementSlot).selected!!.instanceId)
        assertEquals(weapon.entry.id, reopened.equipmentOptions(weaponSlot).selected!!.selection.entryId)

        val orb = reopened.equipmentOptions(implementSlot).eligible.single { it.entry.id == "modern4e.implement.orb" }
        reopened.selectEquipment(implementSlot, orb)
        assertFalse(reopened.equipmentOptions(weaponSlot).selected!!.isLinkedImplement)
        assertEquals(orb.entry.id, reopened.equipmentOptions(implementSlot).selected!!.selection.entryId)
        reopened.selectEquipment(implementSlot, null)
        assertNull(reopened.equipmentOptions(implementSlot).selected)
        assertEquals(weapon.entry.id, reopened.equipmentOptions(weaponSlot).selected!!.selection.entryId)

        reopened.selectEquipment(implementSlot, link.definition, link.selection.instanceId)
        reopened.selectEquipment(implementSlot, null)
        assertFalse(reopened.equipmentOptions(weaponSlot).selected!!.isLinkedImplement)
        reopened.selectEquipment(implementSlot, link.definition, link.selection.instanceId)
        reopened.selectEquipment(weaponSlot, null)
        assertNull(reopened.equipmentOptions(implementSlot).selected)
    }

    @Test fun bladeImplementProficiencyUsesTheClassImplementList() = runBlocking {
        val model = session()
        model.create("modern4e.class.rogue")
        val dagger = model.equipmentOptions(EquipmentSlot.WEAPON_ONE).eligible.single { it.entry.id == "modern4e.weapon.dagger" }
        assertFalse(dagger.entry.canUseWeaponAsImplement(model.current!!.rules))
        model.create("modern4e.class.sorcerer")
        assertTrue(dagger.entry.canUseWeaponAsImplement(model.current!!.rules))
    }

    @Test fun armorSectionsSortByAcBeforeNameRegardlessOfEligibility() {
        fun armor(id: String, title: String, bonus: Int?, category: String = "LIGHT") = ResolvedEntry(
            ContentEntry(id, EntryCategory.ITEM, Presentation(title), Mechanics(), Coverage(CoverageStatus.SUPPORTED),
                sharedData = buildJsonObject {
                    put("equipment", buildJsonObject {
                        put("kind", "ARMOR")
                        put("armorCategory", category)
                        bonus?.let { put("armorBonus", it) }
                    })
                }), PackageRevision("standard", "1"), "fingerprint")
        val high = armor("high", "Aardvark", 5)
        val low = armor("low", "Zebra", 0)
        val tieB = armor("tie-b", "Alpha", 2)
        val tieA = armor("tie-a", "alpha", 2)
        val unknown = armor("unknown", "Aaa", null)
        val heavyLow = armor("heavy-low", "Zebra heavy", 6, "HEAVY")
        val heavyHigh = armor("heavy-high", "Alpha heavy", 8, "HEAVY")
        val options = EquipmentOptions(eligible = listOf(high, tieB, unknown, heavyHigh),
            ineligible = listOf(low, tieA, heavyLow))
        val sections = equipmentPickerSections(EquipmentSlot.ARMOR, options)
        assertEquals(listOf("Light Armor", "Heavy Armor"), sections.map { it.title })
        assertEquals(listOf(low, tieA, tieB, high, unknown), sections.first().rows.map { it.option })
        assertFalse(sections.first().rows.first().eligible)
        assertTrue(sections.first().rows.first { it.option == high }.eligible)
        assertEquals(listOf(heavyLow, heavyHigh), sections.last().rows.map { it.option })
        val shieldTitles = equipmentPickerSections(EquipmentSlot.SHIELD, options).single().rows
            .map { it.option.entry.presentation.title }
        assertEquals(shieldTitles.sortedBy { it.lowercase() }, shieldTitles)
    }

    @Test fun olderDocumentAdoptsEquipmentPackageOnSaveAndSlotsReopenIndependently() = runBlocking {
        val older = sample().copy(packages = sample().packages.filterNot { it.packageId == "modern4e.equipment" })
        assertTrue(store.save(older, SaveMode.CREATE) is ContractResult.Available)
        val model = session()
        model.load(older.id)
        val options = model.equipmentOptions(EquipmentSlot.WEAPON_TWO)
        val dagger = options.eligible.first { it.entry.id == "modern4e.weapon.dagger" }
        assertEquals(older.packages, model.current!!.document.packages)
        model.selectEquipment(EquipmentSlot.WEAPON_TWO, dagger)

        val reopened = session()
        reopened.load(older.id)
        assertTrue(reopened.current!!.document.packages.any { it.packageId == "modern4e.equipment" })
        assertNull(reopened.equipmentOptions(EquipmentSlot.WEAPON_ONE).selected)
        assertTrue(reopened.equipmentOptions(EquipmentSlot.WEAPON_TWO).selected!!.equipped)
        assertEquals(dagger.entry.id, reopened.equipmentOptions(EquipmentSlot.WEAPON_TWO).selectedEntry!!.entry.id)
        reopened.selectEquipment(EquipmentSlot.WEAPON_TWO, null)
        reopened.load(older.id)
        assertTrue(reopened.current!!.document.equipment.isEmpty())
    }

    @Test fun missingEquipmentChunkLeavesSavedSlotClearable() = runBlocking {
        val model = session()
        model.create("modern4e.class.fighter")
        val dagger = model.equipmentOptions(EquipmentSlot.WEAPON_ONE).eligible.first { it.entry.id == "modern4e.weapon.dagger" }
        model.selectEquipment(EquipmentSlot.WEAPON_ONE, dagger)
        val document = model.current!!.document
        val real = AndroidContentSource(context.assets)
        val missing = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                if (packageId == "modern4e.equipment") {
                    return ContractResult.Unavailable(listOf(Diagnostic("test.equipment", DiagnosticKind.IO_FAILURE,
                        "The equipment catalog is unavailable.")))
                }
                return real.loadChunk(packageId, chunkId)
            }
        }
        val reopened = session(missing)
        reopened.load(document.id)
        val options = reopened.equipmentOptions(EquipmentSlot.WEAPON_ONE)
        assertEquals("Dagger", options.selected?.selection?.savedTitle)
        assertNull(options.selectedEntry)
        assertTrue(options.diagnostics.any { it.code == "test.equipment" })
        reopened.selectEquipment(EquipmentSlot.WEAPON_ONE, null)
        assertTrue(reopened.errors.isEmpty())
        assertTrue(reopened.current!!.document.equipment.isEmpty())
    }

    @Test fun importedEquippedItemsFillFreeSlotsAndStaleIneligiblePickIsRejected() = runBlocking {
        val model = session()
        model.create("modern4e.class.fighter")
        val weapons = model.equipmentOptions(EquipmentSlot.WEAPON_ONE)
        val greatsword = weapons.eligible.first { it.entry.id == "modern4e.weapon.greatsword" }
        val saved = SavedSelection(greatsword.entry.id, greatsword.entry.presentation.title,
            greatsword.supplier.packageId, greatsword.fingerprint)
        model.edit(BuilderEdit.Equipment(EquipmentSelection("imported-sword", saved, equipped = true)))
        assertEquals("imported-sword", model.equipmentOptions(EquipmentSlot.WEAPON_ONE).selected?.instanceId)
        model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.rogue", "rogue", true))
        val options = model.equipmentOptions(EquipmentSlot.WEAPON_ONE)
        assertEquals("imported-sword", options.selected?.instanceId)
        assertTrue(greatsword in options.ineligible)
        assertTrue(model.current!!.rules.diagnostics.any {
            it.code == "android.equipment.unproficient" && it.entryId == greatsword.entry.id
        })
        model.selectEquipment(EquipmentSlot.WEAPON_TWO, greatsword)
        assertEquals("android.equipment.proficiency", model.errors.single().code)
        assertEquals(listOf("imported-sword"), model.current!!.document.equipment.map { it.instanceId })
    }
}
