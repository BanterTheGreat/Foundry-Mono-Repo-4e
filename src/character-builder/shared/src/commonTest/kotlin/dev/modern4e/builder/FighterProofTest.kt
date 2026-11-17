package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*
import kotlinx.serialization.json.*

/** Real generated packages and portable decisions, identical on JVM and JavaScript. */
class FighterProofTest {
    private val base = "modern4e.fighter-proof"
    private val override = "$base.override"
    private val source = object : ContentSource {
        override suspend fun listPackages() = ContractResult.Available(listOf(base, override).map {
            assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(productionFixtures.getValue("$it/manifest.json"))).value
        })
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<ContentIndex>(productionFixtures.getValue("$packageId/$indexId.json")))
        override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<EntryChunk>(productionFixtures.getValue("$packageId/$chunkId.json")))
    }

    private fun sample(level: Int, custom: Boolean) = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-fighter-$level-${if (custom) "override" else "base"}.json"))).value

    private suspend fun evaluate(document: CharacterDocument): EngineResult {
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, base, document.packages)).value
        for (selection in document.levels.flatMap { it.entries.map { it.selection } } + document.equipment.map { it.selection }) {
            val resolved = assertIs<ContractResult.Available<ResolvedEntry>>(catalog.resolve(selection)).value
            assertFalse(resolved.acknowledgmentRequired, selection.entryId)
        }
        return RulesEngine.evaluate(document, RulesContent.load(document, catalog))
    }

    @Test
    fun portableSamplesMatchHandCalculatedGoldensAndCoexist() = synchronous {
        val expected = ContractCodec.json.parseToJsonElement(contractFixtures.getValue("sample-coverage.json")).jsonObject.getValue("expected").jsonObject
        for (level in 1..2) {
            for (custom in listOf(false, true)) {
                val document = sample(level, custom)
                assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
                val result = evaluate(document)
                for (ability in Ability.entries) {
                    assertEquals(expected.getValue("abilities").jsonObject.getValue(ability.name).jsonPrimitive.int, total(result.ability(ability)))
                }
                for (skill in Skill.entries) {
                    val golden = expected.getValue("skills").jsonObject.getValue(skill.name).jsonPrimitive.int
                    assertEquals(golden + if (custom && level == 2 && skill == Skill.MEDICINE) 1 else 0, total(result.skill(skill)), "$level/$custom/$skill")
                }
                assertEquals(setOf(Skill.SOCIETY, Skill.CRAFTING, Skill.MEDICINE, Skill.RELIGION, Skill.ATHLETICS), result.proficiencies.keys)
                val medicine = assertIs<ContractResult.Available<CalculatedValue>>(result.skill(Skill.MEDICINE)).value
                assertTrue(medicine.contributors.any { it.label == "Manual Adjustment" && it.value == 2 })
                assertFalse(result.diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION || it.kind == DiagnosticKind.UNRESOLVED_CONTENT }, result.diagnostics.toString())
                assertTrue(result.diagnostics.any { it.code == "engine.coverage" && it.entryId == "race2" })
                assertTrue(result.diagnostics.any { it.code == "engine.coverage" && it.entryId == "power992" })
                assertTrue(result.diagnostics.any { it.code == "engine.coverage" && it.entryId == "armor8" })
                assertEquals(5, total(result.statistics.getValue(ModifierTarget(Statistic.SPEED)).value))
                assertEquals(level == 2, result.diagnostics.any { it.code == "engine.unadaptedPrerequisite" && it.entryId == "feat261" })
                assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value)
                assertEquals(if (level == 1) 5 else 6, result.entries.count { it.definition.entry.category == EntryCategory.POWER })
            }
        }
        // Re-evaluation after the overridden character must leave the base catalog independent.
        assertEquals(8, total(evaluate(sample(2, false)).skill(Skill.MEDICINE)))
    }

    @Test
    fun missingOverrideNeverFallsBackAndUnrelatedDecisionsSurviveExport() = synchronous {
        val document = sample(2, true)
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, base, emptyList())).value
        val result = RulesEngine.evaluate(document, RulesContent.load(document, catalog))
        assertIs<ContractResult.Unavailable>(result.skill(Skill.MEDICINE))
        assertTrue(result.diagnostics.any { it.code == "catalog.expectedSupplier" })
        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
    }

    private fun total(value: ContractResult<CalculatedValue>) = assertIs<ContractResult.Available<CalculatedValue>>(value).value.total

    private fun synchronous(block: suspend () -> Unit) {
        var completed = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                result.getOrThrow()
                completed = true
            }
        })
        assertTrue(completed)
    }
}
