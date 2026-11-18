package dev.modern4e.builder

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.test.*

class ContractTest {
    private val json = ContractCodec.json
    private fun character(): CharacterDocument = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(contractFixtures.getValue("character.json"))).value
    private fun chunk(): EntryChunk = json.decodeFromString(contractFixtures.getValue("chunk.json"))

    @Test
    fun featBrowseGroupingIsOptionalAndRoundTripsWithoutChangingLegacyMetadata() {
        val metadata = EntryMetadata("feat", EntryCategory.FEAT, "Feat", "chunk")
        val legacy = json.encodeToJsonElement(metadata).jsonObject
        assertFalse("featGroup" in legacy)
        assertNull(json.decodeFromJsonElement<EntryMetadata>(legacy).featGroup)
        for (group in FeatGroup.entries) {
            val grouped = metadata.copy(featGroup = group)
            assertEquals(grouped, json.decodeFromString<EntryMetadata>(json.encodeToString(grouped)))
        }
    }

    @Test
    fun goldenCharacterPreservesUnresolvedDecisions() {
        val document = character()
        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
        assertEquals(json.parseToJsonElement(contractFixtures.getValue("character.json")), json.parseToJsonElement(ContractCodec.encode(document)))
        val lost = document.levels.first().entries.last().selection
        assertEquals("Lost Custom Feat", lost.savedTitle)
        assertEquals("missing.custom", lost.supplierPackageId)
        assertEquals(lost, document.levels.last().replacements.single().replacement.selection)
        assertEquals("", document.manualAdjustments.single().reason)
    }

    @Test
    fun packageGoldenFilesRoundTrip() {
        for (name in listOf("package.json", "override-package.json")) {
            val source = contractFixtures.getValue(name)
            val manifest = assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(source)).value
            assertEquals(json.parseToJsonElement(source), json.encodeToJsonElement(manifest))
            assertIs<ContractResult.Unavailable>(ContractCodec.decodeManifest(source.replace("\"formatVersion\": 1", "\"formatVersion\": 3")))
        }
        for (name in listOf("chunk.json", "override-chunk.json")) {
            val source = contractFixtures.getValue(name)
            assertEquals(json.parseToJsonElement(source), json.encodeToJsonElement(json.decodeFromString<EntryChunk>(source)))
        }
        for ((indexFile, chunkFile) in listOf("index.json" to "chunk.json", "override-index.json" to "override-chunk.json")) {
            val source = contractFixtures.getValue(indexFile)
            val index = json.decodeFromString<ContentIndex>(source)
            assertEquals(json.parseToJsonElement(source), json.encodeToJsonElement(index))
            val chunk = json.decodeFromString<EntryChunk>(contractFixtures.getValue(chunkFile))
            assertEquals(chunk.entries.single().id, index.entries.single().id)
            assertEquals(chunk.entries.single().presentation.title, index.entries.single().title)
            assertEquals(chunk.id, index.entries.single().chunkId)
        }
    }

    @Test
    fun fingerprintsMatchIndependentGoldenAndDetectChanges() {
        val entry = chunk().entries.single()
        assertEquals(contractFixtures.getValue("fingerprint.txt").trim(), ContractCodec.fingerprint(entry))
        assertEquals(character().levels.first().entries.first().selection.acknowledgedFingerprint, ContractCodec.fingerprint(entry))
        val override = json.decodeFromString<EntryChunk>(contractFixtures.getValue("override-chunk.json")).entries.single()
        assertNotEquals(ContractCodec.fingerprint(entry), ContractCodec.fingerprint(override))
        assertNotEquals(ContractCodec.fingerprint(entry), ContractCodec.fingerprint(entry.copy(coverage = Coverage(CoverageStatus.UNIMPLEMENTED))))
        assertNotEquals(ContractCodec.fingerprint(entry), ContractCodec.fingerprint(entry.copy(mechanics = Mechanics())))
        assertEquals(ContractCodec.canonical(json.parseToJsonElement("{\"b\":1,\"a\":2}")), ContractCodec.canonical(json.parseToJsonElement("{\"a\":2,\"b\":1}")))
        assertNotEquals(ContractCodec.canonical(json.parseToJsonElement("[1,2]")), ContractCodec.canonical(json.parseToJsonElement("[2,1]")))
    }

    @Test
    fun sha256KnownVectorsIncludingMultiBlockPadding() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", sha256(byteArrayOf()))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256("abc".encodeToByteArray()))
        assertEquals("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0", sha256("a".repeat(1000000).encodeToByteArray()))
    }

    @Test
    fun slotsDistinguishRepeatedChoicesAndMultipleGrants() {
        val a = ChoiceSlotId("grant-a", "skill", 0)
        assertEquals(3, setOf(a, a.copy(ordinal = 1), a.copy(sourceInstanceId = "grant-b")).size)
        assertEquals(4, character().levels.first().proficiencies.map { it.slot }.toSet().size)
        assertEquals(character().levels.first().entries.first().instanceId, character().abilities.source.sourceInstanceId)
        assertNotEquals(character().levels.first().entries.last().instanceId, character().levels.last().replacements.single().replacement.instanceId)
        assertFailsWith<IllegalArgumentException> { a.copy(ordinal = -1) }
    }

    @Test
    fun modernSkillAndAbilityBaseline() {
        assertEquals(16, Skill.entries.size)
        assertEquals(Ability.INTELLIGENCE, Skill.MEDICINE.ability)
        assertEquals(Ability.INTELLIGENCE, Skill.SOCIETY.ability)
        assertEquals(Ability.WISDOM, Skill.RELIGION.ability)
        assertEquals(4, character().abilities.points[Ability.STRENGTH])
        assertEquals(5, character().abilities.points.filterKeys { it != Ability.STRENGTH }.values.sum())
        assertEquals(1, character().levels.last().abilityAdvancements.single().increases[Ability.CONSTITUTION])
    }

    @Test
    fun rejectsIncompatibleAndMalformedFilesWithoutLosingExistingData() {
        for (source in listOf("{}", "null", "{", "[]", ContractCodec.encode(character()).replace("\"formatVersion\":1", "\"formatVersion\":2"))) {
            assertIs<ContractResult.Unavailable>(ContractCodec.decode(source))
            assertIs<ContractResult.Unavailable>(ContractCodec.decodeManifest(source))
        }
        assertFailsWith<IllegalArgumentException> { character().copy(level = 31) }
        assertEquals(30, character().copy(level = 30).level)
        assertFailsWith<IllegalArgumentException> { LevelDecisions(0) }
        assertFailsWith<IllegalArgumentException> { character().copy(levels = listOf(LevelDecisions(1), LevelDecisions(1))) }
        assertFailsWith<IllegalArgumentException> { character().equipment.single().copy(quantity = 0) }
        assertIs<ContractResult.Unavailable>(ContractCodec.decode(ContractCodec.encode(character()).dropLast(1) + ",\"totals\":{}}"))
    }

    @Test
    fun unsupportedPrerequisitesAndUnavailableValuesRemainExplicit() {
        val mechanics = Mechanics(prerequisites = listOf(Prerequisite.Unadapted("Strength 13 (unadapted source prerequisite)")))
        assertEquals(mechanics, json.decodeFromString<Mechanics>(json.encodeToString(mechanics)))
        val unavailable: ContractResult<CalculatedValue> = ContractResult.Unavailable(listOf(Diagnostic("prerequisite.unadapted", DiagnosticKind.INCOMPLETE_AUTOMATION, "Requires adaptation")))
        assertEquals(unavailable, json.decodeFromString<ContractResult<CalculatedValue>>(json.encodeToString(unavailable)))
        assertFailsWith<IllegalArgumentException> { ContractResult.Unavailable(emptyList()) }
        assertFailsWith<IllegalArgumentException> { json.decodeFromString<Mechanics>("{\"prerequisites\":[{\"type\":\"script\",\"code\":\"anything\"}]}") }
    }
}
