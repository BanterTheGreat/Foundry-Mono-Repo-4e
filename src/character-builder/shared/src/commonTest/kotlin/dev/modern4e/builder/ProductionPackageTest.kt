package dev.modern4e.builder

import kotlin.test.*

/** The exact Python-produced asset bytes load through the unchanged shared contracts. */
class ProductionPackageTest {
    @Test
    fun generatedPackagesAreConsumableOnBothTargets() {
        val json = ContractCodec.json
        for (id in listOf("modern4e.proof", "modern4e.proof.override")) {
            val manifest = assertIs<ContractResult.Available<PackageManifest>>(
                ContractCodec.decodeManifest(productionFixtures.getValue("$id/manifest.json"))
            ).value
            assertEquals(id, manifest.id)
            val entries = manifest.chunks.flatMap { chunkId ->
                val chunk = json.decodeFromString<EntryChunk>(productionFixtures.getValue("$id/$chunkId.json"))
                assertEquals(chunkId, chunk.id)
                chunk.entries
            }
            val metadata = manifest.indexes.flatMap { indexId ->
                json.decodeFromString<ContentIndex>(productionFixtures.getValue("$id/$indexId.json")).entries
            }
            assertEquals(entries.map { it.id }, metadata.map { it.id })
            for (entry in entries) {
                assertTrue(entry.presentation.description.startsWith("<h1"))
                assertTrue(entry.presentation.publications.isNotEmpty())
                assertTrue(entry.coverage.limitations.isNotEmpty())
                assertNotEquals(CoverageStatus.SUPPORTED, entry.coverage.status)
                assertEquals(entry, json.decodeFromString<ContentEntry>(json.encodeToString(ContentEntry.serializer(), entry)))
            }
        }
    }

    @Test
    fun productionAdaptationsKeepSourceIdentityAndCoverage() {
        val json = ContractCodec.json
        fun entries(id: String): List<ContentEntry> {
            val manifest = assertIs<ContractResult.Available<PackageManifest>>(
                ContractCodec.decodeManifest(productionFixtures.getValue("$id/manifest.json"))
            ).value
            return manifest.chunks.flatMap { json.decodeFromString<EntryChunk>(productionFixtures.getValue("$id/$it.json")).entries }
        }
        val standard = entries("modern4e.proof").associateBy { it.id }
        assertEquals(listOf(Ability.STRENGTH), assertIs<ChoiceDefinition.MainAbility>(standard.getValue("class3").mechanics.choices.first()).abilities)
        assertEquals(Prerequisite.AbilityPoints(Ability.STRENGTH, 2), standard.getValue("feat338").mechanics.prerequisites.single())
        assertIs<Prerequisite.Unadapted>(standard.getValue("feat261").mechanics.prerequisites.single())
        assertEquals(Skill.entries.toSet(), assertIs<ChoiceDefinition.Proficiencies>(standard.getValue("feat166").mechanics.choices.single()).skills.toSet())
        assertEquals(Ability.INTELLIGENCE, Skill.MEDICINE.ability)
        assertEquals(Ability.INTELLIGENCE, Skill.SOCIETY.ability)
        assertEquals(Ability.INTELLIGENCE, Skill.CRAFTING.ability)
        assertEquals(Ability.WISDOM, Skill.RELIGION.ability)
        val override = entries("modern4e.proof.override").single()
        val original = standard.getValue(override.id)
        assertEquals(original.presentation, override.presentation)
        assertNotEquals(ContractCodec.fingerprint(original), ContractCodec.fingerprint(override))
    }
}
